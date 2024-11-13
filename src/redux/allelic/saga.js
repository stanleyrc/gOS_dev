import { all, takeEvery, put, call, select } from "redux-saga/effects";
import axios from "axios";
import { allelicToGenome } from "../../helpers/utility";
import { dataToGenome } from "../../helpers/utility";
import actions from "./actions";
import { getCurrentState } from "./selectors";
import { getCancelToken } from "../../helpers/cancelToken";

function* fetchData(action) {
  const currentState = yield select(getCurrentState);
  const { dataset, chromoBins } = currentState.Settings;
  const { id } = currentState.CaseReport;
  try {
    let responseAllelicData = yield call(
      axios.get,
      `${dataset.dataPath}${id}/allelic.json`,
      { cancelToken: getCancelToken() }
    );
    let data = allelicToGenome(
      responseAllelicData.data || {
        settings: {},
        intervals: [],
        connections: [],
        intervalBins: {},
        frameConnections: [],
      }
    );

    yield put({
      type: actions.FETCH_ALLELIC_DATA_SUCCESS,
      data: dataToGenome(data, chromoBins),
    });
  } catch (error) {
    console.log(error);
    if (axios.isCancel(error)) {
      console.log(
        `fetch ${dataset.dataPath}${id}/allelic.json request canceled`,
        error.message
      );
    } else {
      yield put({
        type: actions.FETCH_ALLELIC_DATA_FAILED,
        error,
      });
    }
  }
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_ALLELIC_DATA_REQUEST, fetchData);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
