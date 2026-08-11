import {
  all,
  put,
  call,
  select,
  take,
  takeLatest,
} from "redux-saga/effects";
import { END } from "redux-saga";
import { getCurrentState } from "./selectors";
import { defaultSearchFilters } from "../../helpers/utility";
import {
  getReportsFilters,
  getInterpretationsFilter,
} from "../../helpers/filters";
import { getActiveRepository } from "../../services/repositories";
import actions from "./actions";
import settingsActions from "../settings/actions";
import datasetsActions from "../datasets/actions";
import interpretationsActions from "../interpretations/actions";
import { createProgressChannel } from "../../helpers/progressChannel";
import {
  createLocalSearchId,
  emptyInterpretationSummary,
  buildPopulationMaps,
  searchCaseReportRecords,
} from "../../helpers/caseReportsSearch";
import {
  distinctCaseRecords,
  getBrowseScopeDatasetId,
  isAllDatasetsBrowseScope,
  resolveBrowseDataset,
  resolveBrowseDatasets,
} from "../../helpers/browseScope";
import {
  getManifestRequestConfig,
  parseManifestResponse,
} from "../../helpers/staticManifests";
import {
  deleteSavedSearch,
  getBrowserStorage,
  readSavedSearches,
  upsertSavedSearch,
  writeSavedSearches,
} from "../../helpers/savedSearches";
import { getCurrentUserId } from "../../helpers/userAuth";
import {
  canonicalizeInterpretationCounts,
  canonicalizeInterpretationSummary,
} from "../../helpers/interpretationCaseIds";

export function* fetchManifestWithProgress(dataset, index, datasetCount) {
  const channel = yield call(createProgressChannel, {
    url: dataset.datafilesPath,
    ...getManifestRequestConfig(dataset),
  });

  try {
    while (true) {
      const result = yield take(channel);
      if (result === END) break;

      if (result.response) {
        return yield call(parseManifestResponse, result.response.data, dataset);
      }
      if (result.error) throw result.error;

      const manifestProgress = Number(result);
      const loadingPercentage = Number.isFinite(manifestProgress)
        ? Math.round(
            ((index + manifestProgress / 100) / datasetCount) * 100,
          )
        : Infinity;
      yield put({
        type: actions.FETCH_CASE_REPORTS_REQUEST_LOADING,
        loadingPercentage,
      });
    }
  } finally {
    try {
      channel.close();
    } catch (error) {
      // The progress channel may already be closed by the request.
    }
  }

  return [];
}

function* loadInterpretationState(dataset, globalScope, records = []) {
  if (globalScope) {
    return [emptyInterpretationSummary(), new Map()];
  }

  const repository = getActiveRepository({ dataset });
  const [summary, counts] = yield all([
    call(
      repository.getCasesWithInterpretations.bind(repository),
      dataset.id,
    ),
    call(
      repository.getCasesInterpretationsCount.bind(repository),
      dataset.id,
    ),
  ]);
  return [
    canonicalizeInterpretationSummary(summary, records),
    canonicalizeInterpretationCounts(counts, records),
  ];
}

const buildFilterState = (
  dataset,
  datasets,
  datafiles,
  casesWithInterpretations,
  globalScope,
) => {
  const reportsFilters = getReportsFilters(dataset.fields || [], datafiles, {
    dataset,
    datasets,
  });
  if (!globalScope) {
    reportsFilters.push(
      getInterpretationsFilter(
        datafiles,
        casesWithInterpretations,
        dataset.fields,
      ),
    );
  }

  return {
    reportsFilters,
    reportsFiltersExtents: reportsFilters.reduce((acc, item) => {
      if (item?.filter?.name) acc[item.filter.name] = item.extent;
      return acc;
    }, {}),
  };
};

const getReusableStaticReportsFilters = (
  previousReportsFilters = [],
  fields = [],
) => {
  const staticFilterNames = fields
    .filter((field) => !field.external)
    .map((field) => field.name);
  const previousStaticFilters = previousReportsFilters.filter(
    (item) => !item?.filter?.external,
  );

  if (previousStaticFilters.length !== staticFilterNames.length) {
    return null;
  }

  const hasSameFilters = staticFilterNames.every(
    (name, index) => previousStaticFilters[index]?.filter?.name === name,
  );
  return hasSameFilters ? previousStaticFilters : null;
};

const buildSearchFilterState = (
  dataset,
  datasets,
  datafiles,
  casesWithInterpretations,
  globalScope,
  previousReportsFilters,
) => {
  const staticReportsFilters = getReusableStaticReportsFilters(
    previousReportsFilters,
    dataset.fields || [],
  );

  if (!staticReportsFilters) {
    return buildFilterState(
      dataset,
      datasets,
      datafiles,
      casesWithInterpretations,
      globalScope,
    );
  }

  const reportsFilters = [...staticReportsFilters];
  if (!globalScope) {
    reportsFilters.push(
      getInterpretationsFilter(
        datafiles,
        casesWithInterpretations,
        dataset.fields,
      ),
    );
  }

  return { reportsFilters };
};

export function* fetchCaseReports(action = {}) {
  const currentState = yield select(getCurrentState);
  const browseDataset = resolveBrowseDataset(currentState);
  const datasets = resolveBrowseDatasets(currentState);
  const globalScope = isAllDatasetsBrowseScope(
    currentState.Settings.browseScope,
  );
  const searchFilters =
    action.searchFilters ||
    currentState.CaseReports.searchFilters ||
    defaultSearchFilters();

  if (!browseDataset || datasets.length === 0) {
    yield put({
      type: actions.FETCH_CASE_REPORTS_FAILED,
      error: new Error("NO_BROWSE_SCOPE_SELECTED"),
      searchFilters,
    });
    return;
  }

  try {
    const manifestRecordsByDataset = {};
    for (let index = 0; index < datasets.length; index += 1) {
      const dataset = datasets[index];
      const cachedRecords =
        currentState.CaseReports.manifestRecordsByDataset?.[dataset.id];
      manifestRecordsByDataset[dataset.id] = Array.isArray(cachedRecords)
        ? cachedRecords
        : yield call(
            fetchManifestWithProgress,
            dataset,
            index,
            datasets.length,
          );
    }

    const manifestRecords = datasets
      .map((dataset) => manifestRecordsByDataset[dataset.id] || [])
      .flat();
    const datafiles = globalScope
      ? distinctCaseRecords(manifestRecords)
      : manifestRecords;
    const [casesWithInterpretations, interpretationsCounts] = yield call(
      loadInterpretationState,
      datasets[0],
      globalScope,
      datafiles,
    );
    const fieldContext = {
      casesWithInterpretations,
      dataset: browseDataset,
      datasets,
    };
    const { matchedRecords, pageRecords } = searchCaseReportRecords(
      datafiles,
      searchFilters,
      browseDataset.fields || [],
      fieldContext,
    );
    const { reportsFilters, reportsFiltersExtents } = buildFilterState(
      browseDataset,
      datasets,
      datafiles,
      casesWithInterpretations,
      globalScope,
    );

    yield put({
      type: actions.FETCH_CASE_REPORTS_SUCCESS,
      searchId: createLocalSearchId(),
      datafiles,
      manifestRecordsByDataset,
      populations: buildPopulationMaps(
        datafiles,
        browseDataset.kpiFields || [],
        fieldContext,
      ),
      cohortPopulations: buildPopulationMaps(
        matchedRecords,
        browseDataset.kpiFields || [],
        fieldContext,
      ),
      reportsFilters,
      casesWithInterpretations,
      interpretationsCounts,
      reports: pageRecords,
      totalReports: matchedRecords,
      totalReportsCount: matchedRecords.length,
      reportsFiltersExtents,
    });
  } catch (error) {
    yield put({
      type: actions.FETCH_CASE_REPORTS_FAILED,
      error,
      searchFilters,
    });
  }
}

export function* searchReports({ searchFilters }) {
  const currentState = yield select(getCurrentState);
  const { datafiles } = currentState.CaseReports;
  const browseDataset = resolveBrowseDataset(currentState);
  const datasets = resolveBrowseDatasets(currentState);
  const globalScope = isAllDatasetsBrowseScope(
    currentState.Settings.browseScope,
  );

  if (!browseDataset || datasets.length === 0) {
    yield put({
      type: actions.FETCH_CASE_REPORTS_FAILED,
      error: new Error("NO_BROWSE_SCOPE_SELECTED"),
      searchFilters,
      preserveBrowseData: true,
    });
    return;
  }

  try {
    const [casesWithInterpretations, interpretationsCounts] = yield call(
      loadInterpretationState,
      datasets[0],
      globalScope,
      datafiles,
    );
    const fieldContext = {
      casesWithInterpretations,
      dataset: browseDataset,
      datasets,
    };
    const { matchedRecords, pageRecords } = searchCaseReportRecords(
      datafiles,
      searchFilters,
      browseDataset.fields || [],
      fieldContext,
    );
    const { reportsFilters } = buildSearchFilterState(
      browseDataset,
      datasets,
      datafiles,
      casesWithInterpretations,
      globalScope,
      currentState.CaseReports.reportsFilters,
    );

    yield put({
      type: actions.CASE_REPORTS_MATCHED,
      searchId: createLocalSearchId(),
      reports: pageRecords,
      totalReports: matchedRecords,
      totalReportsCount: matchedRecords.length,
      cohortPopulations: buildPopulationMaps(
        matchedRecords,
        browseDataset.kpiFields || [],
        fieldContext,
      ),
      reportsFilters,
      casesWithInterpretations,
      interpretationsCounts,
    });
  } catch (error) {
    yield put({
      type: actions.FETCH_CASE_REPORTS_FAILED,
      error,
      searchFilters,
      preserveBrowseData: true,
    });
  }
}

export function* refreshInterpretationFilters() {
  const currentState = yield select(getCurrentState);
  const browseDataset = resolveBrowseDataset(currentState);
  const datasets = resolveBrowseDatasets(currentState);
  const globalScope = isAllDatasetsBrowseScope(
    currentState.Settings.browseScope,
  );
  const datafiles = currentState.CaseReports.datafiles || [];

  if (globalScope || !browseDataset || datasets.length === 0) return;

  try {
    const [casesWithInterpretations, interpretationsCounts] = yield call(
      loadInterpretationState,
      datasets[0],
      false,
      datafiles,
    );
    const { reportsFilters } = buildSearchFilterState(
      browseDataset,
      datasets,
      datafiles,
      casesWithInterpretations,
      false,
      currentState.CaseReports.reportsFilters,
    );

    yield put({
      type: actions.INTERPRETATION_FILTERS_REFRESHED,
      reportsFilters,
      casesWithInterpretations,
      interpretationsCounts,
    });
  } catch (error) {
    console.error("Failed to refresh interpretation filters:", error);
  }
}

export function* fetchFavoriteSearches() {
  try {
    const ownerId = yield call(getCurrentUserId);
    const favoriteSearches = yield call(
      readSavedSearches,
      undefined,
      ownerId,
    );
    yield put({
      type: actions.FETCH_FAVORITE_SEARCHES_SUCCESS,
      favoriteSearches,
    });
  } catch (error) {
    yield put({
      type: actions.FETCH_FAVORITE_SEARCHES_FAILED,
      error,
    });
  }
}

export function* saveFavoriteSearch(action) {
  const currentState = yield select(getCurrentState);
  const { browseScope } = currentState.Settings;
  const {
    currentSearchId,
    favoriteSearches,
    searchFilters: currentSearchFilters,
    totalReportsCount,
  } = currentState.CaseReports;
  const searchId = action.searchId || currentSearchId;

  if (!searchId) {
    yield put({
      type: actions.SAVE_FAVORITE_SEARCH_FAILED,
      error: new Error("NO_SEARCH_ID_AVAILABLE"),
    });
    return;
  }

  try {
    const ownerId = yield call(getCurrentUserId);
    const storage = yield call(getBrowserStorage);
    const persistedFavoriteSearches = storage
      ? yield call(readSavedSearches, storage, ownerId)
      : favoriteSearches;
    const result = upsertSavedSearch(
      {
        id: action.id,
        searchId,
        name: action.name,
        description: action.description,
        resultCount: action.resultCount ?? totalReportsCount,
        searchFilters: action.searchFilters || currentSearchFilters,
        datasetId:
          action.datasetId === undefined
            ? getBrowseScopeDatasetId(browseScope)
            : action.datasetId,
        createdAt: action.createdAt,
      },
      persistedFavoriteSearches,
    );
    yield call(
      writeSavedSearches,
      result.savedSearches,
      storage,
      ownerId,
    );
    yield put({
      type: actions.SAVE_FAVORITE_SEARCH_SUCCESS,
      favoriteSearch: result.savedSearch,
      favoriteSearches: result.savedSearches,
    });
  } catch (error) {
    yield put({
      type: actions.SAVE_FAVORITE_SEARCH_FAILED,
      error,
    });
  }
}

export function* deleteFavoriteSearch({ favoriteId }) {
  const currentState = yield select(getCurrentState);

  try {
    const ownerId = yield call(getCurrentUserId);
    const storage = yield call(getBrowserStorage);
    const existingFavoriteSearches = storage
      ? yield call(readSavedSearches, storage, ownerId)
      : currentState.CaseReports.favoriteSearches;
    const favoriteSearches = deleteSavedSearch(
      existingFavoriteSearches,
      favoriteId,
    );
    yield call(writeSavedSearches, favoriteSearches, storage, ownerId);
    yield put({
      type: actions.DELETE_FAVORITE_SEARCH_SUCCESS,
      favoriteId,
      favoriteSearches,
    });
  } catch (error) {
    yield put({
      type: actions.DELETE_FAVORITE_SEARCH_FAILED,
      error,
    });
  }
}

export function* applyFavoriteSearch({ favoriteId }) {
  const currentState = yield select(getCurrentState);
  const favoriteSearch = currentState.CaseReports.favoriteSearches.find(
    (candidate) => candidate.id === favoriteId,
  );
  if (!favoriteSearch) return;

  const searchFilters = {
    ...favoriteSearch.searchFilters,
    page: 1,
    per_page: favoriteSearch.searchFilters?.per_page || 10,
    orderId:
      favoriteSearch.searchFilters?.orderId ||
      defaultSearchFilters().orderId,
  };

  if (favoriteSearch.datasetId == null) {
    yield put(datasetsActions.selectAllDatasets({ searchFilters }));
  } else {
    yield put(
      datasetsActions.selectDataset(favoriteSearch.datasetId, null, {
        searchFilters,
      }),
    );
  }
}

function* followUpCaseReportsMatched() {
  yield put(settingsActions.updateCaseReport(null));
}

function* refreshDetailInterpretationsAfterManifestLoad() {
  const currentState = yield select(getCurrentState);
  const report = currentState.Settings.report;
  if (report) {
    yield put(interpretationsActions.fetchInterpretationsForCase(report));
  }
}

export function* fetchOrCancelCaseReports(action) {
  if (action.type !== actions.FETCH_CASE_REPORTS_REQUEST) return;
  yield call(fetchCaseReports, action);
}

export function* searchOrCancelCaseReports(action) {
  if (action.type !== actions.SEARCH_CASE_REPORTS) return;
  const currentState = yield select(getCurrentState);
  if (currentState.CaseReports.loading) return;
  yield call(searchReports, action);
}

const fetchWorkActions = [
  actions.FETCH_CASE_REPORTS_REQUEST,
  actions.CANCEL_CASE_REPORTS_FETCH,
];
const searchWorkActions = [
  actions.SEARCH_CASE_REPORTS,
  actions.FETCH_CASE_REPORTS_REQUEST,
  actions.CANCEL_CASE_REPORTS_FETCH,
];

function* actionWatcher() {
  yield takeLatest(fetchWorkActions, fetchOrCancelCaseReports);
  yield takeLatest(searchWorkActions, searchOrCancelCaseReports);
  yield takeLatest(
    actions.REFRESH_INTERPRETATION_FILTERS,
    refreshInterpretationFilters,
  );
  yield takeLatest(
    actions.FETCH_FAVORITE_SEARCHES_REQUEST,
    fetchFavoriteSearches,
  );
  yield takeLatest(actions.SAVE_FAVORITE_SEARCH_REQUEST, saveFavoriteSearch);
  yield takeLatest(
    actions.DELETE_FAVORITE_SEARCH_REQUEST,
    deleteFavoriteSearch,
  );
  yield takeLatest(actions.APPLY_FAVORITE_SEARCH, applyFavoriteSearch);
  yield takeLatest(
    actions.FETCH_CASE_REPORTS_SUCCESS,
    refreshDetailInterpretationsAfterManifestLoad,
  );
  yield takeLatest(actions.CASE_REPORTS_MATCHED, followUpCaseReportsMatched);
}

export default function* rootSaga() {
  yield all([actionWatcher()]);
}
