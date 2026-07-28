/** @jest-environment node */
/* eslint-disable import/first */

jest.mock("../../helpers/filters", () => ({ cascaderOperators: ["OR", "AND", "NOT"] }));

import actions from "./actions";
import reducer from "./reducer";

describe("CaseReports reducer", () => {
  it("keeps source manifests and a local search identity after global loading", () => {
    const records = [
      { datasetId: "a", caseReportId: "case-1", pair: "PAIR-1" },
      { datasetId: "b", caseReportId: "case-2", pair: "PAIR-1" },
    ];
    const state = reducer(undefined, {
      type: actions.FETCH_CASE_REPORTS_SUCCESS,
      searchId: "search-1",
      datafiles: records,
      manifestRecordsByDataset: { a: [records[0]], b: [records[1]] },
      populations: {},
      cohortPopulations: {},
      reportsFilters: [],
      reportsFiltersExtents: {},
      reports: records,
      totalReports: records,
    });

    expect(state.currentSearchId).toBe("search-1");
    expect(state.totalReportsCount).toBe(2);
    expect(Object.keys(state.manifestRecordsByDataset)).toEqual(["a", "b"]);
  });

  it("ends loading flags when a retained-result transition cancels a fetch", () => {
    const loading = reducer(undefined, actions.fetchCaseReports());
    const cancelled = reducer(
      loading,
      actions.cancelCaseReportsFetch(),
    );

    expect(cancelled.loading).toBe(false);
    expect(cancelled.searchPending).toBe(false);
    expect(cancelled.loadingPercentage).toBeNull();
  });

  it("ignores local searches until manifest loading completes", () => {
    const loading = reducer(undefined, actions.fetchCaseReports());
    const ignored = reducer(
      loading,
      actions.searchCaseReports({ disease: ["AML"] }),
    );

    expect(ignored).toBe(loading);
  });

  it("marks a local search pending until matching results arrive", () => {
    const pending = reducer(undefined, {
      type: actions.SEARCH_CASE_REPORTS,
      searchFilters: { page: 1, per_page: 10 },
    });
    expect(pending.searchPending).toBe(true);

    const matched = reducer(pending, {
      type: actions.CASE_REPORTS_MATCHED,
      reports: [],
      totalReports: [],
      reportsFilters: [],
      cohortPopulations: {},
    });
    expect(matched.searchPending).toBe(false);
  });

  it("carries a requested patient-level destination through matching", () => {
    const listViewTarget = {
      tab: "aggregations",
      aggregationsTab: "visualization",
      visualizationPreset: "topGenes",
    };
    const pending = reducer(
      undefined,
      actions.searchCaseReports(
        { patient_id: ["PATIENT-1"] },
        { listViewTarget },
      ),
    );
    const matched = reducer(pending, {
      type: actions.CASE_REPORTS_MATCHED,
      reports: [],
      totalReports: [],
      reportsFilters: [],
      cohortPopulations: {},
    });

    expect(matched.searchFilters.patient_id).toEqual(["PATIENT-1"]);
    expect(matched.listViewTarget).toBe(listViewTarget);
  });

  it("carries a patient-level destination through a global manifest load", () => {
    const listViewTarget = {
      tab: "aggregations",
      aggregationsTab: "visualization",
      visualizationPreset: "topGenes",
    };
    const loading = reducer(
      undefined,
      actions.fetchCaseReports(
        { patient_id: ["PATIENT-1"] },
        { listViewTarget },
      ),
    );

    expect(loading.searchFilters.patient_id).toEqual(["PATIENT-1"]);
    expect(loading.listViewTarget).toBe(listViewTarget);
  });

  it("preserves loaded manifests when only a local search fails", () => {
    const datafiles = [{ caseReportId: "case-1" }];
    const loaded = {
      ...reducer(undefined, { type: "@@INIT" }),
      datafiles,
      reports: datafiles,
      totalReports: datafiles,
    };
    const failed = reducer(loaded, {
      type: actions.FETCH_CASE_REPORTS_FAILED,
      error: new Error("search failed"),
      searchFilters: { disease: ["failed-filter"] },
      preserveBrowseData: true,
    });

    expect(failed.datafiles).toBe(datafiles);
    expect(failed.reports).toBe(datafiles);
    expect(failed.totalReports).toBe(datafiles);
    expect(failed.searchFilters).toBe(loaded.searchFilters);
    expect(failed.searchPending).toBe(false);
  });

  it("clears prior-user saved searches before and after a failed load", () => {
    const priorUserState = {
      ...reducer(undefined, { type: "@@INIT" }),
      favoriteSearches: [{ searchId: "private-search" }],
    };
    const loading = reducer(priorUserState, {
      type: actions.FETCH_FAVORITE_SEARCHES_REQUEST,
    });
    const failed = reducer(loading, {
      type: actions.FETCH_FAVORITE_SEARCHES_FAILED,
      error: new Error("unavailable"),
    });

    expect(loading.favoriteSearches).toEqual([]);
    expect(failed.favoriteSearches).toEqual([]);
  });

  it("updates saved searches without clearing browse results", () => {
    const loaded = reducer(undefined, {
      type: actions.CASE_REPORTS_MATCHED,
      reports: [{ pair: "PAIR-1" }],
      totalReports: [{ pair: "PAIR-1" }],
      reportsFilters: [],
      cohortPopulations: {},
    });
    const saved = reducer(loaded, {
      type: actions.SAVE_FAVORITE_SEARCH_SUCCESS,
      favoriteSearches: [{ id: "saved-1", datasetId: null }],
    });

    expect(saved.favoriteSearches).toEqual([
      { id: "saved-1", datasetId: null },
    ]);
    expect(saved.reports).toEqual([{ pair: "PAIR-1" }]);
  });
});
