/** @jest-environment node */

import { moveColumnKey, orderMovableColumns } from "./columnOrder";

describe("moveColumnKey", () => {
  test.each([
    ["a", "c", ["b", "c", "a"]],
    ["c", "a", ["c", "a", "b"]],
    ["a", "b", ["b", "a", "c"]],
    ["b", "c", ["a", "c", "b"]],
    ["b", "b", ["a", "b", "c"]],
    ["missing", "b", ["a", "b", "c"]],
    ["b", "missing", ["a", "b", "c"]],
  ])("moves %s to the original index of %s", (source, target, expected) => {
    const keys = Object.freeze(["a", "b", "c"]);
    expect(moveColumnKey(keys, source, target)).toEqual(expected);
    expect(keys).toEqual(["a", "b", "c"]);
  });

  test("handles empty, singleton and numeric keys", () => {
    expect(moveColumnKey([], "a", "b")).toEqual([]);
    expect(moveColumnKey(["a"], "a", "a")).toEqual(["a"]);
    expect(moveColumnKey([0, 1, 2], 0, 2)).toEqual([1, 2, 0]);
  });
});

describe("orderMovableColumns", () => {
  test("reorders only movable slots without changing column objects", () => {
    const columns = Object.freeze([
      Object.freeze({ key: "select", fixed: "left" }),
      Object.freeze({ key: "a", width: 120 }),
      Object.freeze({ key: "pinned", fixed: true }),
      Object.freeze({ key: "b", sorter: true }),
      Object.freeze({ key: "c", fixed: false }),
      Object.freeze({ key: "actions", fixed: "right" }),
    ]);
    const ordered = orderMovableColumns(columns, [
      "actions", "c", "pinned", "a", "select", "b",
    ]);

    expect(ordered.map(({ key }) => key)).toEqual([
      "select", "c", "pinned", "a", "b", "actions",
    ]);
    expect(ordered[0]).toBe(columns[0]);
    expect(ordered[1]).toBe(columns[4]);
    expect(ordered[2]).toBe(columns[2]);
    expect(ordered[3]).toBe(columns[1]);
    expect(ordered[4]).toBe(columns[3]);
    expect(ordered[5]).toBe(columns[5]);
    expect(columns.map(({ key }) => key)).toEqual([
      "select", "a", "pinned", "b", "c", "actions",
    ]);
  });

  test("ignores unknown and duplicate keys with remaining columns stable", () => {
    const columns = [{ key: "a" }, { key: "b" }, { key: "c" }];
    expect(
      orderMovableColumns(columns, ["missing", "c", "c"])
        .map(({ key }) => key),
    ).toEqual(["c", "a", "b"]);
    expect(orderMovableColumns(columns, ["missing"])).toEqual(columns);
    expect(orderMovableColumns(columns, ["a", "b", "c"])).toEqual(columns);
    expect(orderMovableColumns(columns, undefined)).toEqual(columns);
  });

  test("keeps empty, fixed-only and no-order columns unchanged", () => {
    const columns = [{ key: "a", fixed: "left" }, { key: "b", fixed: true }];
    expect(orderMovableColumns([], ["b", "a"])).toEqual([]);
    expect(orderMovableColumns(columns, ["b", "a"])).toEqual(columns);
    expect(orderMovableColumns([{ key: "a" }], [])).toEqual([{ key: "a" }]);
  });
});
