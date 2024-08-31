import { all, takeEvery, put, call } from "redux-saga/effects";
import axios from "axios";
import actions from "./actions";
import caseReportActions from "../caseReport/actions";

function* fetchSageQc(action) {
  let { pair } = action;

  try {
    let responseSageQC = yield call(axios.get, `data/${pair}/sage.qc.json`);

    let records = responseSageQC.data;

    records.forEach((d, i) => {
      d.id = i + 1;
      return d;
    });

    yield put({
      type: actions.FETCH_SAGEQC_SUCCESS,
      records,
    });
  } catch (error) {
    yield put({
      type: actions.FETCH_SAGEQC_FAILED,
      error,
    });
  }
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_SAGEQC_REQUEST, fetchSageQc);
  yield takeEvery(caseReportActions.SELECT_CASE_REPORT_SUCCESS, fetchSageQc);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
