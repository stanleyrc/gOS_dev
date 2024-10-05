import { all, takeEvery, put } from "redux-saga/effects";
import * as d3 from "d3";
import actions from "./actions";

function* fetchBiomarkersData(action) {
  try {
    let data = [];
    d3.tsv("common/oncokb_biomarker_drug_associations.tsv", (d) => {
      data.push(d);
    });

    yield put({
      type: actions.FETCH_BIOMARKERS_SUCCESS,
      data,
    });
  } catch (error) {
    yield put({
      type: actions.FETCH_BIOMARKERS_FAILED,
      error,
    });
  }
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_BIOMARKERS_REQUEST, fetchBiomarkersData);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
