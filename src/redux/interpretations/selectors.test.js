/** @jest-environment node */

import actions from "./actions";
import reducer from "./reducer";
import { areCaseInterpretationsReady } from "./selectors";

const context = { caseId: "case-1", datasetId: "dataset-1" };
const stateWith = (Interpretations) => ({
  CaseReport: { id: context.caseId },
  Settings: { dataset: { id: context.datasetId } },
  Interpretations,
});
const fetched = () => reducer(undefined, {
  type: actions.FETCH_INTERPRETATIONS_FOR_CASE_SUCCESS,
  ...context,
  byId: {}, selected: {}, allInterpretations: [],
});

describe("case interpretation readiness", () => {
  it("requires successful hydration, including when the case has no overrides", () => {
    expect(areCaseInterpretationsReady(stateWith(reducer(undefined, {})))).toBe(false);
    expect(areCaseInterpretationsReady(stateWith(fetched()))).toBe(true);
    expect(areCaseInterpretationsReady(stateWith({ status: "succeeded" }))).toBe(false);
  });

  it("does not reuse hydration for another case or dataset", () => {
    const state = stateWith(fetched());
    expect(areCaseInterpretationsReady({ ...state, CaseReport: { id: "case-2" } })).toBe(false);
    expect(areCaseInterpretationsReady({ ...state, Settings: { dataset: { id: "dataset-2" } } })).toBe(false);
    expect(areCaseInterpretationsReady({ Interpretations: fetched() })).toBe(false);
  });

  it.each([
    actions.FETCH_INTERPRETATIONS_FOR_CASE_REQUEST,
    actions.FETCH_INTERPRETATIONS_FOR_CASE_FAILED,
    actions.CLEAR_CASE_INTERPRETATIONS_SUCCESS,
  ])("invalidates hydration on %s", (type) => {
    expect(areCaseInterpretationsReady(stateWith(reducer(fetched(), { type })))).toBe(false);
  });

  it("keeps reporting blocked until every active-context write completes", () => {
    let state = fetched();
    const begin = { type: actions.INTERPRETATION_WRITE_STARTED, ...context };
    const finish = { type: actions.INTERPRETATION_WRITE_FINISHED, ...context };
    state = reducer(reducer(state, begin), begin);
    state = reducer(state, { type: actions.UPDATE_INTERPRETATION_SUCCESS });
    state = reducer(state, finish);
    expect(areCaseInterpretationsReady(stateWith(state))).toBe(false);
    state = reducer(state, finish);
    expect(areCaseInterpretationsReady(stateWith(state))).toBe(true);
    expect(state.pendingWrites).toEqual([]);
    expect(state.writeVersion).toBe(4);
    state = reducer(state, { ...begin, caseId: "other-case" });
    expect(areCaseInterpretationsReady(stateWith(state))).toBe(true);
  });

  it("blocks every case in the dataset during an author rename", () => {
    const state = reducer(fetched(), { type: actions.INTERPRETATION_WRITE_STARTED, datasetId: context.datasetId, caseId: null });
    expect(areCaseInterpretationsReady(stateWith(state))).toBe(false);
  });

  it("preserves hydration failure separately when a concurrent save succeeds", () => {
    let state = reducer(fetched(), { type: actions.FETCH_INTERPRETATIONS_FOR_CASE_FAILED, error: "Read failed" });
    state = reducer(state, { type: actions.UPDATE_INTERPRETATION_SUCCESS });
    expect(state.loadError).toBe("Read failed");
    expect(areCaseInterpretationsReady(stateWith(state))).toBe(false);
    state = reducer(state, { type: actions.FETCH_INTERPRETATIONS_FOR_CASE_REQUEST });
    expect(state.loadError).toBeNull();
  });

  it("waits for saves, but permits the last persisted value after a save failure", () => {
    const saving = reducer(fetched(), { type: actions.UPDATE_INTERPRETATION_REQUEST });
    expect(areCaseInterpretationsReady(stateWith(saving))).toBe(false);
    const failed = reducer(saving, { type: actions.UPDATE_INTERPRETATION_FAILED, error: "offline" });
    expect(areCaseInterpretationsReady(stateWith(failed))).toBe(true);
    const saved = reducer(saving, { type: actions.UPDATE_INTERPRETATION_SUCCESS });
    expect(areCaseInterpretationsReady(stateWith(saved))).toBe(true);
  });
});
