/** @jest-environment node */

import orderInterpretationVersionColumns from "./columnOrder";

describe("Event Versions column order", () => {
  it("places date, user, tier, and frequency before the remaining columns", () => {
    const columns = [
      { key: "authorName" },
      { key: "lastModified" },
      { key: "dataset" },
      { key: "caseId" },
      { key: "gene" },
      { key: "tier" },
      { key: "frequency" },
      { key: "variant" },
    ];

    expect(orderInterpretationVersionColumns(columns).map(({ key }) => key)).toEqual([
      "lastModified",
      "authorName",
      "tier",
      "frequency",
      "dataset",
      "caseId",
      "gene",
      "variant",
    ]);
  });
});
