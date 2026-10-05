import { all, call, delay, fork, put, race, select, take, takeEvery, takeLatest } from "redux-saga/effects";
import actions from "./actions";
import singleCellActions from "../singleCell/actions";
import {
  analysisApiBase,
  fetchCatalogue,
  fetchExpression,
  fetchHistory,
  fetchJob,
  fetchJobResult,
  fetchRnaStatus,
  submitJob,
} from "./api";

const POLL_MS = 1500;
const TERMINAL = new Set(["done", "failed"]);
const polling = new Set();

const getState = (state) => state;

function* init() {
  const state = yield select(getState);
  const base = analysisApiBase(state.Settings.dataset);
  const patient = state.SingleCell.patient;
  if (!base || !patient) {
    yield put({ type: actions.SCA_DISABLED });
    return;
  }
  const context = { dataset: patient.datasetId, patient: patient.caseReportId };
  yield put({ type: actions.SCA_INIT, base, context });
  try {
    const [catalogue, rna, history] = yield all([
      call(fetchCatalogue, base),
      call(fetchRnaStatus, base, context.dataset, context.patient),
      call(fetchHistory, base, context.dataset, context.patient),
    ]);
    yield put({
      type: actions.SCA_CATALOGUE_LOADED,
      analyses: catalogue.analyses || [],
      geneSets: catalogue.gene_sets || [],
    });
    yield put({ type: actions.SCA_RNA_STATUS, rna });
    yield put({ type: actions.SCA_HISTORY_LOADED, jobs: history.jobs || [] });
    for (const job of history.jobs || []) {
      if (!TERMINAL.has(job.state)) yield fork(pollJob, base, job.id);
    }
  } catch (error) {
    yield put({ type: actions.SCA_SERVICE_ERROR, error: error.message });
  }
}

function* loadResult(base, id) {
  try {
    const result = yield call(fetchJobResult, base, id);
    yield put({ type: actions.SCA_RESULT_LOADED, id, result });
  } catch (error) {
    yield put({ type: actions.SCA_RESULT_FAILED, id, error: error.message });
  }
}

function* pollJob(base, id) {
  if (polling.has(id)) return;
  polling.add(id);
  try {
    const { cancelled } = yield race({
      done: call(function* loop() {
        for (;;) {
          yield delay(POLL_MS);
          const { job } = yield call(fetchJob, base, id);
          yield put({ type: actions.SCA_JOB_UPDATED, job });
          if (TERMINAL.has(job.state)) {
            if (job.state === "done") yield call(loadResult, base, id);
            return;
          }
        }
      }),
      cancelled: take(singleCellActions.FETCH_SINGLE_CELL_DATA_REQUEST),
    });
    if (cancelled) return;
  } catch (error) {
    yield put({ type: actions.SCA_RESULT_FAILED, id, error: error.message });
  } finally {
    polling.delete(id);
  }
}

function* submit(action) {
  const { ScAnalysis } = yield select(getState);
  const { base, context, groups } = ScAnalysis;
  const body = {
    analysis: action.analysis,
    dataset: context.dataset,
    params: action.params || {},
  };
  if (action.sourceJob) {
    body.source_job = action.sourceJob;
  } else {
    if (!groups.A || !groups.B) {
      yield put({ type: actions.SCA_SUBMIT_FAILED, error: "Set both group A and group B first." });
      return;
    }
    body.groups = { A: groups.A.groups, B: groups.B.groups };
    body.labels = { A: groups.A.label, B: groups.B.label };
  }
  try {
    const { job } = yield call(submitJob, base, body);
    yield put({ type: actions.SCA_JOB_UPDATED, job, fromSubmit: true });
    if (job.state === "done") yield call(loadResult, base, job.id);
    else if (!TERMINAL.has(job.state)) yield fork(pollJob, base, job.id);
  } catch (error) {
    yield put({ type: actions.SCA_SUBMIT_FAILED, error: error.message });
  }
}

function* selectJob(action) {
  const { ScAnalysis } = yield select(getState);
  const job = ScAnalysis.jobs[action.id];
  if (!job || !ScAnalysis.base) return;
  if (job.state === "done" && !ScAnalysis.results[action.id]) {
    yield call(loadResult, ScAnalysis.base, action.id);
  } else if (!TERMINAL.has(job.state)) {
    yield fork(pollJob, ScAnalysis.base, action.id);
  }
}

function* expression(action) {
  const { ScAnalysis } = yield select(getState);
  const { base, context } = ScAnalysis;
  if (!base || !context) return;
  try {
    const data = yield call(fetchExpression, base, context.dataset, context.patient, action.gene);
    const values = {};
    let max = 0;
    data.ids.forEach((id, k) => {
      values[id] = data.values[k];
      if (data.values[k] > max) max = data.values[k];
    });
    yield put({
      type: actions.SCA_EXPRESSION_LOADED,
      gene: action.gene,
      resolvedGene: data.gene,
      values,
      max,
    });
  } catch (error) {
    yield put({ type: actions.SCA_EXPRESSION_FAILED, gene: action.gene, error: error.message });
  }
}

function* actionWatcher() {
  yield takeLatest(singleCellActions.FETCH_SINGLE_CELL_DATA_SUCCESS, init);
  yield takeEvery(actions.SCA_SUBMIT_JOB, submit);
  yield takeEvery(actions.SCA_SELECT_JOB, selectJob);
  yield takeLatest(actions.SCA_FETCH_EXPRESSION, expression);
}

export default function* rootSaga() {
  yield all([actionWatcher()]);
}
