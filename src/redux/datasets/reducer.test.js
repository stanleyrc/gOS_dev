/** @jest-environment node */

import actions from "./actions";
import reducer from "./reducer";

describe("Datasets selection failures", () => {
  it("preserves accessible datasets when a saved search references a missing dataset", () => {
    const records = [{ id: "dataset-a" }];
    const state = {
      ...reducer(undefined, { type: "@@INIT" }),
      records,
    };
    const error = new Error("DATASET_NOT_AVAILABLE");

    const nextState = reducer(state, {
      type: actions.SELECT_DATASET_FAILED,
      error,
    });

    expect(nextState.records).toBe(records);
    expect(nextState.error).toBeNull();
    expect(nextState.selectionError).toBe(error);
  });
});
