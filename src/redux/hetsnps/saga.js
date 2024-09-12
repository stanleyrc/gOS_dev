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

function* fetchData(action) {
  let { pair } = action;

  try {
    let hetsnpsPlot = {
      path: `data/${pair}/hetsnps.arrow`,
      data: null,
    };
    yield call(fetchArrowData, hetsnpsPlot);

    yield put({
      type: actions.FETCH_HETSNPS_DATA_SUCCESS,
      data: hetsnpsPlot.data,
    });
  } catch (error) {
    yield put({
      type: actions.FETCH_HETSNPS_DATA_FAILED,
      error,
    });
  }
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_HETSNPS_DATA_REQUEST, fetchData);
  yield takeEvery(caseReportActions.SELECT_CASE_REPORT_SUCCESS, fetchData);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
