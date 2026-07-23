/** @jest-environment node */

import actions from "./actions";
import reducer from "./reducer";

describe("CaseReport reducer", () => {
  it("clears detail state without leaving a loading request behind", () => {
    const loaded = reducer(undefined, {
      type: actions.FETCH_CASE_REPORT_SUCCESS,
      id: "PAIR-1",
      metadata: { pair: "PAIR-1" },
    });

    const cleared = reducer(loaded, actions.clearCaseReport());

    expect(cleared).toMatchObject({
      id: null,
      metadata: {},
      error: null,
      loading: false,
    });
  });
});
