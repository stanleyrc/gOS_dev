import { all, takeEvery, put, call, select } from "redux-saga/effects";
import axios from "axios";
import actions from "./actions";
import { dataToGenome } from "../../helpers/utility";
import { getCurrentState } from "./selectors";

function* fetchData(action) {
  try {
    const currentState = yield select(getCurrentState);
    const { dataset, chromoBins } = currentState.Settings;
    const { id } = currentState.CaseReport;

    let responseGenomeData = yield call(
      axios.get,
      `${dataset.dataPath}${id}/complex.json`
    );

    let data = responseGenomeData.data || {
      settings: {},
      intervals: [],
      connections: [],
      intervalBins: {},
      frameConnections: [],
    };

    yield put({
      type: actions.FETCH_GENOME_DATA_SUCCESS,
      data: dataToGenome(data, chromoBins),
    });
  } catch (error) {
    yield put({
      type: actions.FETCH_GENOME_DATA_FAILED,
      error,
    });
  }
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_GENOME_DATA_REQUEST, fetchData);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
