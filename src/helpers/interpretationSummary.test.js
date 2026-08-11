/** @jest-environment node */

import {
  countInterpretationsForDataset,
  mergeInterpretationCounts,
  mergeInterpretationSummaries,
  summarizeInterpretationsForDataset,
} from "./interpretationSummary";
import {
  CASE_INTERPRETATION_IMPORT_STORAGE_CASE_ID,
  CASE_INTERPRETATION_IMPORT_STORAGE_DATASET_ID,
} from "./interpretationHistory";

const importedInterpretation = (overrides = {}) => ({
  datasetId: CASE_INTERPRETATION_IMPORT_STORAGE_DATASET_ID,
  caseId: CASE_INTERPRETATION_IMPORT_STORAGE_CASE_ID,
  alterationId: "event-imported",
  authorName: "Imported Author",
  gene: "TP53",
  data: { tier: "2" },
  hasTierChange: true,
  source: {
    kind: "case-interpretation-import",
    datasetId: "dataset-1",
    caseId: "case-imported",
  },
  ...overrides,
});

describe("interpretation browse summaries", () => {
  it("attributes globally stored imports to their source dataset and case", () => {
    const summary = summarizeInterpretationsForDataset(
      [
        {
          datasetId: "dataset-1",
          caseId: "case-ordinary",
          alterationId: "event-ordinary",
          authorName: "Ordinary Author",
          gene: "KRAS",
          hasTierChange: false,
        },
        importedInterpretation(),
        importedInterpretation({
          alterationId: "event-other-dataset",
          source: {
            kind: "case-interpretation-import",
            datasetId: "dataset-2",
            caseId: "case-other-dataset",
          },
        }),
      ],
      "dataset-1",
    );

    expect(summary.all).toEqual(
      new Set(["case-ordinary", "case-imported"]),
    );
    expect(summary.withTierChange).toEqual(new Set(["case-imported"]));
    expect(summary.byAuthor.get("Imported Author")).toEqual(
      new Set(["case-imported"]),
    );
    expect(summary.byGene.get("TP53")).toEqual(
      new Set(["case-imported"]),
    );
    expect(summary.all).not.toContain("case-other-dataset");
  });

  it("counts imported rows against their source case", () => {
    const imported = importedInterpretation();
    const counts = countInterpretationsForDataset(
      [
        imported,
        { ...imported, alterationId: "event-imported-2" },
        {
          datasetId: "dataset-1",
          caseId: "case-ordinary",
          alterationId: "event-ordinary",
        },
      ],
      "dataset-1",
    );

    expect(counts).toEqual(
      new Map([
        ["case-imported", 2],
        ["case-ordinary", 1],
      ]),
    );
  });

  it("merges repository and imported summaries without losing groups", () => {
    const ordinary = summarizeInterpretationsForDataset(
      [
        {
          datasetId: "dataset-1",
          caseId: "case-ordinary",
          authorName: "Ordinary Author",
          gene: "KRAS",
        },
      ],
      "dataset-1",
    );
    const imported = summarizeInterpretationsForDataset(
      [importedInterpretation()],
      "dataset-1",
    );

    const summary = mergeInterpretationSummaries(ordinary, imported);
    const counts = mergeInterpretationCounts(
      new Map([["case-ordinary", 1]]),
      new Map([["case-imported", 2]]),
    );

    expect(summary.all).toEqual(
      new Set(["case-ordinary", "case-imported"]),
    );
    expect(summary.byAuthor.get("Ordinary Author")).toEqual(
      new Set(["case-ordinary"]),
    );
    expect(summary.byAuthor.get("Imported Author")).toEqual(
      new Set(["case-imported"]),
    );
    expect(counts).toEqual(
      new Map([
        ["case-ordinary", 1],
        ["case-imported", 2],
      ]),
    );
  });
});
