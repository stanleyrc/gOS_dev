import { all, takeEvery, put, select, take } from "redux-saga/effects";
import { getPopulationMetrics } from "../../helpers/utility";
import { getCurrentState } from "./selectors";
import actions from "./actions";
import caseReportActions from "../caseReport/actions";
import caseReportsActions from "../caseReports/actions";

function* fetchPopulationStatistics(action) {
  try {
    const currentState = yield select(getCurrentState);
    const { metadata } = currentState.CaseReport;
    let { populations } = currentState.CaseReports;

    yield put({
      type: actions.FETCH_POPULATION_STATISTICS_SUCCESS,
      general: getPopulationMetrics(populations, metadata),
      tumor: getPopulationMetrics(populations, metadata, metadata.tumor),
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
