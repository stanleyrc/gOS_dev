/** @jest-environment node */
/* eslint-disable import/first */

jest.mock("d3", () => ({
  ascending: (left, right) => (left < right ? -1 : left > right ? 1 : 0),
  descending: (left, right) => (left > right ? -1 : left < right ? 1 : 0),
}));

jest.mock("../../helpers/utility", () => ({
  datafilesArrowTableToJson: jest.fn(),
  defaultSearchFilters: () => ({ page: 1, per_page: 10, orderId: 1 }),
  getValueByPath: (record, path) =>
    `${path}`.split(".").reduce((value, key) => value?.[key], record),
  guid: () => "generated",
  humanize: (value) => value,
  orderListViewFilters: [
    { id: 1, attribute: "pair", sort: "ascending" },
  ],
}));

jest.mock("../../helpers/filters", () => ({
  getInterpretationsFilter: () => ({
    filter: { name: "has_interpretations" },
  }),
  getReportsFilters: () => [],
  reportFilters: () => [],
}));

jest.mock("../../helpers/metadata", () => ({
  qcEvaluator: () => "PASS",
}));

jest.mock("../../helpers/progressChannel", () => ({
  createProgressChannel: jest.fn(),
}));

jest.mock("../../helpers/userAuth", () => ({
  getCurrentUserId: jest.fn(() => "test-user"),
}));

jest.mock("../../services/repositories", () => ({
  getActiveRepository: jest.fn(() => ({
    getCasesWithInterpretations: jest.fn(),
    getCasesInterpretationsCount: jest.fn(),
  })),
}));

import { runSaga } from "redux-saga";
import { createProgressChannel } from "../../helpers/progressChannel";
import datasetsActions from "../datasets/actions";
import actions from "./actions";
import {
  applyFavoriteSearch,
  fetchCaseReports,
  saveFavoriteSearch,
} from "./saga";

const datasetFields = [
  { id: "pair", name: "pair", title: "Pair", type: "string" },
  { id: "disease", name: "disease", title: "Disease", type: "string" },
  {
    id: "tmb",
    name: "tmb",
    title: "TMB",
    type: "numeric",
    kpiPlot: true,
  },
];

const globalState = (caseReports = {}) => ({
  Settings: {
    browseScope: { kind: "all" },
    dataset: null,
  },
  Datasets: {
    records: [
      {
        id: "a",
        title: "A",
        datafilesPath: "a.json",
        fields: datasetFields,
        kpiFields: [datasetFields[2]],
      },
      {
        id: "b",
        title: "B",
        datafilesPath: "b.json",
        fields: datasetFields,
        kpiFields: [datasetFields[2]],
      },
    ],
  },
  CaseReports: {
    searchFilters: { page: 1, per_page: 10, orderId: 1 },
    favoriteSearches: [],
    totalReportsCount: 0,
    ...caseReports,
  },
});

const runWorker = async (worker, action, state) => {
  const dispatched = [];
  await runSaga(
    {
      dispatch: (dispatchedAction) => dispatched.push(dispatchedAction),
      getState: () => state,
    },
    worker,
    action,
  ).toPromise();
  return dispatched;
};

describe("static browse sagas", () => {
  beforeEach(() => {
    const manifests = {
      "a.json": [{ pair: "PAIR-1", disease: "AML", tmb: 8 }],
      "b.json": [{ pair: "PAIR-1", disease: "Breast", tmb: 3 }],
    };
    createProgressChannel.mockImplementation((config) => ({
      take: (callback) =>
        callback({ response: { data: manifests[config.url] } }),
      close: jest.fn(),
    }));
  });

  it("loads every configured JSON manifest and returns distinct global cases", async () => {
    const dispatched = await runWorker(
      fetchCaseReports,
      {
        type: actions.FETCH_CASE_REPORTS_REQUEST,
        searchFilters: { page: 1, per_page: 10, orderId: 1 },
      },
      globalState(),
    );
    const success = dispatched.find(
      (action) => action.type === actions.FETCH_CASE_REPORTS_SUCCESS,
    );

    expect(createProgressChannel).toHaveBeenCalledTimes(2);
    expect(success.datafiles).toEqual([
      expect.objectContaining({
        datasetId: "a",
        caseReportId: "PAIR-1",
        sourceDatasetTitle: ["A", "B"],
      }),
    ]);
    expect(success.totalReportsCount).toBe(1);
    expect(Object.keys(success.manifestRecordsByDataset)).toEqual(["a", "b"]);
  });

  it("persists a global saved query with null dataset scope", async () => {
    const dispatched = await runWorker(
      saveFavoriteSearch,
      actions.saveFavoriteSearch({
        name: "Global query",
        searchFilters: { disease: ["AML"] },
      }),
      globalState({ currentSearchId: "search-1", totalReportsCount: 1 }),
    );
    const success = dispatched.find(
      (action) => action.type === actions.SAVE_FAVORITE_SEARCH_SUCCESS,
    );

    expect(success.favoriteSearch).toMatchObject({
      name: "Global query",
      datasetId: null,
      searchId: "search-1",
    });
  });

  it("restores global scope before applying an ordinary saved query", async () => {
    const favorite = {
      id: "saved-1",
      searchId: "saved-1",
      datasetId: null,
      searchFilters: { disease: ["AML"], page: 4, per_page: 25 },
    };
    const dispatched = await runWorker(
      applyFavoriteSearch,
      actions.applyFavoriteSearch("saved-1"),
      globalState({ favoriteSearches: [favorite] }),
    );

    expect(dispatched).toEqual([
      datasetsActions.selectAllDatasets({
        searchFilters: expect.objectContaining({
          disease: ["AML"],
          page: 1,
          per_page: 25,
        }),
      }),
    ]);
  });
});
