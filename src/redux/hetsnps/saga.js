import { all, takeEvery, put, call, select } from "redux-saga/effects";
import { loadArrowTable } from "../../helpers/utility";
import actions from "./actions";
import { getCurrentState } from "./selectors";
import { getCancelToken } from "../../helpers/cancelToken";

function* fetchArrowData(plot) {
  yield loadArrowTable(plot.path, getCancelToken())
    .then((results) => (plot.data = results))
    .catch((error) => {
      console.log(plot.path, error);
      plot.data = null;
    });
}

function* fetchData(action) {
  try {
    const currentState = yield select(getCurrentState);
    const { dataset } = currentState.Settings;
    const { id } = currentState.CaseReport;

    let hetsnpsPlot = {
      path: `${dataset.dataPath}${id}/hetsnps.arrow`,
      data: null,
    };

    yield call(fetchArrowData, hetsnpsPlot);

    let dataPointsY = hetsnpsPlot.data.getChild("y").toArray();
    let dataPointsX = hetsnpsPlot.data.getChild("x").toArray();
    let dataPointsColor = hetsnpsPlot.data.getChild("color").toArray();

    yield put({
      type: actions.FETCH_HETSNPS_DATA_SUCCESS,
      dataPointsY,
      dataPointsX,
      dataPointsColor,
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
