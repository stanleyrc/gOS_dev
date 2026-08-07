/** @jest-environment node */
/* eslint-disable import/first */

jest.mock("d3", () => ({
  ascending: (a, b) => (a < b ? -1 : a > b ? 1 : 0),
}));

jest.mock("./columnRegistry", () => ({
  getColumnRenderer: () => "span",
}));

jest.mock("./SliderFilterDropdown", () => "SliderFilterDropdown");

import { buildColumnConfig } from "./columnBuilders";

describe("buildColumnConfig", () => {
  test("normalizes and deduplicates finite numeric filter values", () => {
    const column = buildColumnConfig(
      {
        id: "tier",
        title: "Tier",
        dataIndex: "tier",
        type: "numeric",
        filterable: true,
      },
      [
        { tier: 10 },
        { tier: "2" },
        { tier: 2 },
        { tier: 1 },
        { tier: 0 },
        { tier: "0" },
        { tier: null },
        { tier: "" },
        { tier: "  " },
        { tier: true },
        { tier: false },
        { tier: NaN },
        { tier: Infinity },
        { tier: -Infinity },
        { tier: "invalid" },
      ]
    );

    expect(column.filters).toEqual([
      { text: 0, value: 0 },
      { text: 1, value: 1 },
      { text: 2, value: 2 },
      { text: 10, value: 10 },
    ]);
    expect(column.onFilter(2, { tier: "2" })).toBe(true);
    expect(column.onFilter("2", { tier: 2 })).toBe(true);
    expect(column.onFilter(0, { tier: null })).toBe(false);
    expect(column.onFilter(0, { tier: "" })).toBe(false);
    expect(column.onFilter(0, { tier: "0" })).toBe(true);
  });

  test("keeps nonnumeric filter values distinct", () => {
    const column = buildColumnConfig(
      {
        id: "status",
        title: "Status",
        dataIndex: "status",
        type: "string",
        filterable: true,
      },
      [{ status: 1 }, { status: "1" }]
    );

    expect(column.filters).toEqual([
      { text: 1, value: 1 },
      { text: "1", value: "1" },
    ]);
  });
});
