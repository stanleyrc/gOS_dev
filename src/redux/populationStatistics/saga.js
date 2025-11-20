import { all, takeEvery, put, select, take, call } from "redux-saga/effects";
import { processDataInWorker } from "../../helpers/workers";
import { getCurrentState } from "./selectors";
import actions from "./actions";
import caseReportActions from "../caseReport/actions";
import caseReportsActions from "../caseReports/actions";

function* fetchPopulationStatistics(action) {
  try {
    const currentState = yield select(getCurrentState);
    const { metadata } = currentState.CaseReport;
    let { populations } = currentState.CaseReports;
    let { dataset } = currentState.Settings;
    let { kpiFields } = dataset;

    // Use Web Worker for population metrics computation
    const computationResult = yield call(
      processDataInWorker,
      {
        populations,
        metadata,
        fields: kpiFields,
      },
      `${window.location.href
        .split("?")[0]
        .replace(/\/[^/]*$/, "")}/workers/populationStatistics.worker.js`
    );

    const { general, tumor } = computationResult;

    yield put({
      type: actions.FETCH_POPULATION_STATISTICS_SUCCESS,
      general,
      tumor,
    });
  } catch (error) {
    yield put({
      type: actions.FETCH_POPULATION_STATISTICS_FAILED,
      error,
    });
  }
}

function* watchForMultipleActions() {
  yield all([
    take(caseReportsActions.FETCH_CASE_REPORTS_SUCCESS),
    take(caseReportActions.FETCH_CASE_REPORT_SUCCESS),
  ]);

  yield put({
    type: actions.FETCH_POPULATION_STATISTICS_REQUEST,
  });
}

function* actionWatcher() {
  yield takeEvery(
    actions.FETCH_POPULATION_STATISTICS_REQUEST,
    fetchPopulationStatistics
  );
}
export default function* rootSaga() {
  yield all([actionWatcher(), watchForMultipleActions()]);
}
