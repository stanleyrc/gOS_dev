import { all, takeEvery, put, call, select } from "redux-saga/effects";
import axios from "axios";
import { allelicToGenome } from "../../helpers/utility";
import actions from "./actions";
import { getCurrentState } from "./selectors";

function* fetchData(action) {
  try {
    const currentState = yield select(getCurrentState);
    const { id } = currentState.CaseReport;

    let responseAllelicData = yield call(axios.get, `data/${id}/allelic.json`);
    let data = allelicToGenome(
      responseAllelicData.data || {
        settings: {},
        intervals: [],
        connections: [],
      }
    );
    yield put({
      type: actions.FETCH_ALLELIC_DATA_SUCCESS,
      data,
    });
  } catch (error) {
    yield put({
      type: actions.FETCH_ALLELIC_DATA_FAILED,
      error,
    });
  }
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_ALLELIC_DATA_REQUEST, fetchData);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
