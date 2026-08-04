import { all, takeEvery, put, call, select } from "redux-saga/effects";
import axios from "axios";
import actions from "./actions";
import { getCurrentState } from "./selectors";
import { getCancelToken } from "../../helpers/cancelToken";
import {
  isMissingDataError,
  isMissingDataResponse,
} from "../../helpers/dataAvailability";

function* fetchHighlightsData(action) {
  const currentState = yield select(getCurrentState);
  const { dataset } = currentState.Settings;
  const { filename } = currentState.Highlights;
  const { id } = currentState.CaseReport;
  const highlightsUrl = `${dataset.dataPath}${id}/${filename}`;
  
  try {
    const availabilityResponse = yield call(axios.head, highlightsUrl);
    if (isMissingDataResponse(availabilityResponse)) {
      yield put({
        type: actions.FETCH_HIGHLIGHTS_DATA_SUCCESS,
        data: null,
        highlightsMissing: true,
      });
      return;
    }
  } catch (error) {
    if (!isMissingDataError(error)) {
      yield put({
        type: actions.FETCH_HIGHLIGHTS_DATA_FAILED,
        error,
      });
      return;
    }

    yield put({
      type: actions.FETCH_HIGHLIGHTS_DATA_SUCCESS,
      data: null,
      highlightsMissing: true,
    });
    return;
  }

  try {
    let responseData = yield call(axios.get, highlightsUrl, {
      cancelToken: getCancelToken(),
    });

    if (isMissingDataResponse(responseData)) {
      yield put({
        type: actions.FETCH_HIGHLIGHTS_DATA_SUCCESS,
        data: null,
        highlightsMissing: true,
      });
      return;
    }

    yield put({
      type: actions.FETCH_HIGHLIGHTS_DATA_SUCCESS,
      data: responseData.data,
      highlightsMissing: false,
    });
  } catch (error) {
    console.log(error);
    if (axios.isCancel(error)) {
      console.log(
        `fetch ${dataset.dataPath}${id}/${filename} request canceled`,
        error.message
      );
    } else if (isMissingDataError(error)) {
      yield put({
        type: actions.FETCH_HIGHLIGHTS_DATA_SUCCESS,
        data: null,
        highlightsMissing: true,
      });
    } else {
      yield put({
        type: actions.FETCH_HIGHLIGHTS_DATA_FAILED,
        error,
      });
    }
  }
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_HIGHLIGHTS_DATA_REQUEST, fetchHighlightsData);
}
export default function* rootSaga() {
  yield all([actionWatcher()]);
}
