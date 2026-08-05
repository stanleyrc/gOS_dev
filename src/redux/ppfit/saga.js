import { all, takeEvery, put, call, select } from "redux-saga/effects";
import axios from "axios";
import { sequencesToGenome, dataToGenome } from "../../helpers/utility";
import actions from "./actions";
import { getCurrentState } from "./selectors";
import { getCancelToken } from "../../helpers/cancelToken";
import {
  isMissingDataError,
  isMissingDataResponse,
} from "../../helpers/dataAvailability";

function* fetchPpfitData(action) {
  const currentState = yield select(getCurrentState);
  const { dataset, chromoBins } = currentState.Settings;
  const { id } = currentState.CaseReport;
  try {
    let responseData = yield call(
      axios.get,
      `${dataset.dataPath}${id}/ppfit.json`,
      { cancelToken: getCancelToken() }
    );

    if (isMissingDataResponse(responseData)) {
      yield put({ type: actions.FETCH_PPFIT_DATA_MISSING });
      return;
    }

    let data = responseData.data
      ? sequencesToGenome(responseData.data)
      : {
          settings: {},
          intervals: [],
          connections: [],
        };
    const genomeData = dataToGenome(data, chromoBins);

    if (!genomeData?.intervals?.length) {
      yield put({ type: actions.FETCH_PPFIT_DATA_MISSING });
      return;
    }

    yield put({
      type: actions.FETCH_PPFIT_DATA_SUCCESS,
      data: genomeData,
    });
  } catch (error) {
    console.log(error);
    if (axios.isCancel(error)) {
      console.log(
        `fetch ${dataset.dataPath}${id}/ppfit.json request canceled`,
        error.message
      );
    } else if (isMissingDataError(error)) {
      yield put({ type: actions.FETCH_PPFIT_DATA_MISSING });
    } else {
      yield put({
        type: actions.FETCH_PPFIT_DATA_FAILED,
        error,
      });
    }
  }
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_PPFIT_DATA_REQUEST, fetchPpfitData);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
