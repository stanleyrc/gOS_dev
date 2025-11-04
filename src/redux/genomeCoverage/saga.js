import { all, takeEvery, put, call, select } from "redux-saga/effects";
import { loadArrowTable } from "../../helpers/utility";
import actions from "./actions";
import { getCurrentState } from "./selectors";
import { getCancelToken } from "../../helpers/cancelToken";
import { splitFloat64 } from "../../helpers/utility.js";

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
    const { filename } = currentState.GenomeCoverage;
    const { dataset } = currentState.Settings;
    const { id, metadata } = currentState.CaseReport;

    let plot = {
      path: `${dataset.dataPath}${id}/${filename}`,
      data: null,
    };
    yield call(fetchArrowData, plot);

    let dataPointsCount = plot.data.getChild("y").toArray();
    let dataPointsCopyNumber = dataPointsCount.map(
      (d) => d * (metadata?.cov_slope || 1) + (metadata?.cov_intercept || 0)
    );
    let dataPointsX = plot.data.getChild("x").toArray();
    let dataPointsXHigh = [];
    let dataPointsXLow = [];
    dataPointsX.forEach((v) => {
      const [hi, lo] = splitFloat64(v);
      dataPointsXHigh.push(hi);
      dataPointsXLow.push(lo);
    });
    let dataPointsColor = plot.data.getChild("color").toArray();

    yield put({
      type: actions.FETCH_COVERAGE_DATA_SUCCESS,
      dataPointsCount,
      dataPointsCopyNumber,
      dataPointsX,
      dataPointsXHigh,
      dataPointsXLow,
      dataPointsColor,
    });
  } catch (error) {
    yield put({
      type: actions.FETCH_COVERAGE_DATA_FAILED,
      error,
    });
  }
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_COVERAGE_DATA_REQUEST, fetchData);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
