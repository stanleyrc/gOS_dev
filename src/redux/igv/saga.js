import { all, takeEvery, put, call, select } from "redux-saga/effects";
import axios from "axios";
import actions from "./actions";
import { getCurrentState } from "./selectors";
import { getCancelToken } from "../../helpers/cancelToken";

function* fetchData(action) {
  const currentState = yield select(getCurrentState);
  const { dataset } = currentState.Settings;
  const {
    filenameTumor,
    filenameTumorIndex,
    filenameNormal,
    filenameNormalIndex,
  } = currentState.Igv;
  const { id } = currentState.CaseReport;

  const checkFile = function* (file) {
    try {
      yield call(axios.head, `${dataset.dataPath}${id}/${file}`, {
        cancelToken: getCancelToken(),
      });
      return { file, present: true };
    } catch (err) {
      if (axios.isCancel(err)) {
        console.log(`Request canceled for ${file}:`, err.message);
      } else {
        console.error(`Error checking ${file}:`, err.message);
      }
      return { file, present: false, error: err.message || "Unknown error" };
    }
  };

  const results = yield all([
    call(checkFile, filenameTumor),
    call(checkFile, filenameTumorIndex),
    call(checkFile, filenameNormal),
    call(checkFile, filenameNormalIndex),
  ]);

  yield put({
    type: actions.FETCH_IGV_DATA_SUCCESS,
    filenameTumorPresent: results[0].present && results[1].present,
    filenameNormalPresent: results[2].present && results[3].present,
    missingFiles: results.filter((result) => !result.present),
  });
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_IGV_DATA_REQUEST, fetchData);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
