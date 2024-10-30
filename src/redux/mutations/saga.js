import { all, takeEvery, put, call, select } from "redux-saga/effects";
import axios from "axios";
import { dataToGenome } from "../../helpers/utility";
import actions from "./actions";
import { getCurrentState } from "./selectors";

function* fetchData(action) {
  try {
    const currentState = yield select(getCurrentState);
    const { dataset, chromoBins } = currentState.Settings;
    const { id } = currentState.CaseReport;

    let responseMutationsData = yield call(
      axios.get,
      `${dataset.dataPath}${id}/mutations.json`
    );

    yield put({
      type: actions.FETCH_MUTATIONS_DATA_SUCCESS,
      data: dataToGenome(responseMutationsData.data, chromoBins),
    });
  } catch (error) {
    yield put({
      type: actions.FETCH_MUTATIONS_DATA_FAILED,
      error,
    });
  }
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_MUTATIONS_DATA_REQUEST, fetchData);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
