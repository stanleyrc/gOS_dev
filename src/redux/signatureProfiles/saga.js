import { all, takeEvery, put, select, take } from "redux-saga/effects";
import axios from "axios";
import { getSignatureMetrics } from "../../helpers/utility";
import { getCurrentState } from "./selectors";
import actions from "./actions";
import settingsActions from "../settings/actions";
import caseReportsActions from "../caseReports/actions";

function* fetchData(action) {
  try {
    const currentState = yield select(getCurrentState);
    let { data: settings, dataset } = currentState.Settings;
    let { datafiles } = currentState.CaseReports;

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
            signatures[type][mode][name].push({
              pair: record.pair,
              tumor_type: record.tumor_type,
              value: record[`sigprofiler_${type}_${mode}`][name],
              sig: name,
            });
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
    let signaturesReferenceWeightsList = [];
    settings.signaturesList.types.forEach((type) => {
      signaturesReference[type] = {};

      settings.signaturesList.datafiles[type].forEach((d) => {
        signaturesReferenceWeightsList.push({
          type: type,
          name: d,
          path: `${dataset.commonPath}signatures/${type}_signature_weights/${d}.json`,
        });
      });
    });
    yield axios
      .all(signaturesReferenceWeightsList.map((e) => axios.get(e.path)))
      .then(
        axios.spread((...responses) => {
          responses.forEach(
            (d, i) =>
              (signaturesReference[signaturesReferenceWeightsList[i].type][
                signaturesReferenceWeightsList[i].name
              ] = d.data)
          );
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
