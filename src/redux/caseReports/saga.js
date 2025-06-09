import {
  all,
  takeEvery,
  put,
  call,
  select,
  take,
  cancel,
} from "redux-saga/effects";
import { getCurrentState } from "./selectors";
import axios from "axios";
import { tableFromIPC } from "apache-arrow";
import * as d3 from "d3";
import {
  plotTypes,
  reportFilters,
  flip,
  reportAttributesMap,
  defaultSearchFilters,
  orderListViewFilters,
  datafilesArrowTableToJson,
} from "../../helpers/utility";
import actions from "./actions";
import settingsActions from "../settings/actions";
import { createProgressChannel } from "../../helpers/progressChannel";
import { getCancelToken } from "../../helpers/cancelToken";
import { is } from "immutable";

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
          (d) =>
            (d.tags =
              d.summary
                ?.split("\n")
                .map((e) => e.trim())
                .filter((e) => e.length > 0) || [])
        );

        let reportsFilters = [];

        // Iterate through each filter
        reportFilters().forEach((filter) => {
          // Extract distinct values for the current filter
          var distinctValues = [
            ...new Set(datafiles.map((record) => record[filter.name]).flat()),
          ].sort((a, b) => d3.ascending(a, b));

          // Add the filter information to the reportsFilters array
          reportsFilters.push({
            filter: filter,
            records: [...distinctValues],
            extent: d3.extent(
              distinctValues.filter(
                (e) => !isNaN(e) && e !== null && e !== undefined
              )
            ),
            format: plotTypes()[reportAttributesMap()[filter.name]]?.format,
          });
        });

        let populations = {};
        let flippedMap = flip(reportAttributesMap());
        Object.keys(plotTypes()).forEach((d, i) => {
          populations[d] = datafiles.map((e) => {
            try {
              return {
                pair: e.pair,
                value: eval(`e.${flippedMap[d]}`),
                tumor_type: e.tumor_type,
              };
            } catch (error) {
              return {
                pair: e.pair,
                value: null,
                tumor_type: e.tumor_type,
              };
            }
          });
        });

        let { page, per_page } = defaultSearchFilters();
        let records = datafiles
          .filter((d) => d.visible !== false)
          .sort((a, b) => d3.ascending(a.pair, b.pair));

        yield put({
          type: actions.FETCH_CASE_REPORTS_SUCCESS,
          datafiles,
          populations,
          reportsFilters,
          reports: records.slice((page - 1) * per_page, page * per_page),
          totalReports: records.length,
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
    console.log(error);
    if (axios.isCancel(error)) {
      console.log(`fetch ${channelConfig.url} request canceled`, error.message);
    } else {
      yield put({
        type: actions.FETCH_CASE_REPORTS_FAILED,
        error,
      });
    }
  } finally {
    progressChannel.close();
  }
}

function* searchReports({ searchFilters }) {
  const currentState = yield select(getCurrentState);
  let { datafiles } = currentState.CaseReports;

  let records = datafiles.filter((d) => d.visible !== false);

  let page = searchFilters?.page || defaultSearchFilters().page;
  let perPage = searchFilters?.per_page || defaultSearchFilters().per_page;
  let orderId = searchFilters?.orderId || defaultSearchFilters().orderId;
  let { attribute, sort } = orderListViewFilters.find((d) => d.id === orderId);
  let flippedMap = flip(reportAttributesMap());
  let actualSearchFilters = Object.fromEntries(
    Object.entries(searchFilters || {}).filter(
      ([key, value]) =>
        key !== "page" &&
        key !== "per_page" &&
        key !== "orderId" &&
        value !== null &&
        value !== undefined &&
        !(Array.isArray(value) && value.length === 0)
    )
  );

  Object.keys(actualSearchFilters).forEach((key) => {
    let keyRenderer = reportFilters().find((d) => d.name === key)?.renderer;
    if (key === "texts") {
      records = records
        .filter((record) =>
          reportFilters()
            .map((attr) => record[attr] || "")
            .join(",")
            .toLowerCase()
            .includes(actualSearchFilters[key].toLowerCase())
        )
        .sort((a, b) => {
          if (a[flippedMap[attribute]] == null) return 1;
          if (b[flippedMap[attribute]] == null) return -1;
          return sort === "ascending"
            ? d3.ascending(a[flippedMap[attribute]], b[flippedMap[attribute]])
            : d3.descending(a[flippedMap[attribute]], b[flippedMap[attribute]]);
        });
    } else {
      if (keyRenderer === "slider") {
        records = records.filter((d) => {
          const value = d[key];
          if (value == null) return true;
          return (
            value >= actualSearchFilters[key][0] &&
            value <= actualSearchFilters[key][1]
          );
        });
      } else {
        records = records.filter((d) => {
          return actualSearchFilters[key].some((item) => {
            const itemArr = Array.isArray(item) ? item : [item];
            const dKeyArr = Array.isArray(d[key]) ? d[key] : [d[key]];
            return itemArr.some((i) => dKeyArr.includes(i));
          });
        });
      }
    }
  });

  records = records.sort((a, b) => {
    if (a[flippedMap[attribute]] == null) return 1;
    if (b[flippedMap[attribute]] == null) return -1;
    return d3[sort](a[flippedMap[attribute]], b[flippedMap[attribute]]);
  });

  yield put({
    type: actions.CASE_REPORTS_MATCHED,
    reports: records.slice((page - 1) * perPage, page * perPage),
    totalReports: records.length,
  });
}

function* followUpCaseReportsMatched(action) {
  yield put({
    type: settingsActions.UPDATE_CASE_REPORT,
    report: null,
  });
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_CASE_REPORTS_REQUEST, fetchCaseReports);
  yield takeEvery(actions.SEARCH_CASE_REPORTS, searchReports);
  yield takeEvery(actions.CASE_REPORTS_MATCHED, followUpCaseReportsMatched);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
