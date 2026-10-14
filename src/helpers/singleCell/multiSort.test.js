import { arrowOf, badgeText, nextSortKeys, sortBadge, sortRows } from "./multiSort";

describe("nextSortKeys", () => {
  it("plain click cycles asc -> desc -> none on one column", () => {
    let k = nextSortKeys([], "a");
    expect(k).toEqual([{ key: "a", dir: "asc" }]);
    k = nextSortKeys(k, "a");
    expect(k).toEqual([{ key: "a", dir: "desc" }]);
    k = nextSortKeys(k, "a");
    expect(k).toEqual([]);
  });
  it("plain click on another column replaces all keys", () => {
    expect(nextSortKeys([{ key: "a", dir: "desc" }, { key: "b", dir: "asc" }], "c")).toEqual([{ key: "c", dir: "asc" }]);
  });
  it("shift-click adds, flips, then removes a key and keeps the others", () => {
    let k = nextSortKeys([{ key: "a", dir: "asc" }], "b", { shift: true });
    expect(k).toEqual([{ key: "a", dir: "asc" }, { key: "b", dir: "asc" }]);
    k = nextSortKeys(k, "b", { shift: true });
    expect(k[1]).toEqual({ key: "b", dir: "desc" });
    k = nextSortKeys(k, "b", { shift: true });
    expect(k).toEqual([{ key: "a", dir: "asc" }]);
  });
  it("honours a descending first direction", () => {
    expect(nextSortKeys([], "n", { firstDir: "desc" })).toEqual([{ key: "n", dir: "desc" }]);
    expect(nextSortKeys([{ key: "n", dir: "desc" }], "n", { firstDir: "desc" })).toEqual([{ key: "n", dir: "asc" }]);
  });
});

describe("sortBadge", () => {
  const keys = [{ key: "a", dir: "asc" }, { key: "b", dir: "desc" }];
  it("gives order and direction", () => {
    expect(sortBadge(keys, "b")).toEqual({ order: 2, dir: "desc", count: 2 });
    expect(sortBadge(keys, "z")).toBeNull();
    expect(badgeText(sortBadge(keys, "b"))).toBe("2");
    expect(badgeText(sortBadge([keys[0]], "a"))).toBe("");
    expect(arrowOf(sortBadge(keys, "b"))).toBe("▼");
  });
});

describe("sortRows", () => {
  const rows = [
    { id: 1, p: "B", f: 0.5 },
    { id: 2, p: "A", f: 0.2 },
    { id: 3, p: "A", f: 0.9 },
    { id: 4, p: "B", f: null },
    { id: 5, p: "A", f: 0.9 },
  ];
  it("sorts by several keys, stable on ties", () => {
    const out = sortRows(rows, [{ key: "p", dir: "asc" }, { key: "f", dir: "desc" }]);
    expect(out.map((r) => r.id)).toEqual([3, 5, 2, 1, 4]);
  });
  it("puts missing values last in both directions", () => {
    expect(sortRows(rows, [{ key: "f", dir: "asc" }]).map((r) => r.id)).toEqual([2, 1, 3, 5, 4]);
    expect(sortRows(rows, [{ key: "f", dir: "desc" }]).map((r) => r.id)).toEqual([3, 5, 1, 2, 4]);
  });
  it("uses accessors and natural text order", () => {
    const r = [{ n: "p10" }, { n: "p2" }];
    expect(sortRows(r, [{ key: "x", dir: "asc" }], { x: (row) => row.n }).map((v) => v.n)).toEqual(["p2", "p10"]);
  });
  it("returns the rows when no keys", () => {
    expect(sortRows(rows, [])).toBe(rows);
  });
});
