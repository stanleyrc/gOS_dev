import { all, takeEvery, put, call } from "redux-saga/effects";
import axios from "axios";
import actions from "./actions";
import caseReportActions from "../caseReport/actions";

function* fetchData(action) {
  let { pair } = action;

  try {
    let responseGenomeData = yield call(axios.get, `data/${pair}/complex.json`);

    let data = responseGenomeData.data || {
      settings: {},
      intervals: [],
      connections: [],
    };
    yield put({
      type: actions.FETCH_GENOME_DATA_SUCCESS,
      data,
    });
  } catch (error) {
    yield put({
      type: actions.FETCH_GENOME_DATA_FAILED,
      error,
    });
  }
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_GENOME_DATA_REQUEST, fetchData);
  yield takeEvery(caseReportActions.SELECT_CASE_REPORT_SUCCESS, fetchData);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
