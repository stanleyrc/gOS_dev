import { all, takeEvery, put, call, select } from "redux-saga/effects";
import { getCurrentState } from "./selectors";
import actions from "./actions";

function* fetchInterpretationsForCase(action) {
  const { caseId } = action;
  
  try {
    const state = yield select(getCurrentState);
    
    const byId = {};
    const selected = {};

    yield put({
      type: actions.FETCH_INTERPRETATIONS_FOR_CASE_SUCCESS,
      byId,
      selected,
    });
  } catch (error) {
    console.error("Error fetching interpretations for case:", error);
    yield put({
      type: actions.FETCH_INTERPRETATIONS_FOR_CASE_FAILED,
      error: error.message || "Failed to fetch interpretations",
    });
  }
}

function* updateInterpretation(action) {
  const { interpretation } = action;
  
  try {
    const state = yield select(getCurrentState);
    
    yield put({
      type: actions.UPDATE_INTERPRETATION_SUCCESS,
      interpretation,
    });
  } catch (error) {
    console.error("Error updating interpretation:", error);
    yield put({
      type: actions.UPDATE_INTERPRETATION_FAILED,
      error: error.message || "Failed to update interpretation",
    });
  }
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_INTERPRETATIONS_FOR_CASE_REQUEST, fetchInterpretationsForCase);
  yield takeEvery(actions.UPDATE_INTERPRETATION_REQUEST, updateInterpretation);
}

export default function* rootSaga() {
  yield all([actionWatcher()]);
}
