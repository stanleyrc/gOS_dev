import {
  all,
  takeEvery,
  takeLatest,
  put,
  select,
  take,
  call,
} from "redux-saga/effects";
import { processDataInWorker } from "../../helpers/workers";
import { getCurrentState } from "./selectors";
import actions from "./actions";
import caseReportsActions from "../caseReports/actions";
import {
  buildAllDatasetsMetadata,
  distinctCaseRecords,
  resolveBrowseDataset,
} from "../../helpers/browseScope";
import {
  buildPopulationMaps,
  filterCaseReportRecords,
} from "../../helpers/caseReportsSearch";
import { loadDatasetManifest } from "../../helpers/staticManifests";
import { getActiveRepository } from "../../services/repositories";
import { canonicalizeInterpretationSummary } from "../../helpers/interpretationCaseIds";

const populationWorkerUrl = () =>
  `${window.location.href
    .split("?")[0]
    .replace(/\/[^/]*$/, "")}/workers/populationStatistics.worker.js`;

export function* fetchPopulationStatistics() {
  try {
    const currentState = yield select(getCurrentState);
    const { metadata } = currentState.CaseReport;
    const { populations } = currentState.CaseReports;
    const dataset = resolveBrowseDataset(currentState);
    const fields = dataset?.kpiFields || [];

    if (fields.length === 0) {
      yield put({ type: actions.FETCH_POPULATION_STATISTICS_MISSING });
      return;
    }

    const result = yield call(
      processDataInWorker,
      { populations, metadata, fields },
      populationWorkerUrl(),
    );
    const plots = [...(result.general || []), ...(result.tumor || [])];
    const hasRenderablePlot = plots.some(
      (plot) =>
        plot?.markValue != null && Number.isFinite(Number(plot.markValue)),
    );

    if (!hasRenderablePlot) {
      yield put({ type: actions.FETCH_POPULATION_STATISTICS_MISSING });
      return;
    }

    yield put({
      type: actions.FETCH_POPULATION_STATISTICS_SUCCESS,
      general: result.general,
      tumor: result.tumor,
    });
  } catch (error) {
    yield put({
      type: actions.FETCH_POPULATION_STATISTICS_FAILED,
      error,
    });
  }
}

function findFavorite(state, searchId) {
  return (state.CaseReports.favoriteSearches || []).find(
    (favorite) =>
      favorite.searchId === searchId || favorite.id === searchId,
  );
}

function* getFavoriteRecords(state, favorite) {
  const datasets = state.Datasets.records || [];
  const targetDatasets =
    favorite.datasetId == null
      ? datasets
      : datasets.filter(
          (dataset) => `${dataset.id}` === `${favorite.datasetId}`,
        );

  if (targetDatasets.length === 0) {
    throw new Error("SAVED_SEARCH_DATASET_NOT_AVAILABLE");
  }

  const records = [];
  for (let index = 0; index < targetDatasets.length; index += 1) {
    const dataset = targetDatasets[index];
    const cached = state.CaseReports.manifestRecordsByDataset?.[dataset.id];
    const datasetRecords = Array.isArray(cached)
      ? cached
      : yield call(loadDatasetManifest, dataset);
    records.push(...datasetRecords);
  }

  const metadata =
    favorite.datasetId == null
      ? buildAllDatasetsMetadata(targetDatasets)
      : targetDatasets[0];
  const selectedInterpretationFilters =
    favorite.searchFilters?.has_interpretations;
  let casesWithInterpretations;
  if (
    favorite.datasetId != null &&
    Array.isArray(selectedInterpretationFilters) &&
    selectedInterpretationFilters.length > 0
  ) {
    const repository = getActiveRepository({ dataset: targetDatasets[0] });
    const interpretationSummary = yield call(
      repository.getCasesWithInterpretations.bind(repository),
      targetDatasets[0].id,
    );
    casesWithInterpretations = canonicalizeInterpretationSummary(
      interpretationSummary,
      records,
    );
  }

  const searchableRecords = favorite.datasetId == null
    ? distinctCaseRecords(records)
    : records;

  return {
    metadata,
    records: filterCaseReportRecords(
      searchableRecords,
      favorite.searchFilters || {},
      metadata.fields || [],
      { casesWithInterpretations },
    ),
  };
}

export function* fetchCohortStatistics(action) {
  try {
    const currentState = yield select(getCurrentState);
    const searchId = action.searchId || currentState.CaseReports.currentSearchId;
    let dataset = resolveBrowseDataset(currentState);
    let records = currentState.CaseReports.totalReports || [];

    if (action.comparison) {
      const favorite = findFavorite(currentState, searchId);
      if (!favorite) throw new Error("SAVED_SEARCH_NOT_AVAILABLE");
      const savedResult = yield call(getFavoriteRecords, currentState, favorite);
      dataset = savedResult.metadata;
      records = savedResult.records;
    }

    if (!dataset || !searchId) {
      throw new Error("NO_SEARCH_ID_AVAILABLE");
    }

    const populations = buildPopulationMaps(
      records,
      dataset.kpiFields || [],
    );
    const fields = dataset.kpiFields || [];
    const result = yield call(
      processDataInWorker,
      {
        populations,
        metadata: action.comparison ? {} : currentState.CaseReport.metadata,
        fields,
      },
      populationWorkerUrl(),
    );

    yield put({
      type: actions.FETCH_COHORT_STATISTICS_SUCCESS,
      searchId,
      comparison: action.comparison,
      label: action.label,
      cohort: result.general,
    });
  } catch (error) {
    yield put({
      type: actions.FETCH_COHORT_STATISTICS_FAILED,
      searchId: action.searchId,
      comparison: action.comparison,
      error,
    });
  }
}

function* watchForManifestRefreshesWithOpenCase() {
  while (true) {
    yield take(caseReportsActions.FETCH_CASE_REPORTS_SUCCESS);
    const currentState = yield select(getCurrentState);
    const { metadata } = currentState.CaseReport;
    const { dataset, report } = currentState.Settings;
    const metadataMatchesSource =
      metadata?.datasetId == null ||
      `${metadata.datasetId}` === `${dataset?.id}`;

    if (report && metadata?.pair && metadataMatchesSource) {
      yield put({
        type: actions.FETCH_POPULATION_STATISTICS_REQUEST,
      });
    }
  }
}

function* watchForMultipleCohortActions() {
  while (true) {
    const action = yield take([
      caseReportsActions.FETCH_CASE_REPORTS_SUCCESS,
      caseReportsActions.CASE_REPORTS_MATCHED,
    ]);

    yield put({
      type: actions.FETCH_COHORT_STATISTICS_REQUEST,
      searchId: action.searchId,
    });
  }
}

function* actionWatcher() {
  yield takeLatest(
    actions.FETCH_POPULATION_STATISTICS_REQUEST,
    fetchPopulationStatistics,
  );
  yield takeEvery(
    actions.FETCH_COHORT_STATISTICS_REQUEST,
    fetchCohortStatistics,
  );
}

export default function* rootSaga() {
  yield all([
    actionWatcher(),
    watchForManifestRefreshesWithOpenCase(),
    watchForMultipleCohortActions(),
  ]);
}
