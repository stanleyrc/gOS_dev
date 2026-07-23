/** @jest-environment node */
/* eslint-disable import/first */

jest.mock("konva", () => ({}));

jest.mock("../../helpers/geneAggregations", () => ({
  parseDriverGenes: () => [{ gene: "TP53", type: "missense" }],
}));

jest.mock("../../helpers/browseScope", () => ({
  sourceCaseIdentityKey: (record) =>
    record.datasetId && record.caseReportId
      ? JSON.stringify([record.datasetId, record.caseReportId])
      : null,
}));

jest.mock("../../translations/en/signatures.json", () => ({ metadata: {} }));

import { OncoPrintPlot } from "./oncoPrintPlot";

describe("OncoPrint source case identity", () => {
  it("does not merge equal Pair labels from different datasets", () => {
    const records = [
      {
        datasetId: "dataset-a",
        caseReportId: "case-a",
        pair: "SAME",
        summary: "Missense: TP53",
      },
      {
        datasetId: "dataset-b",
        caseReportId: "case-b",
        pair: "SAME",
        summary: "Missense: TP53",
      },
    ];
    const component = new OncoPrintPlot({
      filteredRecords: records,
      geneSet: ["TP53"],
      enableMemoSort: false,
      mode: "categorical",
      objectAttribute: null,
    });

    const result = component.computeOncoPrintData();

    expect(result.pairs).toHaveLength(2);
    expect(new Set(result.pairs).size).toBe(2);
    expect(Array.from(result.pairLabels.values())).toEqual(["SAME", "SAME"]);
    expect(Array.from(result.recordsByPair.values())).toEqual(records);
    expect(result.matrix.size).toBe(2);
  });
});
