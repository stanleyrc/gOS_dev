import { all, takeEvery, put } from "redux-saga/effects";
import * as d3 from "d3";
import actions from "./actions";

function* fetchCuratedGenesData(action) {
  try {
    let data = [];
    d3.tsv("common/all_curated_genes.tsv", (d) => {
      data.push(d);
    });

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
