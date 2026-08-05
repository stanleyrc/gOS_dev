/** @jest-environment node */
/* eslint-disable import/first */

jest.mock("../../helpers/field", () => {
  return class TestField {
    constructor(field = {}) {
      Object.assign(this, field);
      this.id = field.id || field.name;
      this.name = field.name || this.id;
      this.kpiPlot = field.kpiPlot === true;
      this.isValid = Boolean(this.id && field.type);
    }
  };
});

import { runSaga } from "redux-saga";
import settingsActions from "../settings/actions";
import {
  normalizeDataset,
  openCaseReport,
  selectAllDatasets,
} from "./saga";

const dataset = { id: "a", datafilesPath: "a.json" };

const settings = {
  coordinates: { higlassMap: { hg19: "hg19" } },
  fields: [
    { id: "purity", type: "numeric", kpiPlot: true },
    { id: "ploidy", type: "numeric", kpiPlot: true },
  ],
};

const runOpen = async (caseReports, actionOptions = {}) => {
  const dispatched = [];
  await runSaga(
    {
      dispatch: (action) => dispatched.push(action),
      getState: () => ({
        Settings: { browseScope: { kind: "all" }, dataset: null },
        Datasets: { records: [dataset] },
        CaseReports: caseReports,
      }),
    },
    openCaseReport,
    {
      datasetId: "a",
      caseReportId: "case-1",
      ...actionOptions,
    },
  ).toPromise();
  return dispatched;
};

describe("dataset schema normalization", () => {
  it("treats an explicit schema as a complete field override", () => {
    const normalized = normalizeDataset(
      {
        id: "schema-test",
        schema: [{ id: "purity", type: "numeric", kpiPlot: true }],
      },
      settings,
    );

    expect(normalized.fields.map(({ id }) => id)).toEqual(["purity"]);
    expect(normalized.kpiFields.map(({ id }) => id)).toEqual(["purity"]);
  });

  it("allows an explicit empty schema to disable every default field", () => {
    const normalized = normalizeDataset(
      { id: "schema-empty", schema: [] },
      settings,
    );

    expect(normalized.fields).toEqual([]);
    expect(normalized.kpiFields).toEqual([]);
  });
});

describe("dataset detail routing", () => {
  it("selects all datasets with the requested filters and destination", async () => {
    const dispatched = [];
    const searchFilters = { patient_id: ["PATIENT-1"] };
    const listViewTarget = {
      tab: "aggregations",
      aggregationsTab: "visualization",
    };

    await runSaga(
      { dispatch: (action) => dispatched.push(action) },
      selectAllDatasets,
      { searchFilters, listViewTarget },
    ).toPromise();

    expect(dispatched).toEqual([
      settingsActions.updateBrowseScope(
        { kind: "all" },
        { searchFilters, listViewTarget },
      ),
    ]);
  });

  it("keeps the initial global manifest fetch alive for a deep link", async () => {
    const dispatched = await runOpen(
      { loading: false, datafiles: [] },
      { keepBrowseFetch: true },
    );

    expect(dispatched).toEqual([
      settingsActions.updateDataset(dataset, "case-1", {
        preserveBrowseScope: true,
        refreshBrowseResults: false,
        cancelBrowseWork: false,
      }),
    ]);
  });

  it("cancels stale browse work when opening an already loaded result", async () => {
    const dispatched = await runOpen({
      loading: false,
      datafiles: [{ caseReportId: "case-1" }],
    });

    expect(dispatched[0].cancelBrowseWork).toBe(true);
  });
});
