import { all, takeEvery, put, call, select, take } from "redux-saga/effects";
import axios from "axios";
import actions from "./actions";
import { createProgressChannel } from "../../helpers/progressChannel";
import { getCurrentState } from "./selectors";
import { getCancelToken } from "../../helpers/cancelToken";

function* fetchSageQc(action) {
  const currentState = yield select(getCurrentState);
  const { filename } = currentState.SageQc;
  const { dataset } = currentState.Settings;
  const { id } = currentState.CaseReport;

  // Set up the channel configuration
  const channelConfig = {
    url: `${dataset.dataPath}${id}/${filename}`,
    cancelToken: getCancelToken(),
  };

  // Create the progress channel
  const progressChannel = yield call(createProgressChannel, channelConfig);

  try {
    while (true) {
      const result = yield take(progressChannel);
      if (result.response) {
        // The request completed successfully
        let records = result.response.data;

        records.forEach((d, i) => {
          d.id = i + 1;
          return d;
        });

        yield put({
          type: actions.FETCH_SAGEQC_SUCCESS,
          records,
        });
      } else if (result.error) {
        // The request failed
        console.error(result.error);
        yield put({
          type: actions.FETCH_SAGEQC_FAILED,
          error: result.error,
        });
      } else {
        // Intermediate progress updates
        yield put({
          type: actions.FETCH_SAGEQC_REQUEST_LOADING,
          loadingPercentage: result,
        });
      }
    }
  } catch (error) {
    if (axios.isCancel(error)) {
      console.log(
        `fetch ${dataset.dataPath}${id}/${filename} request canceled`,
        error.message
      );
    } else {
      yield put({
        type: actions.FETCH_SAGEQC_FAILED,
        error,
      });
    }
  }
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_SAGEQC_REQUEST, fetchSageQc);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
