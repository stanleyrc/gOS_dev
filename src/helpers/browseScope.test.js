/** @jest-environment node */
/* eslint-disable import/first */

jest.mock("./field", () => {
  class TestField {
    constructor(field = {}) {
      Object.assign(this, field);
      this.id = field.id || field.name;
      this.name = field.name || this.id;
      this.kpiPlot = field.kpiPlot === true;
      this.isValid = Boolean(this.id && this.name && this.type);
    }
  }
  return { __esModule: true, default: TestField };
});

import Field from "./field";
import {
  ALL_DATASETS_SCOPE_VALUE,
  allDatasetsBrowseScope,
  buildCaseReportUrl,
  datasetBrowseScope,
  distinctCaseRecords,
  getBrowseScopeDatasetId,
  getSourceCaseIdentity,
  resolveBrowseDataset,
  sourceCaseIdentityKey,
} from "./browseScope";

const field = (definition) => new Field(definition);

describe("browse scope", () => {
  it("represents global scope without a synthetic dataset ID", () => {
    expect(allDatasetsBrowseScope()).toEqual({ kind: "all" });
    expect(getBrowseScopeDatasetId(allDatasetsBrowseScope())).toBeNull();
    expect(ALL_DATASETS_SCOPE_VALUE).toBe("__all_accessible_datasets__");
  });

  it("unions configured fields while leaving accessible datasets untouched", () => {
    const datasets = [
      {
        id: "a",
        fields: [field({ id: "disease", type: "string" })],
      },
      {
        id: "b",
        fields: [field({ id: "tmb", type: "numeric", kpiPlot: true })],
      },
    ];
    const metadata = resolveBrowseDataset({
      Settings: { browseScope: allDatasetsBrowseScope(), dataset: datasets[0] },
      Datasets: { records: datasets },
    });

    expect(datasets).toHaveLength(2);
    expect(metadata).toMatchObject({
      id: null,
      isAllDatasets: true,
      title: "All accessible datasets",
    });
    expect(metadata.fields.map(({ id }) => id)).toEqual(["disease", "tmb"]);
    expect(metadata.kpiFields.map(({ id }) => id)).toEqual(["tmb"]);
  });

  it("excludes duplicate field IDs with incompatible schemas", () => {
    const metadata = resolveBrowseDataset({
      Settings: { browseScope: allDatasetsBrowseScope() },
      Datasets: {
        records: [
          { fields: [field({ id: "ambiguous", type: "string" })] },
          { fields: [field({ id: "ambiguous", type: "numeric" })] },
        ],
      },
    });

    expect(metadata.fields).toEqual([]);
  });

  it("deduplicates global records by case ID while retaining dataset-title membership", () => {
    expect(
      distinctCaseRecords([
        {
          datasetId: "a",
          caseReportId: "case-1",
          sourceDatasetTitle: "Dataset A",
        },
        {
          datasetId: "a",
          caseReportId: "case-1",
          sourceDatasetTitle: "Dataset A",
        },
        {
          datasetId: "b",
          caseReportId: "case-1",
          sourceDatasetTitle: "Dataset B",
        },
        {
          datasetId: "b",
          caseReportId: "case-2",
          sourceDatasetTitle: "Dataset B",
        },
        {
          datasetId: "dataset-c",
          caseReportId: "case-3",
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        datasetId: "a",
        caseReportId: "case-1",
        sourceDatasetTitle: ["Dataset A", "Dataset B"],
      }),
      expect.objectContaining({
        datasetId: "b",
        caseReportId: "case-2",
        sourceDatasetTitle: "Dataset B",
      }),
      expect.objectContaining({
        datasetId: "dataset-c",
        caseReportId: "case-3",
        sourceDatasetTitle: "dataset-c",
      }),
    ]);
  });

  it("keeps source dataset and case-report identity together", () => {
    const record = {
      datasetId: "dataset-a",
      caseReportId: "case-1",
      pair: "PAIR-1",
    };

    expect(getSourceCaseIdentity(record)).toEqual({
      datasetId: "dataset-a",
      caseReportId: "case-1",
    });
    expect(sourceCaseIdentityKey(record)).toBe('["dataset-a","case-1"]');
    expect(getSourceCaseIdentity({ pair: "PAIR-1" })).toBeNull();
  });

  it("builds source-aware global and dataset detail routes", () => {
    const globalUrl = buildCaseReportUrl(
      "http://localhost/?page=2",
      { datasetId: "a", caseReportId: "case-1" },
      allDatasetsBrowseScope(),
    );
    const datasetUrl = buildCaseReportUrl(
      globalUrl.toString(),
      { datasetId: "b", caseReportId: "case-2" },
      datasetBrowseScope("b"),
    );

    expect(globalUrl.searchParams.get("scope")).toBe("all");
    expect(globalUrl.searchParams.get("dataset")).toBe("a");
    expect(globalUrl.searchParams.get("report")).toBe("case-1");
    expect(datasetUrl.searchParams.has("scope")).toBe(false);
    expect(datasetUrl.searchParams.get("dataset")).toBe("b");
  });
});
