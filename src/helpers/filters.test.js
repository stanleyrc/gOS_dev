/** @jest-environment node */
/* eslint-disable import/first */

jest.mock("d3", () => ({
  ascending: (left, right) => (left < right ? -1 : left > right ? 1 : 0),
  descending: (left, right) => (left > right ? -1 : left < right ? 1 : 0),
  extent: (values) =>
    values.length > 0
      ? [Math.min(...values), Math.max(...values)]
      : [undefined, undefined],
  rollup: (values, reduce, keyFor) => {
    const grouped = new Map();
    values.forEach((value) => {
      const key = keyFor(value);
      grouped.set(key, [...(grouped.get(key) || []), value]);
    });
    return new Map(
      Array.from(grouped, ([key, groupedValues]) => [
        key,
        reduce(groupedValues),
      ]),
    );
  },
}));

jest.mock("./utility", () => ({
  getValueByPath: (record, path) =>
    `${path}`.split(".").reduce((value, key) => value?.[key], record),
  plotTypes: () => ({}),
  reportAttributesMap: () => ({}),
}));

import { getReportsFilters } from "./filters";

describe("schema-aware report filters", () => {
  it("retains the global field union without exposing omitted source values", () => {
    const fields = [
      { id: "disease", name: "disease", type: "string", renderer: "select" },
      { id: "tmb", name: "tmb", type: "numeric", renderer: "slider" },
    ];
    const datasets = [
      { id: "a", fields: [] },
      { id: "b", fields },
    ];
    const reports = [
      { datasetId: "a", disease: "SCHEMA SECRET", tmb: 999 },
      { datasetId: "b", disease: "Visible", tmb: 4 },
    ];

    const filters = getReportsFilters(fields, reports, {
      datasets,
      dataset: { isAllDatasets: true, fields },
    });

    expect(filters.map(({ filter }) => filter.name)).toEqual([
      "disease",
      "tmb",
    ]);
    expect(filters.find(({ filter }) => filter.name === "disease").records).toEqual([
      "Visible",
    ]);
    expect(filters.find(({ filter }) => filter.name === "tmb").records).toEqual([
      4,
    ]);
  });
});
