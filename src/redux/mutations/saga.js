import { all, takeEvery, put, call, select, take } from "redux-saga/effects";
import axios from "axios";
import { dataToGenome } from "../../helpers/utility";
import { createProgressChannel } from "../../helpers/progressChannel";
import actions from "./actions";
import { getCurrentState } from "./selectors";
import { getCancelToken } from "../../helpers/cancelToken";

function* fetchData(action) {
  const currentState = yield select(getCurrentState);
  const { filename } = currentState.Mutations;
  const { dataset, chromoBins } = currentState.Settings;
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
        yield put({
          type: actions.FETCH_MUTATIONS_DATA_SUCCESS,
          data: dataToGenome(result.response.data, chromoBins),
        });
      } else if (result.error) {
        // The request failed
        console.error(result.error);
        yield put({
          type: actions.FETCH_MUTATIONS_DATA_FAILED,
          error: result.error,
        });
      } else {
        // Intermediate progress updates
        yield put({
          type: actions.FETCH_MUTATIONS_DATA_REQUEST_LOADING,
          loadingPercentage: result,
        });
      }
    }
  } catch (error) {
    console.log(error);
    if (axios.isCancel(error)) {
      console.log(`fetch ${channelConfig.url} request canceled`, error.message);
    } else {
      yield put({
        type: actions.FETCH_MUTATIONS_DATA_FAILED,
        error,
      });
    }
  } finally {
    progressChannel.close();
  }
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_MUTATIONS_DATA_REQUEST, fetchData);
}

export default function* rootSaga() {
  yield all([actionWatcher()]);
}
