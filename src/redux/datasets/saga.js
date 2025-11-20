import { all, takeEvery, put, call, select } from "redux-saga/effects";
import { getCurrentState } from "./selectors";
import axios from "axios";
import actions from "./actions";
import settingsActions from "../settings/actions";
import Field from "../../helpers/field";

function* fetchDatasets() {
  try {
    const currentState = yield select(getCurrentState);
    let { data: settings } = currentState.Settings;
    // get the list of all datasets from the public/datasets.json
    let responseDatasets = yield call(axios.get, "datasets.json");

    let records = responseDatasets.data;

    // ensure that each dataset has a reference, if not assign hg19 as default
    records.forEach((dataset) => {
      dataset.reference = dataset.reference || "hg19";
      dataset.higlassReference =
        settings.coordinates.higlassMap[dataset.reference] || "hg19";
      dataset.fields = dataset.schema
        ? (dataset.schema || [])
            .map((d) => new Field(d))
            .filter((d) => d.isValid)
        : settings.fields.map((f) => new Field(f));
      dataset.kpiFields = dataset.fields.filter((d) => d.kpiPlot === true);
    });

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
