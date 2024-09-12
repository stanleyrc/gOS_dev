import { all, takeEvery, put, call } from "redux-saga/effects";
import { loadArrowTable } from "../../helpers/utility";
import actions from "./actions";
import caseReportActions from "../caseReport/actions";

function* fetchArrowData(plot) {
  yield loadArrowTable(plot.path)
    .then((results) => (plot.data = results))
    .catch((error) => {
      console.log(plot.path, error);
      plot.data = null;
    });
}

function* fetchCoverageData(action) {
  let { pair } = action;

  try {
    let coveragePlot = {
      path: `data/${pair}/coverage.arrow`,
      data: null,
    };
    yield call(fetchArrowData, coveragePlot);

    yield put({
      type: actions.FETCH_COVERAGE_DATA_SUCCESS,
      data: coveragePlot.data,
    });
  } catch (error) {
    yield put({
      type: actions.FETCH_COVERAGE_DATA_FAILED,
      error,
    });
  }
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_COVERAGE_DATA_REQUEST, fetchCoverageData);
  yield takeEvery(
    caseReportActions.SELECT_CASE_REPORT_SUCCESS,
    fetchCoverageData
  );
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
