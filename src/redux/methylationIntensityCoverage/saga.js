import { all, takeEvery, put, call, select } from "redux-saga/effects";
import { loadArrowTable } from "../../helpers/utility";
import axios from "axios";
import actions from "./actions";
import { getCurrentState } from "./selectors";
import { getCancelToken } from "../../helpers/cancelToken";
import { splitFloat64 } from "../../helpers/utility.js";
import {
  isMissingDataError,
  isMissingDataResponse,
} from "../../helpers/dataAvailability";

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
    const { filename } = currentState.MethylationIntensityCoverage;
    const { dataset } = currentState.Settings;
    const { id, metadata } = currentState.CaseReport;

    const filePath = `${dataset.dataPath}${id}/${filename}`;

    try {
      const availabilityResponse = yield call(axios.head, filePath);
      if (isMissingDataResponse(availabilityResponse)) {
        yield put({
          type: actions.FETCH_METHYLATION_INTENSITY_DATA_MISSING,
        });
        return;
      }
    } catch (error) {
      if (!isMissingDataError(error)) throw error;

      yield put({
        type: actions.FETCH_METHYLATION_INTENSITY_DATA_MISSING,
      });
      return;
    }

    let plot = {
      path: filePath,
      data: null,
    };
    yield call(fetchArrowData, plot);

    let dataPointsCount = plot.data.getChild("y").toArray();
    let dataPointsCopyNumber = dataPointsCount.map(
      (d) =>
        d * (metadata?.methylation_intensity_cov_slope || 1) +
        (metadata?.methylation_intensity_cov_intercept || 0)
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
      type: actions.FETCH_METHYLATION_INTENSITY_DATA_SUCCESS,
      dataPointsCount,
      dataPointsCopyNumber,
      dataPointsX,
      dataPointsXHigh,
      dataPointsXLow,
      dataPointsColor,
    });
  } catch (error) {
    yield put({
      type: actions.FETCH_METHYLATION_INTENSITY_DATA_FAILED,
      error,
    });
  }
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_METHYLATION_INTENSITY_DATA_REQUEST, fetchData);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
