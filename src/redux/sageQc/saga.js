import { all, takeEvery, put, call, select } from "redux-saga/effects";
import axios from "axios";
import actions from "./actions";
import { getCurrentState } from "./selectors";
import { getCancelToken } from "../../helpers/cancelToken";

function* fetchSageQc(action) {
  const currentState = yield select(getCurrentState);
  const { dataset } = currentState.Settings;
  const { id } = currentState.CaseReport;
  try {
    let responseSageQC = yield call(
      axios.get,
      `${dataset.dataPath}${id}/sage.qc.json`,
      { cancelToken: getCancelToken() }
    );

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
    if (axios.isCancel(error)) {
      console.log(
        `fetch ${dataset.dataPath}${id}/sage.qc.json request canceled`,
        error.message
      );
    } else {
      yield put({
        type: actions.FETCH_SAGEQC_FAILED,
        error,
      });
    }
  }
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_SAGEQC_REQUEST, fetchSageQc);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
