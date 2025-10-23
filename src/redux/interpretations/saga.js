import { all, takeEvery, put, call, select } from "redux-saga/effects";
import { getCurrentState } from "./selectors";
import { getActiveRepository } from "../../services/repositories";
import EventInterpretation from "../../helpers/EventInterpretation";
import actions from "./actions";

function getCurrentUserId() {
  try {
    const userStr = localStorage.getItem('gOS_user');
    if (userStr) {
      const user = JSON.parse(userStr);
      return user.userId;
    }
  } catch (e) {}
  return null;
}

function* fetchInterpretationsForCase(action) {
  const { caseId } = action;

  try {
    if (!caseId) {
      yield put({
        type: actions.FETCH_INTERPRETATIONS_FOR_CASE_SUCCESS,
        byId: {},
        selected: {},
        allInterpretations: [],
      });
      return;
    }

    const repository = getActiveRepository();
    const allInterpretations = yield call([repository, repository.getAll]);
    const interpretations = allInterpretations.filter(i => i.caseId === caseId);
    
    const byId = {};
    const selected = {};
    
    const currentUserId = getCurrentUserId();
    
    for (const interp of interpretations || []) {
      if (!interp.hasOverrides()) continue;
      
      const json = interp.toJSON ? interp.toJSON() : interp;
      const authorId = json.authorId || "currentUser";
      const key = `${json.alterationId}___${authorId}`;
      const isCurrentUser = !currentUserId || authorId === currentUserId;
      
      byId[key] = {
        ...json,
        isCurrentUser,
      };
      
      if (isCurrentUser) {
        selected[json.alterationId] = key;
      }
    }

    yield put({
      type: actions.FETCH_INTERPRETATIONS_FOR_CASE_SUCCESS,
      byId,
      selected,
      allInterpretations,
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
    const caseId = interpretation.caseId || state.CaseReport?.id;
    
    if (!caseId || !interpretation.alterationId) {
      throw new Error("Missing caseId or alterationId");
    }

    const repository = getActiveRepository();
    
    const existing = yield call([repository, repository.get], caseId, interpretation.alterationId, interpretation.authorId);
    
    const existingData = existing ? (existing.toJSON ? existing.toJSON() : existing) : {};
    
    const mergedData = {
      ...(existingData.data || {}),
      ...(interpretation.data || {}),
    };
    
    const repoInterpretation = new EventInterpretation({
      caseId,
      alterationId: interpretation.alterationId,
      gene: interpretation.gene || existingData.gene,
      variant: interpretation.variant || existingData.variant,
      authorId: interpretation.authorId || existingData.authorId,
      authorName: interpretation.authorName || existingData.authorName,
      lastModified: interpretation.lastModified || new Date().toISOString(),
      data: mergedData,
    });
    
    yield call([repository, repository.save], repoInterpretation);
    
    const currentUserId = getCurrentUserId();
    const savedJson = repoInterpretation.toJSON();
    const isCurrentUser = !currentUserId || savedJson.authorId === currentUserId;
    
    const updatedInterpretation = {
      ...savedJson,
      isCurrentUser,
    };
    
    yield put({
      type: actions.UPDATE_INTERPRETATION_SUCCESS,
      interpretation: updatedInterpretation,
    });
  } catch (error) {
    console.error("Error updating interpretation:", error);
    yield put({
      type: actions.UPDATE_INTERPRETATION_FAILED,
      error: error.message || "Failed to update interpretation",
    });
  }
}

function* clearCaseInterpretations(action) {
  const { caseId } = action;

  try {
    if (!caseId) {
      throw new Error("Missing caseId");
    }

    const repository = getActiveRepository();
    const interpretations = yield call([repository, repository.getForCase], caseId);

    const currentUserId = getCurrentUserId();

    for (const interp of interpretations || []) {
      const authorId = interp.authorId || "currentUser";
      if (authorId === currentUserId) {
        yield call([repository, repository.delete], caseId, interp.alterationId, interp.authorId);
      }
    }

    yield put({
      type: actions.CLEAR_CASE_INTERPRETATIONS_SUCCESS,
      caseId,
    });
  } catch (error) {
    console.error("Error clearing case interpretations:", error);
    yield put({
      type: actions.CLEAR_CASE_INTERPRETATIONS_FAILED,
      error: error.message || "Failed to clear case interpretations",
    });
  }
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_INTERPRETATIONS_FOR_CASE_REQUEST, fetchInterpretationsForCase);
  yield takeEvery(actions.UPDATE_INTERPRETATION_REQUEST, updateInterpretation);
  yield takeEvery(actions.CLEAR_CASE_INTERPRETATIONS_REQUEST, clearCaseInterpretations);
}

export default function* rootSaga() {
  yield all([actionWatcher()]);
}
