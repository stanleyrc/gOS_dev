import { all, takeEvery, put, call, select } from "redux-saga/effects";
import { getCurrentState } from "./selectors";
import axios from "axios";
import * as d3 from "d3";
import {
  plotTypes,
  reportFilters,
  flip,
  reportAttributesMap,
  defaultSearchFilters,
  orderListViewFilters,
} from "../../helpers/utility";
import actions from "./actions";
import settingsActions from "../settings/actions";

function* fetchCaseReports() {
  try {
    const currentState = yield select(getCurrentState);
    let { dataset } = currentState.Settings;
    // get the list of all cases from the public/datafiles.json
    let responseReports = yield call(axios.get, dataset.datafilesPath);

    let datafiles = responseReports.data;

    let reportsFilters = [];

    // Iterate through each filter
    reportFilters().forEach((filter) => {
      // Extract distinct values for the current filter
      var distinctValues = [
        ...new Set(datafiles.map((record) => record[filter])),
      ].sort((a, b) => d3.ascending(a, b));

      // Add the filter information to the reportsFilters array
      reportsFilters.push({
        filter: filter,
        records: [...distinctValues],
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
  } catch (error) {
    yield put({
      type: actions.FETCH_CASE_REPORTS_FAILED,
      error,
    });
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
      records = records.filter((d) =>
        actualSearchFilters[key].includes(d[key])
      );
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
