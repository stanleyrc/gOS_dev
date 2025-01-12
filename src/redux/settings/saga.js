import { all, takeLatest, put, call, delay } from "redux-saga/effects";
import axios from "axios";
import { updateChromoBins, locationToDomains } from "../../helpers/utility";
import actions from "./actions";
import datasetsActions from "../datasets/actions";
import caseReportsActions from "../caseReports/actions";
import caseReportActions from "../caseReport/actions";
import genesActions from "../genes/actions";
import biomarkersActions from "../biomarkers/actions";
import curatedGenesActions from "../curatedGenes/actions";
import { cancelAllRequests } from "../../helpers/cancelToken";

function* launchApplication(action) {
  let actionTypes = [
    actions.FETCH_SETTINGS_DATA_REQUEST,
    datasetsActions.FETCH_DATASETS_REQUEST,
    genesActions.FETCH_GENES_DATA_REQUEST,
  ];
  yield all(actionTypes.map((type) => put({ type })));
}

function* fetchSettingsData(action) {
  try {
    // get the settings within the public folder
    let responseData = yield call(axios.get, "settings.json");
    // if all selected files are have the same reference
    let selectedCoordinate = "hg19";

    let { genomeLength, chromoBins } = updateChromoBins(
      responseData.data.coordinates.sets[selectedCoordinate]
    );

    let searchParams = new URL(decodeURI(document.location)).searchParams;

    let domains = [];
    try {
      domains = locationToDomains(chromoBins, searchParams.get("location"));
    } catch (error) {
      domains = [[1, genomeLength]];
    }

    yield put({
      type: actions.FETCH_SETTINGS_DATA_SUCCESS,
      data: responseData.data,
      selectedCoordinate,
      chromoBins,
      defaultDomain: [1, genomeLength],
      domains,
      genomeLength,
    });
  } catch (error) {
    yield put({
      type: actions.FETCH_SETTINGS_DATA_FAILED,
      error,
    });
  }
}

function* updateCaseReportFollowUp(action) {
  cancelAllRequests();
  yield put({
    type: caseReportActions.FETCH_CASE_REPORT_REQUEST,
  });
}

function* settingsFetchedFollowUp(action) {
  yield put({
    type: genesActions.FETCH_HIGLASS_GENES_INFO_REQUEST,
  });
}

function* updateDomainsFollowUp(action) {
  //yield delay(100); // to throttle multiple requests fired during zooming and panning
  yield put({
    type: genesActions.FETCH_HIGLASS_GENES_DATA_REQUEST,
  });
}

function* updateDatasetFollowUp(action) {
  let actionTypes = [
    caseReportsActions.FETCH_CASE_REPORTS_REQUEST,
    biomarkersActions.FETCH_BIOMARKERS_REQUEST,
    curatedGenesActions.FETCH_CURATED_GENES_REQUEST,
  ];
  yield all(actionTypes.map((type) => put({ type })));
  if (action.report) {
    cancelAllRequests();
    yield put({
      type: caseReportActions.FETCH_CASE_REPORT_REQUEST,
      report: action.report,
    });
  }
}

function* actionWatcher() {
  yield takeLatest(actions.LAUNCH_APPLICATION, launchApplication);
  yield takeLatest(actions.FETCH_SETTINGS_DATA_REQUEST, fetchSettingsData);
  yield takeLatest(
    actions.FETCH_SETTINGS_DATA_SUCCESS,
    settingsFetchedFollowUp
  );
  yield takeLatest(actions.UPDATE_CASE_REPORT, updateCaseReportFollowUp);
  yield takeLatest(actions.UPDATE_DATASET, updateDatasetFollowUp);
  yield takeLatest(actions.UPDATE_DOMAINS, updateDomainsFollowUp);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
