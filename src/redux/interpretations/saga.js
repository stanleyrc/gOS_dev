import { all, takeEvery, put, call, select } from "redux-saga/effects";
import { getCurrentState } from "./selectors";
import { getActiveRepository } from "../../services/repositories";
import EventInterpretation from "../../helpers/EventInterpretation";
import actions from "./actions";
import filteredEventsActions from "../filteredEvents/actions";
import { getCurrentUserId, getUser } from "../../helpers/userAuth";
import { signInterpretation } from "../../services/signatures/SignatureService";



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

    const state = yield select();
    const dataset = state.Settings?.dataset;
    const repository = getActiveRepository({ dataset });
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
      const isCurrentUser = !currentUserId || authorId === currentUserId || authorId === "currentUser";
      
      byId[key] = {
        ...json,
        isCurrentUser,
      };
      
      if (currentUserId && (authorId === currentUserId || authorId === "currentUser")) {
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

    const dataset = state.Settings?.dataset;
    const datasetId = state.Settings?.dataset.id;
    console.log(datasetId);
    const repository = getActiveRepository({ dataset });

    const existing = yield call([repository, repository.get], datasetId, caseId, interpretation.alterationId, interpretation.authorId);
    
    const existingData = existing ? (existing.toJSON ? existing.toJSON() : existing) : {};
    
    const mergedData = {
      ...(existingData.data || {}),
      ...(interpretation.data || {}),
    };
    
    const repoInterpretation = new EventInterpretation({
      caseId,
      datasetId,
      alterationId: interpretation.alterationId,
      gene: interpretation.gene || existingData.gene,
      variant: interpretation.variant || existingData.variant,
      variant_type: interpretation.variant_type || existingData.variant_type,
      authorId: interpretation.authorId || existingData.authorId,
      authorName: interpretation.authorName || existingData.authorName,
      lastModified: interpretation.lastModified || new Date().toISOString(),
      data: mergedData,
    });
    
    // Check if interpretation should be deleted
    let shouldDelete = false;

    if (interpretation.alterationId === "GLOBAL_NOTES") {
      // Delete global notes interpretation if notes are empty
      const notes = repoInterpretation.data?.notes;
      shouldDelete = !notes || notes.trim() === '';
    } else {
      // Check if interpretation matches original (should be deleted)
      const filteredEventsState = yield select(state => state.FilteredEvents);
      const originalFilteredEvents = filteredEventsState?.originalFilteredEvents || [];
      const originalEvent = originalFilteredEvents.find(e => e.uid === interpretation.alterationId);

      shouldDelete = repoInterpretation.matchesOriginal(originalEvent);
    }

    if (shouldDelete) {
      // Delete interpretation
      yield call([repository, repository.delete], datasetId, caseId, interpretation.alterationId, interpretation.authorId);

      const currentUserId = getCurrentUserId();

      // Update interpretations state
      yield put({
        type: actions.UPDATE_INTERPRETATION_SUCCESS,
        interpretation: null,
        deletedInterpretation: {
          alterationId: interpretation.alterationId,
          authorId: interpretation.authorId || currentUserId,
          isCurrentUser: true,
        },
      });

      // Revert filtered event to original (only for alterations)
      if (interpretation.alterationId !== "GLOBAL_NOTES") {
        const filteredEventsState = yield select(state => state.FilteredEvents);
        const originalFilteredEvents = filteredEventsState?.originalFilteredEvents || [];
        const originalEvent = originalFilteredEvents.find(e => e.uid === interpretation.alterationId);
        yield put(filteredEventsActions.revertFilteredEvent(interpretation.alterationId, originalEvent));
      }

      return;
    }
    
    // Sign the interpretation before saving
    const user = getUser();
    if (user && user.privateKey) {
      const interpretationData = repoInterpretation.toJSON();
      const signature = yield call(signInterpretation, interpretationData, user);
      repoInterpretation.signature = signature;
    }
    
    yield call([repository, repository.save], repoInterpretation);
    
    const currentUserId = getCurrentUserId();
    const savedJson = repoInterpretation.toJSON();
    const isCurrentUser = !currentUserId || savedJson.authorId === currentUserId || savedJson.authorId === "currentUser";
    
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

    const state = yield select();
    const dataset = state.Settings?.dataset;
    const datasetId = state.Settings?.dataset?.id;
    const repository = getActiveRepository({ dataset });
    const interpretations = yield call([repository, repository.getForCase], datasetId, caseId);

    const currentUserId = getCurrentUserId();

    for (const interp of interpretations || []) {
      const authorId = interp.authorId || "currentUser";
      if (authorId === currentUserId) {
        yield call([repository, repository.delete], datasetId, caseId, interp.alterationId, interp.authorId);
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

function* updateAuthorName(action) {
  const { authorId, newAuthorName } = action;

  try {
    if (!authorId || !newAuthorName) {
      throw new Error("Missing authorId or newAuthorName");
    }

    const state = yield select();
    const dataset = state.Settings?.dataset;
    const datasetId = state.Settings?.dataset?.id;
    const repository = getActiveRepository({ dataset });
    
    // Get all interpretations from repository
    const allInterpretations = yield call([repository, repository.getAll]);
    
    // Filter interpretations by authorId
    const interpretationsToUpdate = allInterpretations.filter(
      interp => interp.authorId === authorId
    );

    console.log(`Updating ${interpretationsToUpdate.length} interpretations for authorId ${authorId}`);

    // Update each interpretation's authorName
    for (const interp of interpretationsToUpdate) {
      const interpData = interp.toJSON ? interp.toJSON() : interp;
      
      const updatedInterpretation = new EventInterpretation({
        ...interpData,
        datasetId,
        authorName: newAuthorName,
        lastModified: new Date().toISOString(),
      });
      
      // Sign the updated interpretation
      const user = getUser();
      if (user && user.privateKey) {
        const interpretationData = updatedInterpretation.toJSON();
        const signature = yield call(signInterpretation, interpretationData, user);
        updatedInterpretation.signature = signature;
      }
      
      yield call([repository, repository.save], updatedInterpretation);
    }

    // Dispatch success with updated interpretations
    yield put({
      type: actions.UPDATE_AUTHOR_NAME_SUCCESS,
      authorId,
      newAuthorName,
      updatedCount: interpretationsToUpdate.length,
    });

    console.log(`Successfully updated ${interpretationsToUpdate.length} interpretations`);
  } catch (error) {
    console.error("Error updating author name:", error);
    yield put({
      type: actions.UPDATE_AUTHOR_NAME_FAILED,
      error: error.message || "Failed to update author name",
    });
  }
}

function* actionWatcher() {
  yield takeEvery(actions.FETCH_INTERPRETATIONS_FOR_CASE_REQUEST, fetchInterpretationsForCase);
  yield takeEvery(actions.UPDATE_INTERPRETATION_REQUEST, updateInterpretation);
  yield takeEvery(actions.CLEAR_CASE_INTERPRETATIONS_REQUEST, clearCaseInterpretations);
  yield takeEvery(actions.UPDATE_AUTHOR_NAME_REQUEST, updateAuthorName);
}

export default function* rootSaga() {
  yield all([actionWatcher()]);
}
