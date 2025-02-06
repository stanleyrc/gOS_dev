import { all, takeEvery, put, call, select } from "redux-saga/effects";
import axios from "axios";
import actions from "./actions";
import { getCurrentState } from "./selectors";
import { getCancelToken } from "../../helpers/cancelToken";

function* fetchData(action) {
  const currentState = yield select(getCurrentState);
  const { dataset } = currentState.Settings;
  const { filename, filenameIndex } = currentState.Igv;
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
    call(checkFile, filename),
    call(checkFile, filenameIndex),
  ]);

  const missingFiles = results.filter((result) => !result.present);

  if (missingFiles.length === 0) {
    // All files are present
    yield put({
      type: actions.FETCH_IGV_DATA_SUCCESS,
      filenamePresent: true,
      filenameIndexPresent: true,
      name: id,
    });
  } else {
    // Some files are missing
    const errorMessages = missingFiles.map(
      (file) => `${file.file} (${file.error})`
    );

    yield put({
      type: actions.FETCH_IGV_DATA_FAILED,
      filenamePresent: results[0].present,
      filenameIndexPresent: results[1].present,
      name: id,
      missingFiles: missingFiles.map((file) => file.file),
      error: errorMessages.join(", "),
    });
  }
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_IGV_DATA_REQUEST, fetchData);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
