/** @jest-environment node */

import createFrequencyColumn from "./frequencyColumn";

const column = createFrequencyColumn();
const imported = (frequency) => ({
  frequency,
  source: { kind: "case-interpretation-import" },
});

describe("Event Versions Frequency column", () => {
  it("sorts descending by frequency when Event Versions opens", () => {
    expect(column.defaultSortOrder).toBe("descend");
  });

  it("displays supplied aggregate frequency", () => {
    expect(column.render(8, imported(8))).toBe(8);
  });

  it("displays ordinary interpretations with effective frequency one", () => {
    expect(column.render(undefined, {})).toBe(1);
  });

  it("sorts by effective frequency", () => {
    expect(column.sorter(imported(4), {})).toBe(3);
  });
});
