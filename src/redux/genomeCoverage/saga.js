import { all, takeEvery, put, call, select } from "redux-saga/effects";
import { loadArrowTable } from "../../helpers/utility";
import actions from "./actions";
import { getCurrentState } from "./selectors";

function* fetchArrowData(plot) {
  yield loadArrowTable(plot.path)
    .then((results) => (plot.data = results))
    .catch((error) => {
      console.log(plot.path, error);
      plot.data = null;
    });
}

function* fetchCoverageData(action) {
  try {
    const currentState = yield select(getCurrentState);
    const { dataset } = currentState.Settings;
    const { id } = currentState.CaseReport;

    let coveragePlot = {
      path: `${dataset.dataPath}${id}/coverage.arrow`,
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
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
