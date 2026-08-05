import { all, takeEvery, takeLatest, put, call, select } from "redux-saga/effects";
import { getCurrentState } from "./selectors";
import axios from "axios";
import actions from "./actions";
import settingsActions from "../settings/actions";
import Field from "../../helpers/field";
import {
  allDatasetsBrowseScope,
  ALL_DATASETS_ROUTE_VALUE,
  isAllDatasetsBrowseScope,
} from "../../helpers/browseScope";

export const normalizeDataset = (dataset, settings) => {
  const reference = dataset.reference || "hg19";
  const fields = dataset.schema
    ? (dataset.schema || [])
        .map((field) => new Field(field))
        .filter((field) => field.isValid)
    : settings.fields.map((field) => new Field(field));

  return {
    ...dataset,
    reference,
    higlassReference:
      settings.coordinates.higlassMap[reference] || reference || "hg19",
    fields,
    kpiFields: fields.filter((field) => field.kpiPlot === true),
  };
};

function* fetchDatasets() {
  try {
    const currentState = yield select(getCurrentState);
    const { data: settings } = currentState.Settings;
    const responseDatasets = yield call(axios.get, "datasets.json");
    const records = (responseDatasets.data || []).map((dataset) =>
      normalizeDataset(dataset, settings),
    );

    if (records.length === 0) {
      throw new Error("NO_DATASETS_AVAILABLE");
    }

    yield put({
      type: actions.FETCH_DATASETS_SUCCESS,
      records,
    });
  } catch (error) {
    yield put({
      type: actions.FETCH_DATASETS_FAILED,
      error,
    });
  }
}

export function* followUpDatasetsFetched(action) {
  const records = action.records || [];
  const searchParams = new URL(decodeURI(document.location)).searchParams;
  const datasetId = searchParams.get("dataset");
  const requestedReport = searchParams.get("report");
  const requestedDataset = records.find(
    (dataset) => `${dataset.id}` === `${datasetId}`,
  );

  if (records.length === 0) {
    yield put({
      type: actions.FETCH_DATASETS_FAILED,
      error: new Error("NO_DATASETS_AVAILABLE"),
    });
    return;
  }

  if (searchParams.get("scope") === ALL_DATASETS_ROUTE_VALUE) {
    yield put(actions.selectAllDatasets());
    if (requestedDataset && requestedReport) {
      yield put(
        actions.openCaseReport(requestedDataset.id, requestedReport, {
          keepBrowseFetch: true,
        }),
      );
    }
    return;
  }

  const dataset = requestedDataset || records[0];
  const report = datasetId && !requestedDataset ? null : requestedReport;
  yield put(actions.selectDataset(dataset.id, report));
}

export function* selectDataset(action) {
  const currentState = yield select(getCurrentState);
  const dataset = (currentState.Datasets.records || []).find(
    (candidate) => `${candidate.id}` === `${action.datasetId}`,
  );

  if (!dataset) {
    yield put({
      type: actions.SELECT_DATASET_FAILED,
      error: new Error("DATASET_NOT_AVAILABLE"),
    });
    return;
  }

  yield put(
    settingsActions.updateDataset(dataset, action.report, {
      searchFilters: action.searchFilters,
    }),
  );
}

export function* selectAllDatasets(action) {
  yield put(
    settingsActions.updateBrowseScope(allDatasetsBrowseScope(), {
      searchFilters: action.searchFilters,
      listViewTarget: action.listViewTarget,
    }),
  );
}

export function* openCaseReport(action) {
  const currentState = yield select(getCurrentState);
  const dataset = (currentState.Datasets.records || []).find(
    (candidate) => `${candidate.id}` === `${action.datasetId}`,
  );

  if (!dataset) {
    yield put({
      type: actions.SELECT_DATASET_FAILED,
      error: new Error("SOURCE_DATASET_NOT_AVAILABLE"),
    });
    return;
  }

  const preservesGlobalScope = isAllDatasetsBrowseScope(
    currentState.Settings.browseScope,
  );
  const changesDataset =
    `${currentState.Settings.dataset?.id}` !== `${action.datasetId}`;
  const preserveBrowseScope = preservesGlobalScope || !changesDataset;
  const keepInitialGlobalFetch =
    action.keepBrowseFetch === true ||
    (preservesGlobalScope &&
      currentState.CaseReports?.loading &&
      (currentState.CaseReports?.datafiles || []).length === 0);

  yield put(
    settingsActions.updateDataset(dataset, action.caseReportId, {
      preserveBrowseScope,
      refreshBrowseResults: !preserveBrowseScope,
      cancelBrowseWork: !keepInitialGlobalFetch,
    }),
  );
}

function* actionWatcher() {
  yield takeLatest(actions.FETCH_DATASETS_REQUEST, fetchDatasets);
  yield takeEvery(actions.FETCH_DATASETS_SUCCESS, followUpDatasetsFetched);
  yield takeLatest(actions.SELECT_DATASET_REQUEST, selectDataset);
  yield takeLatest(actions.SELECT_ALL_DATASETS_REQUEST, selectAllDatasets);
  yield takeLatest(actions.OPEN_CASE_REPORT_REQUEST, openCaseReport);
}

export default function* rootSaga() {
  yield all([actionWatcher()]);
}
