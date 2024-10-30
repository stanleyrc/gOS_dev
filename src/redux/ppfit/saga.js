import { all, takeEvery, put, call, select } from "redux-saga/effects";
import axios from "axios";
import { sequencesToGenome, dataToGenome } from "../../helpers/utility";
import actions from "./actions";
import { getCurrentState } from "./selectors";

function* fetchPpfitData(action) {
  try {
    const currentState = yield select(getCurrentState);
    const { dataset, chromoBins } = currentState.Settings;
    const { id } = currentState.CaseReport;

    let responseData = yield call(
      axios.get,
      `${dataset.dataPath}${id}/ppfit.json`
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
    yield put({
      type: actions.FETCH_PPFIT_DATA_FAILED,
      error,
    });
  }
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_PPFIT_DATA_REQUEST, fetchPpfitData);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
