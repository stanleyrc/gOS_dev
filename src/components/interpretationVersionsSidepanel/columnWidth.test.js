/** @jest-environment node */

import {
  getLabelBasedColumnWidth,
  withLabelBasedColumnWidth,
} from "./columnWidth";

describe("Tier History label-based column widths", () => {
  it("reserves label and sorter space without relying on row data", () => {
    expect(getLabelBasedColumnWidth("", false)).toBe(80);
    expect(getLabelBasedColumnWidth("Dataset", true)).toBe(104);
    expect(getLabelBasedColumnWidth("Frequency", true)).toBe(120);
  });

  it("keeps a wider configured width and raises narrower widths to the label minimum", () => {
    expect(
      withLabelBasedColumnWidth(
        { key: "date", width: 120, sorter: jest.fn() },
        "Date",
      ),
    ).toMatchObject({ width: 120, minWidth: 120 });
    expect(
      withLabelBasedColumnWidth(
        { key: "frequency", width: 80, sorter: jest.fn() },
        "Frequency",
      ),
    ).toMatchObject({ width: 120, minWidth: 120 });
  });
});
