import { all, put, call, select, take, takeLatest } from "redux-saga/effects";
import { END } from "redux-saga";
import { getCurrentState } from "./selectors";
import { tableFromIPC } from "apache-arrow";
import * as d3 from "d3";
import {
  defaultSearchFilters,
  orderListViewFilters,
  datafilesArrowTableToJson,
} from "../../helpers/utility";
import {
  getReportsFilters,
  getInterpretationsFilter,
  reportFilters,
} from "../../helpers/filters";
import { getActiveRepository } from "../../services/repositories";
import { qcEvaluator } from "../../helpers/metadata";
import actions from "./actions";
import settingsActions from "../settings/actions";
import { createProgressChannel } from "../../helpers/progressChannel";

function* fetchCaseReports(action) {
  const currentState = yield select(getCurrentState);
  let { dataset } = currentState.Settings;

  // Set up the channel configuration
  const channelConfig = {
    url: dataset.datafilesPath,
    responseType: dataset.datafilesPath.endsWith(".arrow")
      ? "arraybuffer" // Ensure the response is in binary format
      : "json",
  };
  // Create the progress channel
  const progressChannel = yield call(createProgressChannel, channelConfig);

  try {
    while (true) {
      const result = yield take(progressChannel);

      // Channel was closed (END) – exit the loop
      if (result === END) {
        break;
      }

      if (result.response) {
        // The request completed successfully
        let datafiles = result.response.data;
        if (dataset.datafilesPath.endsWith(".arrow")) {
          try {
            const arrowBuffer = new Uint8Array(result.response.data);
            const table = yield call(tableFromIPC, arrowBuffer);
            datafiles = datafilesArrowTableToJson(table);
          } catch (err) {
            console.error("Failed to parse Arrow data:", err);
            yield put({
              type: actions.FETCH_CASE_REPORTS_FAILED,
              error: err,
            });
            return;
          }
        }

        datafiles.forEach(
          (d) => {
            d.tags = d.summary_tag
              ? d.summary_tag?.map((e) => `${e.key.trim()}: ${e.value.trim()}`)
              : d.summary
                  ?.split("\n")
                  .map((e) => e.trim())
                  .filter((e) => e.length > 0) || [];
            d.visibleTags = d.summary_tag
              ? d.summary_tag
                  .filter((e) => e.visible)
                  .map((e) => `${e.key.trim()}: ${e.value.trim()}`)
              : d.tags;
            d.qcEvaluation = qcEvaluator(d.qcMetrics || []);
          } // Ensure qcEvaluation is set for each report
        );

        const repository = getActiveRepository({ dataset });
        const casesWithInterpretations = yield call(
          repository.getCasesWithInterpretations.bind(repository),
          dataset.id
        );
        const interpretationsCounts = yield call(
          repository.getCasesInterpretationsCount.bind(repository),
          dataset.id
        );

        let reportsFilters = [];

        reportsFilters = getReportsFilters(dataset.fields, datafiles);

        const interpretationsFilter = getInterpretationsFilter(
          datafiles,
          casesWithInterpretations,
          dataset.fields
        );
        reportsFilters.push(interpretationsFilter);

        // let reportsFiltersExtents = getReportFilterExtents(datafiles);
        let reportsFiltersExtents = reportsFilters.reduce((acc, item) => {
          acc[item.filter.name] = item.extent;
          return acc;
        }, {});

        let { page, per_page } = defaultSearchFilters();
        let records = datafiles
          .filter((d) => d.visible !== false)
          .sort((a, b) => d3.ascending(a.pair, b.pair));

        let populations = {};
        let cohortPopulations = {};

        dataset.kpiFields.forEach((d, i) => {
          populations[d.id] = datafiles
            .map((e) => {
              try {
                return {
                  pair: e.pair,
                  value: eval(`e.${d.id}`),
                  tumor_type: e.tumor_type,
                };
              } catch (error) {
                return {
                  pair: e.pair,
                  value: null,
                  tumor_type: e.tumor_type,
                };
              }
            })
            .filter((item) => item.value != null && !isNaN(item.value));

          cohortPopulations[d.id] = records
            .map((e) => {
              try {
                return {
                  pair: e.pair,
                  value: eval(`e.${d.id}`),
                  tumor_type: e.tumor_type,
                };
              } catch (error) {
                return {
                  pair: e.pair,
                  value: null,
                  tumor_type: e.tumor_type,
                };
              }
            })
            .filter((item) => item.value != null && !isNaN(item.value));
        });

        yield put({
          type: actions.FETCH_CASE_REPORTS_SUCCESS,
          datafiles,
          populations,
          cohortPopulations,
          reportsFilters,
          casesWithInterpretations,
          interpretationsCounts,
          reports: records.slice((page - 1) * per_page, page * per_page),
          totalReports: records,
          reportsFiltersExtents,
        });
      } else if (result.error) {
        // The request failed
        console.error(result.error);
        yield put({
          type: actions.FETCH_CASE_REPORTS_FAILED,
          error: result.error,
        });
      } else {
        // Intermediate progress updates
        yield put({
          type: actions.FETCH_CASE_REPORTS_REQUEST_LOADING,
          loadingPercentage: result,
        });
      }
    }
  } catch (error) {
    // This catch only handles saga-level errors (e.g., from yield call/tableFromIPC),
    // not the Axios cancellation (which is handled inside the channel).
    console.log(error);
    yield put({
      type: actions.FETCH_CASE_REPORTS_FAILED,
      error,
    });
  } finally {
    // Ensure the channel is closed on both normal completion and cancellation.
    // Closing the channel triggers the Axios cancellation via the unsubscribe.
    try {
      progressChannel.close();
    } catch (e) {
      // no-op; channel may already be closed
    }
  }
}

/**
 * Apply filters based on external data sources (not stored on records)
 */
function applyExternalFilters(records, searchFilters, externalData) {
  const { casesWithInterpretations } = externalData;

  // Handle has_interpretations filter
  if (
    searchFilters.has_interpretations &&
    searchFilters.has_interpretations.length > 0
  ) {
    const selectedValues = searchFilters.has_interpretations;
    const operator = searchFilters["has_interpretations-operator"] || "OR";

    // Build sets of matching records for each selected criterion
    const matchingSets = selectedValues.map((value) => {
      const matchingRecords = new Set();

      // value is an array representing the cascader path
      const category = value[0];
      const specificValue = value.length > 1 ? value[1] : null;

      if (category === "tier_change") {
        records.forEach((r) => {
          if (casesWithInterpretations.withTierChange.has(r.pair)) {
            matchingRecords.add(r.pair);
          }
        });
      } else if (category === "author" && specificValue) {
        const authorCases =
          casesWithInterpretations.byAuthor.get(specificValue);
        if (authorCases) {
          records.forEach((r) => {
            if (authorCases.has(r.pair)) {
              matchingRecords.add(r.pair);
            }
          });
        }
      } else if (category === "gene" && specificValue) {
        const geneCases = casesWithInterpretations.byGene.get(specificValue);
        if (geneCases) {
          records.forEach((r) => {
            if (geneCases.has(r.pair)) {
              matchingRecords.add(r.pair);
            }
          });
        }
      } else if (category === "without") {
        records.forEach((r) => {
          if (!casesWithInterpretations.all.has(r.pair)) {
            matchingRecords.add(r.pair);
          }
        });
      }

      return matchingRecords;
    });

    // Apply operator logic
    if (operator === "OR") {
      // Union: include if in ANY of the sets
      const unionSet = new Set();
      matchingSets.forEach((set) => {
        set.forEach((pair) => unionSet.add(pair));
      });
      records = records.filter((r) => unionSet.has(r.pair));
    } else if (operator === "AND") {
      // Intersection: include only if in ALL sets
      if (matchingSets.length > 0) {
        records = records.filter((r) => {
          return matchingSets.every((set) => set.has(r.pair));
        });
      }
    } else if (operator === "NOT") {
      // Exclusion: include if NOT in any of the sets
      const unionSet = new Set();
      matchingSets.forEach((set) => {
        set.forEach((pair) => unionSet.add(pair));
      });
      records = records.filter((r) => !unionSet.has(r.pair));
    }
  }

  return records;
}

function* searchReports({ searchFilters }) {
  const currentState = yield select(getCurrentState);
  let { datafiles, casesWithInterpretations } = currentState.CaseReports;
  let { dataset } = currentState.Settings;

  // Always fetch fresh casesWithInterpretations and interpretationsCounts to ensure filters are up to date
  const repository = getActiveRepository({ dataset });
  casesWithInterpretations = yield call(
    repository.getCasesWithInterpretations.bind(repository),
    dataset.id
  );
  const interpretationsCounts = yield call(
    repository.getCasesInterpretationsCount.bind(repository),
    dataset.id
  );

  let records = datafiles.filter((d) => d.visible !== false);

  let page = searchFilters?.page || defaultSearchFilters().page;
  let perPage = searchFilters?.per_page || defaultSearchFilters().per_page;
  let orderId = searchFilters?.orderId || defaultSearchFilters().orderId;
  let { attribute, sort } = orderListViewFilters.find((d) => d.id === orderId);

  // Apply external filters first
  records = applyExternalFilters(records, searchFilters, {
    casesWithInterpretations,
  });

  // Apply record-based filters
  let actualSearchFilters = Object.fromEntries(
    Object.entries(searchFilters || {}).filter(
      ([key, value]) =>
        key !== "page" &&
        key !== "per_page" &&
        key !== "orderId" &&
        key !== "operator" &&
        !key.endsWith("-operator") &&
        value !== null &&
        value !== undefined &&
        !(Array.isArray(value) && value.length === 0)
    )
  );

  Object.keys(actualSearchFilters).forEach((key) => {
    const reportFilter = reportFilters().find((d) => d.name === key);
    // Fallback to reportFilters() if renderer not defined in dataset.fields
    let keyRenderer =
      dataset.fields.find((d) => d.name === key)?.renderer ||
      reportFilter?.renderer;

    // Skip external filters (handled separately)
    if (reportFilter?.external) {
      return;
    }

    if (key === "texts") {
      records = records
        .filter((record) =>
          dataset.fields
            .filter((e) => e.renderer === "select")
            .map((attr) => record[attr.name] || "")
            .join(",")
            .toLowerCase()
            .includes(actualSearchFilters[key].toLowerCase())
        )
        .sort((a, b) => {
          let aValue = null;
          let bValue = null;
          try {
            aValue = eval(`a.${attribute}`);
            bValue = eval(`b.${attribute}`);
          } catch (err) {}
          if (aValue == null) return 1;
          if (bValue == null) return -1;
          return sort === "ascending"
            ? d3.ascending(aValue, bValue)
            : d3.descending(aValue, bValue);
        });
    } else if (keyRenderer === "slider") {
      records = records.filter((d) => {
        let value = null;
        try {
          value = eval(`d.${key}`);
        } catch (err) {}
        if (value == null) return true;
        return (
          value >= actualSearchFilters[key][0] &&
          value <= actualSearchFilters[key][1]
        );
      });
    } else if (keyRenderer === "select") {
      records = records.filter((d) => {
        return actualSearchFilters[key].some((item) => {
          // If the filter value is the string "null", match records where d[key] is null or undefined
          if (item === "null") {
            return d[key] == null;
          }
          const itemArr = Array.isArray(item) ? item : [item];
          const dKeyArr = Array.isArray(d[key]) ? d[key] : [d[key]];
          return itemArr.some((i) => dKeyArr.includes(i));
        });
      });
    } else if (keyRenderer === "cascader") {
      const operator = (searchFilters?.operator || "OR").toUpperCase();
      const selectedItems = actualSearchFilters[key];
      const normalize = (value) => (Array.isArray(value) ? value : [value]);
      const matchesItem = (record, item) => {
        if (item === "null") {
          return record[key] == null;
        }
        const recordValues = normalize(record[key]);
        return normalize(item).some((value) => recordValues.includes(value));
      };

      const cascaderPredicates = {
        AND: (record) =>
          selectedItems.every((item) => matchesItem(record, item)),
        OR: (record) => selectedItems.some((item) => matchesItem(record, item)),
        NOT: (record) =>
          selectedItems.every((item) => !matchesItem(record, item)),
      };

      const applyPredicate =
        cascaderPredicates[operator] || cascaderPredicates.OR;
      records = records.filter(applyPredicate);
    }
  });

  records = records.sort((a, b) => {
    let aValue = null;
    let bValue = null;
    try {
      aValue = eval(`a.${attribute}`);
      bValue = eval(`b.${attribute}`);
    } catch (err) {}
    if (aValue == null) return 1;
    if (bValue == null) return -1;
    return sort === "ascending"
      ? d3.ascending(aValue, bValue)
      : d3.descending(aValue, bValue);
  });

  const reportsFilters = getReportsFilters(dataset.fields, datafiles);
  const interpretationsFilter = getInterpretationsFilter(
    datafiles,
    casesWithInterpretations,
    dataset.fields
  );
  reportsFilters.push(interpretationsFilter);

  let cohortPopulations = {};

  dataset.kpiFields.forEach((d, i) => {
    cohortPopulations[d.id] = records
      .map((e) => {
        try {
          return {
            pair: e.pair,
            value: eval(`e.${d.id}`),
            tumor_type: e.tumor_type,
          };
        } catch (error) {
          return {
            pair: e.pair,
            value: null,
            tumor_type: e.tumor_type,
          };
        }
      })
      .filter((item) => item.value != null && !isNaN(item.value));
  });

  yield put({
    type: actions.CASE_REPORTS_MATCHED,
    reports: records.slice((page - 1) * perPage, page * perPage),
    totalReports: records,
    cohortPopulations: cohortPopulations,
    reportsFilters: reportsFilters,
    casesWithInterpretations,
    interpretationsCounts,
  });
}

function* followUpCaseReportsMatched(action) {
  yield put({
    type: settingsActions.UPDATE_CASE_REPORT,
    report: null,
  });
}

function* actionWatcher() {
  yield takeLatest(actions.FETCH_CASE_REPORTS_REQUEST, fetchCaseReports);
  yield takeLatest(actions.SEARCH_CASE_REPORTS, searchReports);
  yield takeLatest(actions.CASE_REPORTS_MATCHED, followUpCaseReportsMatched);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
