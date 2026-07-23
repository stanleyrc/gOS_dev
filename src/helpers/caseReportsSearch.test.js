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
    tmb: 8,
    hrd: { hrd_score: 0.2 },
  },
  {
    datasetId: "b",
    caseReportId: "case-2",
    pair: "PAIR-1",
    disease: "Breast cancer",
    tags: ["Gene: BRCA1"],
    tmb: 3,
    hrd: { hrd_score: 0.8 },
  },
  {
    datasetId: "b",
    caseReportId: "case-3",
    pair: "PAIR-3",
    disease: "AML",
    tags: ["Gene: TP53"],
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
});
