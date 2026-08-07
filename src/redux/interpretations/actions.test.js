/** @jest-environment node */

import actions from "./actions";

describe("interpretation actions", () => {
  it("keeps the existing update request shape when no completion is supplied", () => {
    const interpretation = { alterationId: "alteration-1" };

    expect(actions.updateInterpretation(interpretation)).toEqual({
      type: actions.UPDATE_INTERPRETATION_REQUEST,
      interpretation,
    });
  });

  it("optionally carries a completion acknowledgment", () => {
    const interpretation = { alterationId: "alteration-1" };
    const completion = jest.fn();

    expect(actions.updateInterpretation(interpretation, completion)).toEqual({
      type: actions.UPDATE_INTERPRETATION_REQUEST,
      interpretation,
      completion,
    });
  });

  it("keeps the existing clear request shape without a completion", () => {
    expect(actions.clearCaseInterpretations("case-1")).toEqual({
      type: actions.CLEAR_CASE_INTERPRETATIONS_REQUEST,
      caseId: "case-1",
    });
  });

  it("optionally acknowledges clear requests", () => {
    const completion = jest.fn();

    expect(actions.clearCaseInterpretations("case-1", completion)).toEqual({
      type: actions.CLEAR_CASE_INTERPRETATIONS_REQUEST,
      caseId: "case-1",
      completion,
    });
  });

  it("additively carries the captured dataset for an acknowledged clear", () => {
    const completion = jest.fn();
    const dataset = { id: "dataset-1", repository: "indexeddb" };

    expect(
      actions.clearCaseInterpretations("case-1", completion, dataset),
    ).toEqual({
      type: actions.CLEAR_CASE_INTERPRETATIONS_REQUEST,
      caseId: "case-1",
      completion,
      dataset,
    });
  });
});
