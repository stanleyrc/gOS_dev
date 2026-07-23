/** @jest-environment node */

import {
  canonicalizeInterpretationCounts,
  canonicalizeInterpretationSummary,
} from "./interpretationCaseIds";

describe("interpretation case IDs", () => {
  it("migrates unique legacy Pair keys without stealing canonical IDs", () => {
    const records = [
      { caseReportId: "case-1", pair: "LEGACY-1" },
      { caseReportId: "case-2", pair: "case-3" },
      { caseReportId: "case-3", pair: "DISPLAY-3" },
    ];
    const summary = canonicalizeInterpretationSummary(
      {
        all: new Set(["LEGACY-1", "case-3"]),
        withTierChange: new Set(["LEGACY-1"]),
        byAuthor: new Map([["author", new Set(["LEGACY-1"])]]),
        byGene: new Map(),
      },
      records
    );
    const counts = canonicalizeInterpretationCounts(
      new Map([
        ["LEGACY-1", 2],
        ["case-1", 1],
      ]),
      records
    );

    expect(summary.all).toEqual(new Set(["case-1", "case-3"]));
    expect(summary.withTierChange).toEqual(new Set(["case-1"]));
    expect(summary.byAuthor.get("author")).toEqual(new Set(["case-1"]));
    expect(counts.get("case-1")).toBe(3);
  });
});
