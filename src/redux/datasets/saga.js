import { all, takeEvery, put, call, select } from "redux-saga/effects";
import { getCurrentState } from "./selectors";
import axios from "axios";
import actions from "./actions";
import settingsActions from "../settings/actions";

function* fetchDatasets() {
  try {
    // get the list of all datasets from the public/datasets.json
    let responseDatasets = yield call(axios.get, "datasets.json");

    let records = responseDatasets.data;

    yield put({
      type: actions.FETCH_DATASETS_SUCCESS,
      records,
    });
  } catch (error) {
    yield put({
      type: actions.FETCH_DATASETS_FAILED,
      error,
    });
  }
}

function* followUpDatasetsFetched(action) {
  const currentState = yield select(getCurrentState);
  const { records } = currentState.Datasets;
  let searchParams = new URL(decodeURI(document.location)).searchParams;
  let datasetId = searchParams.get("dataset");
  let dataset = records.find((d) => d.id === datasetId) || records[0];
  let report = searchParams.get("report");
  yield put({
    type: settingsActions.UPDATE_DATASET,
    dataset,
    report,
  });
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_DATASETS_REQUEST, fetchDatasets);
  yield takeEvery(actions.FETCH_DATASETS_SUCCESS, followUpDatasetsFetched);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
