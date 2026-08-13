/** @jest-environment node */
/* eslint-disable import/first */

jest.mock("d3", () => ({
  ascending: (a, b) => (a < b ? -1 : a > b ? 1 : 0),
}));

jest.mock("./columnRegistry", () => ({
  getColumnRenderer: () => "span",
}));

jest.mock("./SliderFilterDropdown", () => "SliderFilterDropdown");

import React from "react";
import { buildColumnConfig } from "./columnBuilders";

describe("buildColumnConfig", () => {
  const getWidthForTitle = (title, width = 1) =>
    buildColumnConfig(
      { id: "value", title, dataIndex: "value", width },
      []
    ).width;

  test("estimates narrow, ordinary, wide Latin, CJK, and emoji glyphs conservatively", () => {
    expect(getWidthForTitle("iiii")).toBe(68);
    expect(getWidthForTitle("eeee")).toBe(80);
    expect(getWidthForTitle("WW@%")).toBe(96);
    expect(getWidthForTitle("漢字漢字")).toBe(108);
    expect(getWidthForTitle("🧬🧪😀🚀")).toBe(108);
  });

  test("fits long plain-text and recursively extracted simple JSX titles", () => {
    const plainTitleWidth = getWidthForTitle("AlphaMissense", 80);
    const jsxTitleWidth = getWidthForTitle(
      <span>
        Alpha<strong>Missense</strong>
      </span>,
      80
    );

    expect(plainTitleWidth).toBe(163);
    expect(jsxTitleWidth).toBe(plainTitleWidth);
  });

  test("uses a conservative baseline for unmeasurable titles", () => {
    expect(
      getWidthForTitle(
        <span>
          <input aria-label="Header supplied by a component" />
        </span>
      )
    ).toBe(120);
  });

  test("normalizes pixel widths and preserves larger configured widths", () => {
    expect(getWidthForTitle("Header", "80px")).toBe(99);
    expect(getWidthForTitle("Header", "240px")).toBe(240);
    expect(getWidthForTitle("AlphaMissense", 240)).toBe(240);
  });

  test("falls back from invalid widths to a numeric baseline before fitting", () => {
    [
      0,
      -1,
      NaN,
      Infinity,
      null,
      "0px",
      "-1px",
      "80",
      "80%",
      "auto",
    ].forEach((width) => {
      expect(getWidthForTitle("Longer header", width)).toBe(156);
    });
  });

  test("keeps the existing 120 default when width is omitted", () => {
    const column = buildColumnConfig(
      { id: "tiny", title: "Tiny", dataIndex: "tiny" },
      []
    );

    expect(column.width).toBe(120);
  });

  test("fits the translated title instead of its translation key", () => {
    const t = jest.fn(() => "Translated AlphaMissense Label");
    const column = buildColumnConfig(
      {
        id: "alphaMissense",
        title: "components.filtered-events-panel.alphaMissense",
        dataIndex: "alphaMissense",
        width: 80,
      },
      [],
      { t }
    );

    expect(t).toHaveBeenCalledWith(
      "components.filtered-events-panel.alphaMissense"
    );
    expect(column.title).toBe("Translated AlphaMissense Label");
    expect(column.width).toBe(306);
  });

  test("allows separately for Ant filter and sorter header controls", () => {
    const buildColumn = (controls) =>
      buildColumnConfig(
        {
          id: "status",
          title: "Header",
          dataIndex: "status",
          width: 1,
          ...controls,
        },
        [{ status: "A" }]
      );

    const plainColumn = buildColumn({});
    const filteredColumn = buildColumn({ filterable: true });
    const sortedColumn = buildColumn({ sortable: true });
    const filteredAndSortedColumn = buildColumn({
      filterable: true,
      sortable: true,
    });

    expect(plainColumn.width).toBe(99);
    expect(filteredColumn.width).toBe(115);
    expect(sortedColumn.width).toBe(115);
    expect(filteredAndSortedColumn.width).toBe(131);
    expect(filteredAndSortedColumn.filters).toEqual([
      { text: "A", value: "A" },
    ]);
    expect(filteredAndSortedColumn.onFilter("A", { status: "A" })).toBe(true);
    expect(filteredAndSortedColumn.sorter.compare(
      { status: "A" },
      { status: "B" }
    )).toBe(-1);
    expect(
      filteredAndSortedColumn.render(undefined, { status: "A" }).props.value
    ).toBe("A");
  });
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
