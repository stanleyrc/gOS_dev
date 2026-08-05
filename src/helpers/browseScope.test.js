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
  buildAllDatasetsMetadata,
  buildCaseReportUrl,
  datasetBrowseScope,
  datasetHasField,
  distinctCaseRecords,
  fieldIdentifier,
  getBrowseScopeDatasetId,
  getSourceCaseIdentity,
  getSourceScopedFieldValue,
  projectSourceRecordFields,
  resolveBrowseDataset,
  resolveSourceDataset,
  sourceCaseIdentityKey,
  sourceDatasetHasField,
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

describe("dataset field membership", () => {
  const datasets = [
    {
      id: "a",
      fields: [
        field({ id: "purity", type: "numeric" }),
        field({ id: "hrd.hrd_score", type: "numeric" }),
        field({ id: "tumor_median_coverage", type: "numeric" }),
      ],
    },
    {
      id: "b",
      fields: [field({ id: "ploidy", type: "numeric" })],
    },
  ];

  it("normalizes identifiers and resolves the record's source dataset", () => {
    const record = { datasetId: "a", purity: 0.4, ploidy: 4.2 };

    expect(fieldIdentifier("purity")).toBe("purity");
    expect(fieldIdentifier({ name: "ploidy" })).toBe("ploidy");
    expect(resolveSourceDataset(record, datasets)).toBe(datasets[0]);
    expect(datasetHasField(datasets[0], "purity")).toBe(true);
    expect(datasetHasField(datasets[0], "ploidy")).toBe(false);
    expect(sourceDatasetHasField(record, datasets, "purity")).toBe(true);
    expect(sourceDatasetHasField(record, datasets, "ploidy")).toBe(false);
  });

  it("suppresses raw omitted and unknown-source values", () => {
    const record = {
      datasetId: "a",
      purity: 0.4,
      ploidy: 4.2,
      hrd: { hrd_score: 0.7 },
    };
    const allDatasets = buildAllDatasetsMetadata(datasets);

    expect(
      getSourceScopedFieldValue(record, datasets, "hrd.hrd_score"),
    ).toBe(0.7);
    expect(getSourceScopedFieldValue(record, datasets, "ploidy")).toBeUndefined();
    expect(
      getSourceScopedFieldValue(
        { ...record, datasetId: "unknown" },
        datasets,
        "purity",
        allDatasets,
      ),
    ).toBeUndefined();
  });

  it("keeps legacy datasets without normalized fields permissive", () => {
    const legacyDataset = { id: "legacy" };
    const record = { datasetId: "legacy", purity: 0.5 };

    expect(datasetHasField(legacyDataset, "purity")).toBe(true);
    expect(
      getSourceScopedFieldValue(record, [legacyDataset], "purity"),
    ).toBe(0.5);
  });

  it("does not project fields excluded from the compatible global union", () => {
    const incompatibleDatasets = [
      {
        id: "string-source",
        fields: [field({ id: "ambiguous", type: "string" })],
      },
      {
        id: "numeric-source",
        fields: [field({ id: "ambiguous", type: "numeric" })],
      },
    ];
    const allDatasets = buildAllDatasetsMetadata(incompatibleDatasets);

    expect(
      projectSourceRecordFields(
        {
          datasetId: "string-source",
          caseReportId: "case-1",
          ambiguous: "must not leak",
        },
        incompatibleDatasets,
        allDatasets,
      ),
    ).toEqual({
      datasetId: "string-source",
      caseReportId: "case-1",
    });
  });

  it("projects only source-enabled fields without mutating the record", () => {
    const record = {
      datasetId: "a",
      caseReportId: "case-1",
      pair: "PAIR-1",
      summary: "SNV: TP53",
      purity: 0.4,
      ploidy: 4.2,
      tumor_median_coverage: 100,
      normal_median_coverage: 80,
      hrd: { hrd_score: 0.7, b1_score: 0.9 },
    };
    const before = JSON.parse(JSON.stringify(record));

    expect(projectSourceRecordFields(record, datasets)).toEqual({
      datasetId: "a",
      caseReportId: "case-1",
      pair: "PAIR-1",
      summary: "SNV: TP53",
      purity: 0.4,
      tumor_median_coverage: 100,
      normal_median_coverage: 80,
      hrd: { hrd_score: 0.7 },
    });
    expect(record).toEqual(before);
  });
});
