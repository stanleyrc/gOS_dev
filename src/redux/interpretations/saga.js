import {
  all,
  takeEvery,
  takeLatest,
  put,
  call,
  select,
} from "redux-saga/effects";
import { getCurrentState } from "./selectors";
import { getActiveRepository } from "../../services/repositories";
import EventInterpretation from "../../helpers/EventInterpretation";
import actions from "./actions";
import filteredEventsActions from "../filteredEvents/actions";
import { getCurrentUserId, getUser } from "../../helpers/userAuth";
import { signInterpretation } from "../../services/signatures/SignatureService";

const getAcceptedCaseIds = (
  state,
  caseId,
  datasetId = state.Settings?.dataset?.id,
) => {
  const records = (state.CaseReports?.datafiles || []).filter(
    (record) =>
      record.datasetId == null || `${record.datasetId}` === `${datasetId}`
  );
  const sourceIds = new Set(
    records.map((record) => record.caseReportId).filter(Boolean)
  );
  const currentRecord = records.find(
    (record) => `${record.caseReportId}` === `${caseId}`
  );
  const legacyPair = currentRecord?.pair;
  const legacyPairIsSafe =
    legacyPair &&
    `${legacyPair}` !== `${caseId}` &&
    !sourceIds.has(legacyPair) &&
    records.filter((record) => record.pair === legacyPair).length === 1;

  return new Set([caseId, ...(legacyPairIsSafe ? [legacyPair] : [])]);
};

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
    const datasetId = dataset?.id;
    const acceptedCaseIds = getAcceptedCaseIds(state, caseId);
    const repository = getActiveRepository({ dataset });
    const allInterpretations = yield call([repository, repository.getAll]);
    const interpretationsForCase = allInterpretations.filter(
      (interpretation) =>
        acceptedCaseIds.has(interpretation.caseId) &&
        interpretation.datasetId === datasetId
    );
    
    const byId = {};
    const selected = {};
    const priorities = {};
    
    const currentUserId = getCurrentUserId();
    
    for (const interp of interpretationsForCase || []) {
      if (!interp.hasOverrides()) continue;
      
      const json = interp.toJSON ? interp.toJSON() : interp;
      const authorId = json.authorId || "currentUser";
      const key = `${json.alterationId}___${authorId}___${caseId}`;
      const priority = `${json.caseId}` === `${caseId}` ? 2 : 1;
      if ((priorities[key] || 0) > priority) continue;
      const isCurrentUser = !currentUserId || authorId === currentUserId || authorId === "currentUser";
      
      priorities[key] = priority;
      byId[key] = {
        ...json,
        caseId,
        storageCaseId: json.caseId,
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

function acknowledgeCompletion(completion, error, result) {
  if (typeof completion !== "function") return;

  try {
    completion(error, result);
  } catch (completionError) {
    console.error("Interpretation completion callback failed:", completionError);
  }
}

export function* updateInterpretation(action) {
  const { interpretation, completion } = action;
  
  try {
    const state = yield select(getCurrentState);
    const caseId = interpretation.caseId || state.CaseReport?.id;
    let storageCaseId = interpretation.storageCaseId || caseId;
    
    if (!caseId || !interpretation.alterationId) {
      throw new Error("Missing caseId or alterationId");
    }

    const dataset = state.Settings?.dataset;
    const datasetId = state.Settings?.dataset.id;
    console.log(datasetId);
    const repository = getActiveRepository({ dataset });

    let existing = yield call([repository, repository.get], datasetId, storageCaseId, interpretation.alterationId, interpretation.authorId);
    if (!existing && `${storageCaseId}` === `${caseId}`) {
      const acceptedCaseIds = getAcceptedCaseIds(state, caseId);
      for (const candidateCaseId of acceptedCaseIds) {
        if (`${candidateCaseId}` === `${caseId}`) continue;
        const legacyInterpretation = yield call(
          [repository, repository.get],
          datasetId,
          candidateCaseId,
          interpretation.alterationId,
          interpretation.authorId
        );
        if (legacyInterpretation) {
          storageCaseId = candidateCaseId;
          existing = legacyInterpretation;
          break;
        }
      }
    }
    
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
      yield call([repository, repository.delete], datasetId, storageCaseId, interpretation.alterationId, interpretation.authorId);
      if (`${storageCaseId}` !== `${caseId}`) {
        yield call(
          [repository, repository.delete],
          datasetId,
          caseId,
          interpretation.alterationId,
          interpretation.authorId
        );
      }

      const currentUserId = getCurrentUserId();

      // Update interpretations state
      const deletedInterpretation = {
        alterationId: interpretation.alterationId,
        authorId: interpretation.authorId || currentUserId,
        caseId: interpretation.caseId || caseId,
        isCurrentUser: true,
      };

      yield put({
        type: actions.UPDATE_INTERPRETATION_SUCCESS,
        interpretation: null,
        deletedInterpretation,
      });

      // Revert filtered event to original (only for alterations)
      if (interpretation.alterationId !== "GLOBAL_NOTES") {
        const filteredEventsState = yield select(state => state.FilteredEvents);
        const originalFilteredEvents = filteredEventsState?.originalFilteredEvents || [];
        const originalEvent = originalFilteredEvents.find(e => e.uid === interpretation.alterationId);
        yield put(filteredEventsActions.revertFilteredEvent(interpretation.alterationId, originalEvent));
      }

      yield call(acknowledgeCompletion, completion, null, {
        deleted: true,
        interpretation: null,
        deletedInterpretation,
      });
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
    if (`${storageCaseId}` !== `${caseId}`) {
      yield call(
        [repository, repository.delete],
        datasetId,
        storageCaseId,
        interpretation.alterationId,
        interpretation.authorId
      );
    }
    
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
    yield call(acknowledgeCompletion, completion, null, {
      deleted: false,
      interpretation: updatedInterpretation,
    });
  } catch (error) {
    const updateError =
      error instanceof Error
        ? error
        : new Error(error?.message || "Failed to update interpretation");
    console.error("Error updating interpretation:", updateError);
    yield put({
      type: actions.UPDATE_INTERPRETATION_FAILED,
      error: updateError.message || "Failed to update interpretation",
    });
    yield call(acknowledgeCompletion, completion, updateError, null);
  }
}

export function* clearCaseInterpretations(action) {
  const { caseId, completion, dataset: capturedDataset } = action;

  try {
    if (!caseId) {
      throw new Error("Missing caseId");
    }

    const state = yield select();
    const dataset = capturedDataset || state.Settings?.dataset;
    const datasetId = dataset?.id;
    const repository = getActiveRepository({ dataset });
    const acceptedCaseIds = getAcceptedCaseIds(state, caseId, datasetId);
    const currentUserId = getCurrentUserId();

    for (const storedCaseId of acceptedCaseIds) {
      const interpretations = yield call(
        [repository, repository.getForCase],
        datasetId,
        storedCaseId
      );
      for (const interp of interpretations || []) {
        const authorId = interp.authorId || "currentUser";
        if (authorId === currentUserId) {
          yield call(
            [repository, repository.delete],
            datasetId,
            storedCaseId,
            interp.alterationId,
            interp.authorId
          );
        }
      }
    }

    yield put({
      type: actions.CLEAR_CASE_INTERPRETATIONS_SUCCESS,
      caseId,
    });
    yield call(acknowledgeCompletion, completion, null, { caseId });
  } catch (error) {
    const clearError =
      error instanceof Error
        ? error
        : new Error(error?.message || "Failed to clear case interpretations");
    console.error("Error clearing case interpretations:", clearError);
    yield put({
      type: actions.CLEAR_CASE_INTERPRETATIONS_FAILED,
      error: clearError.message || "Failed to clear case interpretations",
    });
    yield call(acknowledgeCompletion, completion, clearError, null);
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
  yield takeLatest(
    actions.FETCH_INTERPRETATIONS_FOR_CASE_REQUEST,
    fetchInterpretationsForCase
  );
  yield takeEvery(actions.UPDATE_INTERPRETATION_REQUEST, updateInterpretation);
  yield takeEvery(actions.CLEAR_CASE_INTERPRETATIONS_REQUEST, clearCaseInterpretations);
  yield takeEvery(actions.UPDATE_AUTHOR_NAME_REQUEST, updateAuthorName);
}

export default function* rootSaga() {
  yield all([actionWatcher()]);
}
