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
    filenameTumorRna,
    filenameTumorRnaIndex,
    filenameNormalRna,
    filenameNormalRnaIndex,
  } = currentState.Igv;
  const { id } = currentState.CaseReport;

  try {
    const genomeListResponse = yield call(axios.get, "igvGenomes.json");
    const genomeList = genomeListResponse.data;

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
      call(checkFile, filenameTumorRna),
      call(checkFile, filenameTumorRnaIndex),
      call(checkFile, filenameNormalRna),
      call(checkFile, filenameNormalRnaIndex),
    ]);

    // Check if all files are missing
    const allMissing = results.every((result) => !result.present);

    if (allMissing) {
      yield put({
        type: actions.FETCH_IGV_DATA_MISSING,
        genomeList,
        missing: true,
      });
    } else {
      yield put({
        type: actions.FETCH_IGV_DATA_SUCCESS,
        genomeList,
        filenameTumorPresent: results[0].present && results[1].present,
        filenameNormalPresent: results[2].present && results[3].present,
        filenameTumorRnaPresent: results[4].present && results[5].present,
        filenameNormalRnaPresent: results[6].present && results[7].present,
        missingFiles: results.filter((result) => !result.present),
      });
    }
  } catch (error) {
    if (axios.isCancel(error)) {
      console.log("IGV request canceled", error.message);
    } else {
      yield put({
        type: actions.FETCH_IGV_DATA_FAILED,
        error,
      });
    }
  }
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_IGV_DATA_REQUEST, fetchData);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
