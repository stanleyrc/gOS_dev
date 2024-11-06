import { all, takeEvery, put, call, select } from "redux-saga/effects";
import axios from "axios";
import actions from "./actions";
import { dataToGenome } from "../../helpers/utility";
import { getCurrentState } from "./selectors";
import { getCancelToken } from "../../helpers/cancelToken";

function* fetchData(action) {
  const currentState = yield select(getCurrentState);
  const { dataset, chromoBins } = currentState.Settings;
  const { id } = currentState.CaseReport;
  try {
    let responseGenomeData = yield call(
      axios.get,
      `${dataset.dataPath}${id}/complex.json`,
      { cancelToken: getCancelToken() }
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
    if (axios.isCancel(error)) {
      console.log(
        `fetch ${dataset.dataPath}${id}/complex.json request canceled`,
        error.message
      );
    } else {
      yield put({
        type: actions.FETCH_GENOME_DATA_FAILED,
        error,
      });
    }
  }
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_GENOME_DATA_REQUEST, fetchData);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
