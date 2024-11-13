import { all, takeEvery, put, call, select } from "redux-saga/effects";
import axios from "axios";
import { sequencesToGenome, dataToGenome } from "../../helpers/utility";
import actions from "./actions";
import { getCurrentState } from "./selectors";
import { getCancelToken } from "../../helpers/cancelToken";

function* fetchPpfitData(action) {
  const currentState = yield select(getCurrentState);
  const { dataset, chromoBins } = currentState.Settings;
  const { id } = currentState.CaseReport;
  try {
    let responseData = yield call(
      axios.get,
      `${dataset.dataPath}${id}/ppfit.json`,
      { cancelToken: getCancelToken() }
    );

    let data = responseData.data
      ? sequencesToGenome(responseData.data)
      : {
          settings: {},
          intervals: [],
          connections: [],
        };

    yield put({
      type: actions.FETCH_PPFIT_DATA_SUCCESS,
      data: dataToGenome(data, chromoBins),
    });
  } catch (error) {
    console.log(error);
    if (axios.isCancel(error)) {
      console.log(
        `fetch ${dataset.dataPath}${id}/ppfit.json request canceled`,
        error.message
      );
    } else {
      yield put({
        type: actions.FETCH_PPFIT_DATA_FAILED,
        error,
      });
    }
  }
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_PPFIT_DATA_REQUEST, fetchPpfitData);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
