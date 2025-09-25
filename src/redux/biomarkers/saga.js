import { all, takeEvery, put, select, call } from "redux-saga/effects";
import * as d3 from "d3";
import axios from "axios";
import { getCurrentState } from "./selectors";
import actions from "./actions";

function* fetchBiomarkersData(action) {
  try {
    const currentState = yield select(getCurrentState);
    let { dataset } = currentState.Settings;
    const filePath = `${dataset.commonPath}oncokb_biomarker_drug_associations.tsv`;

    try {
      yield call(axios.head, filePath);
    } catch (error) {
      yield put({
        type: actions.FETCH_BIOMARKERS_MISSING,
        missing: true,
      });
      return;
    }

    let data = yield call(d3.tsv, filePath);

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
