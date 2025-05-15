import { all, takeEvery, put, select, take, call } from "redux-saga/effects";
import axios from "axios";
import {
  getSignatureMetrics,
  parseCosmicSignatureWeightMatrix,
} from "../../helpers/utility";
import { getCurrentState } from "./selectors";
import actions from "./actions";
import settingsActions from "../settings/actions";
import caseReportsActions from "../caseReports/actions";

function* fetchData(action) {
  try {
    const currentState = yield select(getCurrentState);
    let { data: settings, dataset } = currentState.Settings;
    let { datafiles } = currentState.CaseReports;
    let { signaturesWeightsFiles } = currentState.SignatureProfiles;

    let signatures = {};
    let signatureMetrics = [];

    let signaturesList = [];
    settings.signaturesList.types.forEach((type) => {
      signatures[type] = {};
      settings.signaturesList.modes.forEach((mode) => {
        signatures[type][mode] = {};
        settings.signaturesList.datafiles[type].forEach((name) => {
          signatures[type][mode][name] = [];
          signaturesList.push({
            type: type,
            mode: mode,
            name: name,
          });
        });
      });
    });

    signaturesList.forEach((sig) => {
      let { type, mode } = sig;
      datafiles.forEach((record, i) => {
        Object.keys(record[`sigprofiler_${type}_${mode}`] || []).forEach(
          (name) => {
            if (signatures[type][mode][name]) {
              signatures[type][mode][name].push({
                pair: record.pair,
                tumor_type: record.tumor_type,
                value: record[`sigprofiler_${type}_${mode}`][name],
                sig: name,
              });
            }
          }
        );
      });
    });

    settings.signaturesList.types.forEach((type) => {
      signatureMetrics[type] = {};
      settings.signaturesList.modes.forEach((mode) => {
        signatureMetrics[type][mode] = getSignatureMetrics(
          signatures[type][mode]
        );
      });
    });

    let signaturesReference = {};
    yield axios
      .all(
        Object.keys(signaturesWeightsFiles).map((type) =>
          axios.get(signaturesWeightsFiles[type])
        )
      )
      .then(
        axios.spread((...responses) => {
          responses.forEach((response, i) => {
            let weights = parseCosmicSignatureWeightMatrix(response.data);
            signaturesReference[Object.keys(signaturesWeightsFiles)[i]] = {};
            Object.keys(weights).forEach((name) => {
              signaturesReference[Object.keys(signaturesWeightsFiles)[i]][
                name
              ] = Object.keys(weights[name]).map((tnc) => {
                return { value: weights[name][tnc], sig: name, tnc };
              });
            });
          });
        })
      )
      .catch((errors) => {
        console.log("got errors on loading signatures", errors);
      });

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
