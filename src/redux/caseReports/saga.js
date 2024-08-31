import { all, takeEvery, put, call, select } from "redux-saga/effects";
import { getCurrentState } from "./selectors";
import axios from "axios";
import * as d3 from "d3";
import { reportFilters } from "../../helpers/utility";
import actions from "./actions";

function* fetchCaseReports() {
  try {
    // get the list of all cases from the public/datafiles.json
    let responseReports = yield call(axios.get, "datafiles.json");

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

    yield put({
      type: actions.FETCH_CASE_REPORTS_SUCCESS,
      datafiles,
      reportsFilters,
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

  let records = datafiles.sort((a, b) => d3.ascending(a.pair, b.pair));

  let page = searchFilters?.page || 1;
  let perPage = searchFilters?.per_page || 10;
  let actualSearchFilters = Object.fromEntries(
    Object.entries(searchFilters || {}).filter(
      ([key, value]) =>
        key !== "page" &&
        key !== "per_page" &&
        value !== null &&
        value !== undefined &&
        !(Array.isArray(value) && value.length === 0)
    )
  );

  Object.keys(actualSearchFilters).forEach((key) => {
    if (key === "texts") {
      records = records.filter((record) =>
        reportFilters()
          .map((attr) => record[attr] || "")
          .join(",")
          .toLowerCase()
          .includes(actualSearchFilters[key].toLowerCase())
      );
    } else {
      records = records.filter((d) =>
        actualSearchFilters[key].includes(d[key])
      );
    }
  });

  yield put({
    type: actions.CASE_REPORTS_MATCHED,
    reports: records.slice((page - 1) * perPage, page * perPage),
    totalReports: records.length,
  });
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_CASE_REPORTS_REQUEST, fetchCaseReports);
  yield takeEvery(actions.SEARCH_CASE_REPORTS, searchReports);
  yield takeEvery(actions.FETCH_CASE_REPORTS_SUCCESS, searchReports);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
