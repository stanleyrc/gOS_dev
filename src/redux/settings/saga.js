import { all, takeLatest, put, call, select } from "redux-saga/effects";
import axios from "axios";
import { updateChromoBins } from "../../helpers/utility";
import actions from "./actions";
import { getCurrentState } from "./selectors";
import caseReportsActions from "../caseReports/actions";
import caseReportActions from "../caseReport/actions";
import genesActions from "../genes/actions";
import biomarkersActions from "../biomarkers/actions";
import curatedGenesActions from "../curatedGenes/actions";

function* launchApplication(action) {
  const currentState = yield select(getCurrentState);
  let { report } = currentState.Settings;
  let actionTypes = [
    actions.FETCH_SETTINGS_DATA_REQUEST,
    caseReportsActions.FETCH_CASE_REPORTS_REQUEST,
    genesActions.FETCH_GENES_DATA_REQUEST,
    biomarkersActions.FETCH_BIOMARKERS_REQUEST,
    curatedGenesActions.FETCH_CURATED_GENES_REQUEST,
  ];
  if (report) {
    actionTypes.push(caseReportActions.FETCH_CASE_REPORT_REQUEST);
  }
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

    yield put({
      type: actions.FETCH_SETTINGS_DATA_SUCCESS,
      data: responseData.data,
      selectedCoordinate,
      chromoBins,
      defaultDomain: [1, genomeLength],
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
  yield put({
    type: caseReportActions.FETCH_CASE_REPORT_REQUEST,
  });
}

function* actionWatcher() {
  yield takeLatest(actions.LAUNCH_APPLICATION, launchApplication);
  yield takeLatest(actions.FETCH_SETTINGS_DATA_REQUEST, fetchSettingsData);
  yield takeLatest(actions.UPDATE_CASE_REPORT, updateCaseReportFollowUp);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
