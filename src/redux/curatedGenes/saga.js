import { all, takeEvery, put, select, call } from "redux-saga/effects";
import * as d3 from "d3";
import axios from "axios";
import { getCurrentState } from "./selectors";
import actions from "./actions";

function* fetchCuratedGenesData(action) {
  try {
    const currentState = yield select(getCurrentState);
    let { dataset } = currentState.Settings;
    const filePath = `${dataset.commonPath}all_curated_genes.tsv`;

    try {
      yield call(axios.head, filePath);
    } catch (error) {
      yield put({
        type: actions.FETCH_CURATED_GENES_MISSING,
        missing: true,
      });
      return;
    }

    let data = yield call(d3.tsv, filePath);

    yield put({
      type: actions.FETCH_CURATED_GENES_SUCCESS,
      data,
    });
  } catch (error) {
    yield put({
      type: actions.FETCH_CURATED_GENES_FAILED,
      error,
    });
  }
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_CURATED_GENES_REQUEST, fetchCuratedGenesData);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
