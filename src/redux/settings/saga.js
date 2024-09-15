import { all, takeEvery, put, call } from "redux-saga/effects";
import axios from "axios";
import { updateChromoBins } from "../../helpers/utility";
import actions from "./actions";
import caseReportActions from "../caseReport/actions";

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
  if (action.report) {
    yield put({
      type: caseReportActions.SELECT_CASE_REPORT_REQUEST,
      id: action.report,
    });
  }
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_SETTINGS_DATA_REQUEST, fetchSettingsData);
  yield takeEvery(actions.UPDATE_CASE_REPORT, updateCaseReportFollowUp);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
