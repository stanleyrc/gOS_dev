import { all, call, put, select, takeLatest } from "redux-saga/effects";
import axios from "axios";
import filteredEventsActions from "../filteredEvents/actions";
import interpretationsActions from "../interpretations/actions";
import { getActiveRepository } from "../../services/repositories";
import {
  createCaseInterpretationImportUrls,
  parseCaseInterpretationImport,
} from "../../helpers/caseInterpretationImport";
import {
  isMissingDataError,
  isMissingDataResponse,
} from "../../helpers/dataAvailability";
import { getCancelToken } from "../../helpers/cancelToken";

export function* fetchOptionalImportSource(url) {
  try {
    const response = yield call(axios.get, url, {
      cancelToken: getCancelToken(),
      responseType: "text",
    });
    if (isMissingDataResponse(response)) {
      return { state: "missing" };
    }
    return { state: "present", text: response.data };
  } catch (error) {
    if (axios.isCancel(error)) throw error;
    if (isMissingDataError(error)) return { state: "missing" };
    return { state: "failed", error };
  }
}

export function* importCaseInterpretations(action) {
  const state = yield select();
  const dataset = state.Settings?.dataset;
  const caseId = state.CaseReport?.id;
  const sourceStem = state.CaseReport?.metadata?.pair || caseId;
  const events = action.filteredEvents || [];
  const actionMatchesActiveContext =
    `${action.caseId}` === `${caseId}` &&
    `${action.datasetId}` === `${dataset?.id}`;

  if (
    !actionMatchesActiveContext ||
    !dataset?.dataPath ||
    !dataset?.id ||
    !caseId ||
    events.length === 0
  ) {
    return;
  }

  const urls = createCaseInterpretationImportUrls({
    dataPath: dataset.dataPath,
    caseId,
    sourceStem,
  });

  try {
    const [userTierSource, tierSource] = yield all([
      call(fetchOptionalImportSource, urls.userTier),
      call(fetchOptionalImportSource, urls.tier),
    ]);

    if (userTierSource.state === "missing" && tierSource.state === "missing") {
      return;
    }
    if (userTierSource.state !== "present" || tierSource.state !== "present") {
      console.warn("Case interpretation import is incomplete or unavailable");
      return;
    }

    const result = parseCaseInterpretationImport({
      userTierText: userTierSource.text,
      tierText: tierSource.text,
      events,
      datasetId: dataset.id,
      caseId,
    });

    if (result.state === "rejected") {
      console.warn("Case interpretation import rejected:", result.issues.join("; "));
      return;
    }
    if (result.interpretations.length === 0) return;

    const stateBeforeWrite = yield select();
    const caseIsStillActive =
      `${stateBeforeWrite.CaseReport?.id}` === `${caseId}`;
    const datasetIsStillActive =
      `${stateBeforeWrite.Settings?.dataset?.id}` === `${dataset.id}`;
    if (!caseIsStillActive || !datasetIsStillActive) return;

    const repository = getActiveRepository({ dataset });
    yield call(
      [repository, repository.bulkSave],
      result.interpretations,
    );

    const latestState = yield select();
    const caseRemainsActive = `${latestState.CaseReport?.id}` === `${caseId}`;
    const datasetRemainsActive =
      `${latestState.Settings?.dataset?.id}` === `${dataset.id}`;
    if (caseRemainsActive && datasetRemainsActive) {
      yield put(interpretationsActions.fetchInterpretationsForCase(caseId));
    }
  } catch (error) {
    if (axios.isCancel(error)) return;
    console.warn("Case interpretation import failed:", error);
  }
}

function* actionWatcher() {
  yield takeLatest(
    filteredEventsActions.FETCH_FILTERED_EVENTS_SUCCESS,
    importCaseInterpretations,
  );
}

export default function* rootSaga() {
  yield all([actionWatcher()]);
}
