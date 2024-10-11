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

function* fetchData(action) {
  try {
    const currentState = yield select(getCurrentState);
    const { id } = currentState.CaseReport;

    let hetsnpsPlot = {
      path: `data/${id}/hetsnps.arrow`,
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
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
