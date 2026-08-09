/** @jest-environment node */

import EventInterpretation from "./EventInterpretation";

const baseInterpretation = {
  datasetId: "dataset-1",
  caseId: "case-1",
  alterationId: "event-1",
  authorId: "author-1",
  authorName: "Author One",
  data: { tier: "2" },
};

describe("EventInterpretation imported history fields", () => {
  it("preserves an explicitly missing source date and serializes import metadata", () => {
    const interpretation = new EventInterpretation({
      ...baseInterpretation,
      lastModified: null,
      frequency: 7,
      source: {
        kind: "case-interpretation-import",
        aggregateId: "aggregate-1",
      },
    });

    expect(interpretation.toJSON()).toMatchObject({
      lastModified: null,
      frequency: 7,
      source: {
        kind: "case-interpretation-import",
        aggregateId: "aggregate-1",
      },
    });
  });

  it("keeps legacy defaults when import fields are absent", () => {
    const interpretation = new EventInterpretation(baseInterpretation);
    const json = interpretation.toJSON();

    expect(json.lastModified).toEqual(expect.any(String));
    expect(json).not.toHaveProperty("frequency");
    expect(json).not.toHaveProperty("source");
  });

  it.each([0, -1, 1.5, "many"])(
    "rejects invalid supplied frequency %p",
    (frequency) => {
      expect(
        () => new EventInterpretation({ ...baseInterpretation, frequency }),
      ).toThrow("frequency must be a positive integer");
    },
  );
});
