/** @jest-environment node */

import actions from "./actions";
import reducer from "./reducer";

const interpretation = {
  datasetId: "dataset-1",
  caseId: "case-1",
  alterationId: "event-1",
  authorId: "user-1",
  gene: "TP53",
  data: { tier: "1" },
};

describe("interpretation repository-wide history", () => {
  it("clears active interpretation state when another case fetch starts", () => {
    const state = reducer(
      {
        status: "succeeded",
        byId: { one: interpretation },
        selected: { "event-1": "one" },
        byGene: { TP53: { one: interpretation } },
      },
      { type: actions.FETCH_INTERPRETATIONS_FOR_CASE_REQUEST },
    );

    expect(state.byId).toEqual({});
    expect(state.selected).toEqual({});
    expect(state.byGene).not.toEqual({});
  });

  it("preserves equal case/event/author records from different datasets", () => {
    const state = reducer(undefined, {
      type: actions.FETCH_INTERPRETATIONS_FOR_CASE_SUCCESS,
      byId: {},
      selected: {},
      allInterpretations: [
        interpretation,
        { ...interpretation, datasetId: "dataset-2", data: { tier: "2" } },
      ],
    });

    expect(Object.values(state.byGene.TP53)).toHaveLength(2);
  });

  it("replaces a migrated legacy storage history key", () => {
    const legacy = {
      ...interpretation,
      caseId: "legacy-case",
    };
    const legacyKey = JSON.stringify([
      legacy.datasetId,
      legacy.caseId,
      legacy.alterationId,
      legacy.authorId,
    ]);
    const state = reducer(
      {
        status: "pending",
        byId: {},
        selected: {},
        byGene: { TP53: { [legacyKey]: legacy } },
      },
      {
        type: actions.UPDATE_INTERPRETATION_SUCCESS,
        interpretation,
        replacedInterpretation: legacy,
      },
    );

    expect(Object.values(state.byGene.TP53)).toEqual([interpretation]);
  });

  it("clears stale repository-wide history after a failed fetch", () => {
    const state = reducer(
      { status: "succeeded", byId: {}, selected: {}, byGene: { TP53: { one: interpretation } } },
      { type: actions.FETCH_INTERPRETATIONS_FOR_CASE_FAILED, error: "failed" },
    );

    expect(state.byGene).toEqual({});
  });

  it("clears stale history while a post-clear refresh is requested", () => {
    const state = reducer(
      { status: "pending", byId: {}, selected: {}, byGene: { TP53: { one: interpretation } } },
      { type: actions.CLEAR_CASE_INTERPRETATIONS_SUCCESS },
    );

    expect(state.byGene).toEqual({});
  });
});
