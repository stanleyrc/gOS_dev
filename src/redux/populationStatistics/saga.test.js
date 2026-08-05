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
  guid: () => "field-id",
  humanize: (value) => value,
  orderListViewFilters: [{ id: 1, attribute: "pair", sort: "ascending" }],
}));

jest.mock("../../helpers/filters", () => ({ reportFilters: () => [] }));
jest.mock("../../helpers/metadata", () => ({ qcEvaluator: () => "PASS" }));

jest.mock("../../helpers/workers", () => ({
  processDataInWorker: jest.fn(),
}));

const mockGetCasesWithInterpretations = jest.fn();
jest.mock("../../services/repositories", () => ({
  getActiveRepository: jest.fn(),
}));

import { runSaga } from "redux-saga";
import { processDataInWorker } from "../../helpers/workers";
import { getActiveRepository } from "../../services/repositories";
import actions from "./actions";
import {
  fetchCohortStatistics,
  fetchPopulationStatistics,
} from "./saga";

const tmbField = {
  id: "tmb",
  name: "tmb",
  title: "TMB",
  type: "numeric",
  kpiPlot: true,
};

describe("saved-query cohort comparisons", () => {
  beforeEach(() => {
    global.window = { location: { href: "http://localhost/?scope=all" } };
    mockGetCasesWithInterpretations.mockReset();
    getActiveRepository.mockReturnValue({
      getCasesWithInterpretations: mockGetCasesWithInterpretations,
    });
    processDataInWorker.mockReset();
    processDataInWorker.mockImplementation(({ populations, fields }) =>
      Promise.resolve({
        general: fields.map((field) => ({
          id: field.id,
          data: populations[field.id].map(({ value }) => Number(value)),
          dataset: populations[field.id],
        })),
        tumor: [],
      }),
    );
  });

  afterEach(() => delete global.window);

  it("recomputes a saved global cohort from cached static records", async () => {
    const favorite = {
      id: "favorite-1",
      searchId: "favorite-search-1",
      name: "AML",
      datasetId: null,
      searchFilters: { disease: ["AML"], page: 1, per_page: 10, orderId: 1 },
    };
    const state = {
      Settings: { browseScope: { kind: "all" }, dataset: null },
      Datasets: {
        records: [
          {
            id: "a",
            fields: [
              { id: "disease", name: "disease", title: "Disease", type: "string" },
              tmbField,
            ],
            kpiFields: [tmbField],
          },
          {
            id: "b",
            fields: [
              { id: "disease", name: "disease", title: "Disease", type: "string" },
              tmbField,
            ],
            kpiFields: [tmbField],
          },
        ],
      },
      CaseReport: { metadata: {} },
      CaseReports: {
        currentSearchId: "current",
        favoriteSearches: [favorite],
        totalReports: [],
        manifestRecordsByDataset: {
          a: [
            {
              datasetId: "a",
              caseReportId: "case-1",
              pair: "PAIR-1",
              disease: "AML",
              tmb: 8,
            },
          ],
          b: [
            {
              datasetId: "b",
              caseReportId: "case-2",
              pair: "PAIR-2",
              disease: "Breast",
              tmb: 3,
            },
          ],
        },
      },
    };
    const dispatched = [];

    await runSaga(
      {
        dispatch: (action) => dispatched.push(action),
        getState: () => state,
      },
      fetchCohortStatistics,
      {
        type: actions.FETCH_COHORT_STATISTICS_REQUEST,
        searchId: favorite.searchId,
        comparison: true,
        label: favorite.name,
      },
    ).toPromise();

    expect(processDataInWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        populations: {
          tmb: [expect.objectContaining({ value: 8, datasetId: "a" })],
        },
      }),
      expect.stringContaining("populationStatistics.worker.js"),
    );
    expect(dispatched).toEqual([
      expect.objectContaining({
        type: actions.FETCH_COHORT_STATISTICS_SUCCESS,
        searchId: favorite.searchId,
        comparison: true,
        cohort: [expect.objectContaining({ id: "tmb", data: [8] })],
      }),
    ]);
  });

  it("marks the detail population plots missing when no KPI fields are configured", async () => {
    const state = {
      Settings: { browseScope: { kind: "dataset", datasetId: "a" } },
      Datasets: { records: [] },
      CaseReport: { metadata: {} },
      CaseReports: { populations: {} },
    };
    const dispatched = [];

    await runSaga(
      {
        dispatch: (action) => dispatched.push(action),
        getState: () => state,
      },
      fetchPopulationStatistics,
    ).toPromise();

    expect(processDataInWorker).not.toHaveBeenCalled();
    expect(dispatched).toEqual([
      { type: actions.FETCH_POPULATION_STATISTICS_MISSING },
    ]);
  });

  it("uses the active source dataset fields for a detail opened from global scope", async () => {
    const purityField = {
      id: "purity",
      name: "purity",
      title: "Purity",
      type: "numeric",
      kpiPlot: true,
    };
    const state = {
      Settings: {
        browseScope: { kind: "all" },
        dataset: {
          id: "a",
          fields: [purityField],
          kpiFields: [purityField],
        },
      },
      Datasets: {
        records: [
          { id: "a", fields: [purityField], kpiFields: [purityField] },
          { id: "b", fields: [tmbField], kpiFields: [tmbField] },
        ],
      },
      CaseReport: { metadata: { purity: 0.4, tmb: 999 } },
      CaseReports: { populations: { purity: [], tmb: [] } },
    };

    await runSaga(
      { dispatch: jest.fn(), getState: () => state },
      fetchPopulationStatistics,
    ).toPromise();

    expect(processDataInWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: [purityField],
        metadata: { purity: 0.4 },
      }),
      expect.any(String),
    );
  });

  it("rebuilds detail populations from the source manifest when the global union excludes a KPI", async () => {
    const sourceDataset = {
      id: "a",
      fields: [tmbField],
      kpiFields: [tmbField],
    };
    const state = {
      Settings: { browseScope: { kind: "all" }, dataset: sourceDataset },
      Datasets: {
        records: [
          sourceDataset,
          {
            id: "b",
            fields: [{ ...tmbField, type: "string" }],
            kpiFields: [],
          },
        ],
      },
      CaseReport: { metadata: { tmb: 8 } },
      CaseReports: {
        populations: {},
        manifestRecordsByDataset: {
          a: [
            {
              datasetId: "a",
              caseReportId: "case-1",
              pair: "PAIR-1",
              tmb: 8,
            },
          ],
        },
      },
    };

    await runSaga(
      { dispatch: jest.fn(), getState: () => state },
      fetchPopulationStatistics,
    ).toPromise();

    expect(processDataInWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: [tmbField],
        populations: {
          tmb: [expect.objectContaining({ value: 8, datasetId: "a" })],
        },
      }),
      expect.any(String),
    );
  });

  it("marks successfully processed but non-renderable population plots missing", async () => {
    const state = {
      Settings: {
        browseScope: { kind: "dataset", datasetId: "a" },
        dataset: { id: "a", fields: [tmbField], kpiFields: [tmbField] },
      },
      Datasets: { records: [] },
      CaseReport: { metadata: {} },
      CaseReports: { populations: { tmb: [] } },
    };
    const dispatched = [];
    processDataInWorker.mockResolvedValue({
      general: [{ id: "tmb", data: [] }],
      tumor: [],
    });

    await runSaga(
      {
        dispatch: (action) => dispatched.push(action),
        getState: () => state,
      },
      fetchPopulationStatistics,
    ).toPromise();

    expect(dispatched).toEqual([
      { type: actions.FETCH_POPULATION_STATISTICS_MISSING },
    ]);
  });

  it("recomputes dataset saved queries with interpretation filters", async () => {
    const interpretationField = {
      id: "has_interpretations",
      name: "has_interpretations",
      title: "Interpretations",
      type: "string",
      renderer: "cascader",
      external: true,
    };
    const dataset = {
      id: "a",
      fields: [interpretationField, tmbField],
      kpiFields: [tmbField],
    };
    const favorite = {
      id: "favorite-2",
      searchId: "favorite-search-2",
      datasetId: "a",
      searchFilters: {
        has_interpretations: [["tier_change"]],
        page: 1,
        per_page: 10,
        orderId: 1,
      },
    };
    mockGetCasesWithInterpretations.mockResolvedValue({
      all: new Set(["case-1"]),
      withTierChange: new Set(["case-1"]),
      byAuthor: new Map(),
      byGene: new Map(),
    });
    const state = {
      Settings: { browseScope: { kind: "dataset", datasetId: "a" }, dataset },
      Datasets: { records: [dataset] },
      CaseReport: { metadata: {} },
      CaseReports: {
        currentSearchId: "current",
        favoriteSearches: [favorite],
        totalReports: [],
        manifestRecordsByDataset: {
          a: [
            {
              datasetId: "a",
              caseReportId: "case-1",
              pair: "PAIR-1",
              tmb: 8,
            },
            {
              datasetId: "a",
              caseReportId: "case-2",
              pair: "PAIR-2",
              tmb: 3,
            },
          ],
        },
      },
    };
    const dispatched = [];

    await runSaga(
      {
        dispatch: (action) => dispatched.push(action),
        getState: () => state,
      },
      fetchCohortStatistics,
      {
        type: actions.FETCH_COHORT_STATISTICS_REQUEST,
        searchId: favorite.searchId,
        comparison: true,
      },
    ).toPromise();

    expect(mockGetCasesWithInterpretations).toHaveBeenCalledWith("a");
    expect(processDataInWorker).toHaveBeenLastCalledWith(
      expect.objectContaining({
        populations: {
          tmb: [expect.objectContaining({ pair: "PAIR-1", value: 8 })],
        },
      }),
      expect.any(String),
    );
  });
});
