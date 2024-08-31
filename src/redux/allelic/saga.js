import { all, takeEvery, put, call } from "redux-saga/effects";
import axios from "axios";
import { allelicToGenome } from "../../helpers/utility";
import actions from "./actions";
import caseReportActions from "../caseReport/actions";

function* fetchData(action) {
  let { pair } = action;

  try {
    let responseAllelicData = yield call(
      axios.get,
      `data/${pair}/allelic.json`
    );
    let data = allelicToGenome(
      responseAllelicData.data || {
        settings: {},
        intervals: [],
        connections: [],
      }
    );
    yield put({
      type: actions.FETCH_ALLELIC_DATA_SUCCESS,
      data,
    });
  } catch (error) {
    yield put({
      type: actions.FETCH_ALLELIC_DATA_FAILED,
      error,
    });
  }
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_ALLELIC_DATA_REQUEST, fetchData);
  yield takeEvery(caseReportActions.SELECT_CASE_REPORT_SUCCESS, fetchData);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
