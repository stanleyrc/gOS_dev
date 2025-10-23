import { all, takeEvery, put, select, take, call } from "redux-saga/effects";
import { processDataInWorker } from "../../helpers/workers";
import { getCurrentState } from "./selectors";
import actions from "./actions";
import settingsActions from "../settings/actions";
import caseReportsActions from "../caseReports/actions";

function* fetchData(action) {
  try {
    const currentState = yield select(getCurrentState);
    let { data: settings } = currentState.Settings;
    let { datafiles } = currentState.CaseReports;
    let { signaturesWeightsFiles } = currentState.SignatureProfiles;

    // Convert relative signature weights file paths to absolute URLs
    const baseUrl = window.location.origin;
    const absoluteSignaturesWeightsFiles = {};
    Object.keys(signaturesWeightsFiles).forEach((key) => {
      const filePath = signaturesWeightsFiles[key];
      absoluteSignaturesWeightsFiles[key] = filePath.startsWith("http")
        ? filePath
        : `${baseUrl}/${filePath}`;
    });

    // Use Web Worker for heavy computation
    const computationResult = yield call(
      processDataInWorker,
      {
        settings: {
          signaturesList: settings.signaturesList,
        },
        datafiles,
        signaturesWeightsFiles: absoluteSignaturesWeightsFiles,
      },
      new URL("../../workers/signatureProfilesWorker.js", import.meta.url)
    );

    const { signatures, signatureMetrics, signaturesReference } =
      computationResult;

    yield put({
      type: actions.FETCH_SIGNATURE_PROFILES_SUCCESS,
      signatures,
      signatureMetrics,
      signaturesReference,
    });
  } catch (error) {
    console.log(error);
    yield put({
      type: actions.FETCH_SIGNATURE_PROFILES_FAILED,
      error,
    });
  }
}

function* watchForMultipleActions() {
  yield all([
    take(settingsActions.FETCH_SETTINGS_DATA_SUCCESS),
    take(caseReportsActions.FETCH_CASE_REPORTS_SUCCESS),
  ]);

  yield put({
    type: actions.FETCH_SIGNATURE_PROFILES_REQUEST,
  });
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_SIGNATURE_PROFILES_REQUEST, fetchData);
}
export default function* rootSaga() {
  yield all([actionWatcher(), watchForMultipleActions()]);
}
