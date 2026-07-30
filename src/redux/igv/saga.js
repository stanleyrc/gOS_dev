import { all, takeEvery, put, call, select } from "redux-saga/effects";
import axios from "axios";
import actions from "./actions";
import { getCurrentState } from "./selectors";
import { getCancelToken } from "../../helpers/cancelToken";
import {
  isMissingDataError,
  isMissingDataResponse,
} from "../../helpers/dataAvailability";

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
        const availabilityResponse = yield call(
          axios.head,
          `${dataset.dataPath}${id}/${file}`,
          {
            cancelToken: getCancelToken(),
          }
        );
        return {
          file,
          present: !isMissingDataResponse(availabilityResponse),
        };
      } catch (err) {
        if (axios.isCancel(err)) throw err;
        if (isMissingDataError(err)) return { file, present: false };
        throw err;
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

    const filenameTumorPresent = results[0].present && results[1].present;
    const filenameNormalPresent = results[2].present && results[3].present;
    const filenameTumorRnaPresent = results[4].present && results[5].present;
    const filenameNormalRnaPresent = results[6].present && results[7].present;
    const allMissing = ![
      filenameTumorPresent,
      filenameNormalPresent,
      filenameTumorRnaPresent,
      filenameNormalRnaPresent,
    ].some(Boolean);

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
        filenameTumorPresent,
        filenameNormalPresent,
        filenameTumorRnaPresent,
        filenameNormalRnaPresent,
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
