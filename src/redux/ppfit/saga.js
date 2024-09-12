import { all, takeEvery, put, call } from "redux-saga/effects";
import axios from "axios";
import { sequencesToGenome } from "../../helpers/utility";
import actions from "./actions";
import caseReportActions from "../caseReport/actions";

function* fetchPpfitData(action) {
  let { pair } = action;

  try {
    let responseData = yield call(axios.get, `data/${pair}/ppfit.json`);

    let data = responseData.data
      ? sequencesToGenome(responseData.data)
      : {
          settings: {},
          intervals: [],
          connections: [],
        };

    yield put({
      type: actions.FETCH_PPFIT_DATA_SUCCESS,
      data,
    });
  } catch (error) {
    yield put({
      type: actions.FETCH_PPFIT_DATA_FAILED,
      error,
    });
  }
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_PPFIT_DATA_REQUEST, fetchPpfitData);
  yield takeEvery(caseReportActions.SELECT_CASE_REPORT_SUCCESS, fetchPpfitData);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
