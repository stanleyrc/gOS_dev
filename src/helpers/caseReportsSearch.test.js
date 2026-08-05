/** @jest-environment node */
/* eslint-disable import/first */

jest.mock("d3", () => ({
  ascending: (left, right) => (left < right ? -1 : left > right ? 1 : 0),
  descending: (left, right) => (left > right ? -1 : left < right ? 1 : 0),
}));

jest.mock("./utility", () => ({
  defaultSearchFilters: () => ({ page: 1, per_page: 10, orderId: 1 }),
  getValueByPath: (record, path) =>
    `${path}`.split(".").reduce((value, key) => value?.[key], record),
  orderListViewFilters: [
    { id: 1, attribute: "pair", sort: "ascending" },
    { id: 7, attribute: "tmb", sort: "ascending" },
  ],
}));

jest.mock("./filters", () => ({
  reportFilters: () => [],
}));

import {
  applyExternalFilters,
  buildPopulationMaps,
  filterCaseReportRecords,
  searchCaseReportRecords,
} from "./caseReportsSearch";

const fields = [
  { id: "pair", name: "pair", renderer: "select" },
  { id: "disease", name: "disease", renderer: "select" },
  { id: "tags", name: "tags", renderer: "cascader" },
  { id: "specimen_date", name: "specimen_date", renderer: "date-range" },
  { id: "tmb", name: "tmb", renderer: "slider" },
  { id: "hrd.hrd_score", name: "hrd.hrd_score", renderer: "slider" },
];

const records = [
  {
    datasetId: "a",
    caseReportId: "case-1",
    pair: "PAIR-1",
    disease: "AML",
    tags: ["Gene: TP53", "Type: SNV"],
    specimen_date: "2024-01-15",
    tmb: 8,
    hrd: { hrd_score: 0.2 },
  },
  {
    datasetId: "b",
    caseReportId: "case-2",
    pair: "PAIR-1",
    disease: "Breast cancer",
    tags: ["Gene: BRCA1"],
    specimen_date: "2024-02-01/2024-02-10",
    tmb: 3,
    hrd: { hrd_score: 0.8 },
  },
  {
    datasetId: "b",
    caseReportId: "case-3",
    pair: "PAIR-3",
    disease: "AML",
    tags: ["Gene: TP53"],
    specimen_date: null,
    tmb: 12,
    hrd: { hrd_score: 0.5 },
  },
];

describe("static case-report search", () => {
  it("filters nested, select, and cascader fields across source datasets", () => {
    const matched = filterCaseReportRecords(
      records,
      {
        disease: ["AML"],
        tags: [["Gene", "Gene: TP53"]],
        "hrd.hrd_score": [0.1, 0.6],
        orderId: 1,
        operator: "AND",
      },
      fields,
    );

    expect(matched.map(({ caseReportId }) => caseReportId)).toEqual([
      "case-1",
      "case-3",
    ]);
  });

  it("filters specimen point/range dates by overlapping from/to dates", () => {
    const matched = filterCaseReportRecords(
      records,
      {
        specimen_date: { from: "2024-02-05", to: "2024-02-20" },
        orderId: 1,
      },
      fields,
    );

    expect(matched.map(({ caseReportId }) => caseReportId)).toEqual([
      "case-2",
    ]);
  });

  it("sorts and paginates the complete matched set client-side", () => {
    const result = searchCaseReportRecords(
      records,
      { page: 2, per_page: 1, orderId: 7 },
      fields,
    );

    expect(result.matchedRecords.map(({ tmb }) => tmb)).toEqual([3, 8, 12]);
    expect(result.pageRecords).toHaveLength(1);
    expect(result.pageRecords[0].tmb).toBe(8);
  });

  it("matches interpretations by source case ID when Pair is only a label", () => {
    const casesWithInterpretations = {
      all: new Set(["case-1", "case-2"]),
      withTierChange: new Set(["case-1"]),
      byAuthor: new Map(),
      byGene: new Map(),
    };

    expect(
      applyExternalFilters(
        records,
        { has_interpretations: [["tier_change"]] },
        casesWithInterpretations,
      ).map(({ caseReportId }) => caseReportId),
    ).toEqual(["case-1"]);
    expect(
      applyExternalFilters(
        records,
        { has_interpretations: [["other_changes"]] },
        casesWithInterpretations,
      ).map(({ caseReportId }) => caseReportId),
    ).toEqual(["case-2"]);
  });

  it("accepts an unambiguous legacy Pair interpretation ID", () => {
    const legacyRecord = {
      datasetId: "a",
      caseReportId: "case-1",
      pair: "LEGACY-PAIR",
    };
    const matched = applyExternalFilters(
      [legacyRecord],
      { has_interpretations: [["tier_change"]] },
      {
        all: new Set(["LEGACY-PAIR"]),
        withTierChange: new Set(["LEGACY-PAIR"]),
        byAuthor: new Map(),
        byGene: new Map(),
      },
    );

    expect(matched).toEqual([legacyRecord]);
  });

  it("does not treat another source ID used as a Pair label as an interpretation match", () => {
    const ambiguousRecords = [
      { datasetId: "a", caseReportId: "case-1", pair: "case-2" },
      { datasetId: "a", caseReportId: "case-2", pair: "Display Two" },
    ];
    const matched = applyExternalFilters(
      ambiguousRecords,
      { has_interpretations: [["tier_change"]] },
      {
        all: new Set(["case-2"]),
        withTierChange: new Set(["case-2"]),
        byAuthor: new Map(),
        byGene: new Map(),
      },
    );

    expect(matched.map(({ caseReportId }) => caseReportId)).toEqual([
      "case-2",
    ]);
  });

  it("does not collapse equal Pair values from different datasets", () => {
    const populations = buildPopulationMaps(records, [{ id: "tmb" }]);

    expect(populations.tmb).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ datasetId: "a", caseReportId: "case-1" }),
        expect.objectContaining({ datasetId: "b", caseReportId: "case-2" }),
      ]),
    );
  });

  it("does not filter, search, or sort with values omitted by a source schema", () => {
    const mixedFields = [
      { id: "disease", name: "disease", renderer: "select" },
      { id: "tmb", name: "tmb", renderer: "slider" },
    ];
    const datasets = [
      { id: "a", fields: [] },
      { id: "b", fields: mixedFields },
    ];
    const sourceRecords = [
      {
        datasetId: "a",
        caseReportId: "hidden-values",
        pair: "A",
        disease: "SCHEMA SECRET",
        tmb: 1,
      },
      {
        datasetId: "b",
        caseReportId: "enabled-tmb",
        pair: "B",
        disease: "RAW BUT OMITTED",
        tmb: 2,
      },
    ];
    const fieldContext = {
      datasets,
      dataset: { isAllDatasets: true, fields: mixedFields },
    };

    expect(
      filterCaseReportRecords(
        sourceRecords,
        { texts: "schema secret", orderId: 1 },
        mixedFields,
        fieldContext,
      ),
    ).toEqual([]);
    expect(
      filterCaseReportRecords(
        sourceRecords,
        { tmb: [1, 1], orderId: 1 },
        mixedFields,
        fieldContext,
      ),
    ).toEqual([]);
    expect(
      filterCaseReportRecords(
        sourceRecords,
        { orderId: 7 },
        mixedFields,
        fieldContext,
      ).map(({ caseReportId }) => caseReportId),
    ).toEqual(["enabled-tmb", "hidden-values"]);
  });

  it("does not use stale fields excluded from the compatible global union", () => {
    const tmbField = { id: "tmb", name: "tmb", renderer: "slider" };
    const datasets = [{ id: "a", fields: [tmbField] }];
    const sourceRecords = [
      { datasetId: "a", caseReportId: "case-1", pair: "A", tmb: 999 },
    ];

    expect(
      filterCaseReportRecords(
        sourceRecords,
        { tmb: [999, 999], orderId: 7 },
        [tmbField],
        {
          datasets,
          dataset: { isAllDatasets: true, fields: [] },
        },
      ),
    ).toEqual([]);
  });

  it("excludes source-omitted KPI values from global populations", () => {
    const datasets = [
      { id: "a", fields: [{ id: "purity" }] },
      { id: "b", fields: [{ id: "tmb" }] },
    ];
    const sourceRecords = [
      { datasetId: "a", caseReportId: "hidden-tmb", pair: "A", tmb: 999 },
      { datasetId: "b", caseReportId: "enabled-tmb", pair: "B", tmb: 4 },
    ];

    expect(
      buildPopulationMaps(sourceRecords, [{ id: "tmb" }], {
        datasets,
        dataset: { isAllDatasets: true, fields: [{ id: "tmb" }] },
      }).tmb,
    ).toEqual([
      expect.objectContaining({ caseReportId: "enabled-tmb", value: 4 }),
    ]);
  });
});
