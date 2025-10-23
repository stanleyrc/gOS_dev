import { all, takeEvery, put, select, take, call } from "redux-saga/effects";
import axios from "axios";
import { processDataInWorker } from "../../helpers/workers";
import { getCurrentState } from "./selectors";
import actions from "./actions";
import caseReportActions from "../caseReport/actions";
import signatureProfilesActions from "../signatureProfiles/actions";

function* fetchData(action) {
  let errors = [];
  try {
    const currentState = yield select(getCurrentState);
    let { signatures, signaturesReference } = currentState.SignatureProfiles;
    const { dataset } = currentState.Settings;
    const { id, metadata } = currentState.CaseReport;
    const { sigprofiler_sbs_count, sigprofiler_indel_count } = metadata;

    // Convert relative dataPath to absolute URL
    const baseUrl = window.location.origin;
    const absoluteDataPath = dataset.dataPath.startsWith("http")
      ? dataset.dataPath
      : `${baseUrl}/${dataset.dataPath}`;

    const requiredFiles = [
      `${absoluteDataPath}${id}/mutation_catalog.json`,
      `${absoluteDataPath}${id}/id_mutation_catalog.json`,
      `${absoluteDataPath}${id}/sbs_decomposed_prob.json`,
      `${absoluteDataPath}${id}/id_decomposed_prob.json`,
    ];

    let missing = false;
    for (let file of requiredFiles) {
      try {
        yield call(axios.head, file);
      } catch (e) {
        missing = true;
        break;
      }
    }
    if (missing) {
      yield put({
        type: actions.FETCH_SIGNATURE_STATISTICS_MISSING,
        missing: true,
      });
      return;
    }

    // Use Web Worker for heavy computation
    // Only send serializable data to avoid DataCloneError
    const computationResult = yield call(
      processDataInWorker,
      {
        signatures,
        signaturesReference,
        metadata,
        dataset: {
          dataPath: absoluteDataPath,
        },
        id,
        sigprofiler_sbs_count,
        sigprofiler_indel_count,
      },
      `${window.location.origin}/workers/signatureStatistics.worker.js`
    );

    const {
      signatureMetrics,
      tumorSignatureMetrics,
      mutationCatalog,
      decomposedCatalog,
      referenceCatalog,
    } = computationResult;

    if (errors.length < 1) {
      yield put({
        type: actions.FETCH_SIGNATURE_STATISTICS_SUCCESS,
        signatureMetrics,
        tumorSignatureMetrics,
        mutationCatalog,
        decomposedCatalog,
        referenceCatalog,
      });
    } else {
      yield put({
        type: actions.FETCH_SIGNATURE_STATISTICS_FAILED,
        error: errors.join(","),
      });
    }
  } catch (error) {
    yield put({
      type: actions.FETCH_SIGNATURE_STATISTICS_FAILED,
      error,
    });
  }
}

function* watchForMultipleActions() {
  yield all([
    take(signatureProfilesActions.FETCH_SIGNATURE_PROFILES_SUCCESS),
    take(caseReportActions.FETCH_CASE_REPORT_SUCCESS),
  ]);

  yield put({
    type: actions.FETCH_SIGNATURE_STATISTICS_REQUEST,
  });
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_SIGNATURE_STATISTICS_REQUEST, fetchData);
}
export default function* rootSaga() {
  yield all([actionWatcher(), watchForMultipleActions()]);
}
