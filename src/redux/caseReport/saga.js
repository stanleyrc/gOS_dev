import { all, takeEvery, put, call } from "redux-saga/effects";
import axios from "axios";
import { reportAttributesMap } from "../../helpers/utility";
import actions from "./actions";

function* selectCaseReport(action) {
  let { id } = action;

  try {
    let responseReportMetadata = yield call(
      axios.get,
      `data/${id}/metadata.json`
    );

    let metadata = {};
    let reportMetadata = responseReportMetadata.data[0];

    Object.keys(responseReportMetadata.data[0]).forEach((key) => {
      metadata[reportAttributesMap()[key]] = reportMetadata[key];
    });

    yield put({
      type: actions.SELECT_CASE_REPORT_SUCCESS,
      metadata,
      pair: metadata.pair,
    });
  } catch (error) {
    yield put({
      type: actions.SELECT_CASE_REPORT_FAILED,
      error,
    });
  }
}

function* actionWatcher() {
  yield takeEvery(actions.SELECT_CASE_REPORT_REQUEST, selectCaseReport);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
