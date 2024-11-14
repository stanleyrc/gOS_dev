import { all, takeEvery, put, call, select } from "redux-saga/effects";
import axios from "axios";
import { dataToGenome } from "../../helpers/utility";
import actions from "./actions";
import { getCurrentState } from "./selectors";
import { getCancelToken } from "../../helpers/cancelToken";

function* fetchData(action) {
  const currentState = yield select(getCurrentState);
  const { filename } = currentState.Mutations;
  const { dataset, chromoBins } = currentState.Settings;
  const { id } = currentState.CaseReport;
  try {
    const updateProgress = (progress) => {
      action.asyncDispatch({
        type: actions.FETCH_MUTATIONS_DATA_REQUEST_LOADING,
        loadingPercentage: progress,
      });
    };

    let responseMutationsData = yield call(
      axios.get,
      `${dataset.dataPath}${id}/${filename}`,
      {
        cancelToken: getCancelToken(),
        onDownloadProgress: (progressEvent) => {
          const progress = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          updateProgress(progress); // Call the update function to dispatch progress action
        },
      }
    );

    yield put({
      type: actions.FETCH_MUTATIONS_DATA_SUCCESS,
      data: dataToGenome(responseMutationsData.data, chromoBins),
    });
  } catch (error) {
    console.log(error);
    if (axios.isCancel(error)) {
      console.log(
        `fetch ${dataset.dataPath}${id}/mutations.json request canceled`,
        error.message
      );
    } else {
      yield put({
        type: actions.FETCH_MUTATIONS_DATA_FAILED,
        error,
      });
    }
  }
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_MUTATIONS_DATA_REQUEST, fetchData);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
