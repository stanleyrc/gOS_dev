/** @jest-environment node */

import actions from "./actions";
import reducer from "./reducer";

describe("PopulationStatistics reducer", () => {
  it("clears a stale current cohort when recomputation fails", () => {
    const loaded = reducer(undefined, {
      type: actions.FETCH_COHORT_STATISTICS_SUCCESS,
      searchId: "search-1",
      comparison: false,
      cohort: [{ id: "tmb" }],
    });

    const waiting = reducer(loaded, {
      type: actions.FETCH_COHORT_STATISTICS_REQUEST,
      searchId: "search-2",
      comparison: false,
    });
    const failed = reducer(waiting, {
      type: actions.FETCH_COHORT_STATISTICS_FAILED,
      searchId: "search-2",
      comparison: false,
      error: new Error("failed"),
    });

    expect(failed.cohort).toEqual([]);
    expect(failed.cohortSearchId).toBeNull();
  });

  it("ignores a stale current-cohort result", () => {
    const waiting = reducer(undefined, {
      type: actions.FETCH_COHORT_STATISTICS_REQUEST,
      searchId: "search-new",
      comparison: false,
    });
    const stale = reducer(waiting, {
      type: actions.FETCH_COHORT_STATISTICS_SUCCESS,
      searchId: "search-old",
      comparison: false,
      cohort: [{ id: "old" }],
    });

    expect(stale).toBe(waiting);
  });

  it("ignores an old result after the latest request has completed", () => {
    const waiting = reducer(undefined, {
      type: actions.FETCH_COHORT_STATISTICS_REQUEST,
      searchId: "search-new",
      comparison: false,
    });
    const current = reducer(waiting, {
      type: actions.FETCH_COHORT_STATISTICS_SUCCESS,
      searchId: "search-new",
      comparison: false,
      cohort: [{ id: "new" }],
    });
    const stale = reducer(current, {
      type: actions.FETCH_COHORT_STATISTICS_SUCCESS,
      searchId: "search-old",
      comparison: false,
      cohort: [{ id: "old" }],
    });

    expect(stale).toBe(current);
  });

  it("ignores an older success after the latest request fails", () => {
    const waiting = reducer(undefined, {
      type: actions.FETCH_COHORT_STATISTICS_REQUEST,
      searchId: "search-new",
      comparison: false,
    });
    const failed = reducer(waiting, {
      type: actions.FETCH_COHORT_STATISTICS_FAILED,
      searchId: "search-new",
      comparison: false,
      error: new Error("failed"),
    });
    const stale = reducer(failed, {
      type: actions.FETCH_COHORT_STATISTICS_SUCCESS,
      searchId: "search-old",
      comparison: false,
      cohort: [{ id: "old" }],
    });

    expect(stale).toBe(failed);
  });

  it("preserves the current cohort when only a comparison fails", () => {
    const cohort = [{ id: "tmb" }];
    const state = {
      ...reducer(undefined, { type: "@@INIT" }),
      cohort,
      cohortSearchId: "current",
      comparisonCohorts: {
        favorite: { label: "Favorite", cohort: [{ id: "stale" }] },
      },
    };

    const failed = reducer(state, {
      type: actions.FETCH_COHORT_STATISTICS_FAILED,
      searchId: "favorite",
      comparison: true,
      error: new Error("failed"),
    });

    expect(failed.cohort).toBe(cohort);
    expect(failed.cohortSearchId).toBe("current");
    expect(failed.comparisonCohorts.favorite).toBeUndefined();
  });
});
