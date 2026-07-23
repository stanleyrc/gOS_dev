/** @jest-environment node */

import actions from "./actions";
import reducer from "./reducer";

describe("CaseReport reducer", () => {
  it("clears a report without leaving detail loading", () => {
    const loaded = reducer(undefined, {
      type: actions.FETCH_CASE_REPORT_SUCCESS,
      id: "case-1",
      metadata: { pair: "PAIR-1" },
    });

    expect(reducer(loaded, actions.clearCaseReport())).toMatchObject({
      id: null,
      metadata: {},
      error: null,
      loading: false,
    });
  });
});
