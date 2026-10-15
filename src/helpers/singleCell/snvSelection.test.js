import {
  carrierCells, columnPick, differenceIds, dragPick, idsInRange, idsToColumns, intersectIds, knownIds,
  parseSnsel, removeSet, selectedOnlyIds, serializeSnsel, toggleId, unionIds, upsertSet,
} from "./snvSelection";
import { filterSnvColumns } from "./snvSites";

const order = ["a", "b", "c", "d", "e", "f"];
const snv = {
  cells: ["c1", "c2", "c3"],
  variants: [{ id: "a" }, { id: "b" }, { id: "c" }],
  status: [Int8Array.from([1, 1, 0]), Int8Array.from([1, 0, 1]), Int8Array.from([-1, 0, 0])],
};

describe("set helpers", () => {
  test("toggle, union, intersect, difference", () => {
    expect(toggleId(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleId(["a", "b"], "a")).toEqual(["b"]);
    expect(unionIds(["a", "b"], ["b", "c", "c"])).toEqual(["a", "b", "c"]);
    expect(intersectIds(["a", "b", "c"], ["c", "a"])).toEqual(["a", "c"]);
    expect(differenceIds(["a", "b", "c"], ["b"])).toEqual(["a", "c"]);
  });
});

describe("range", () => {
  test("inclusive, either direction, clamped", () => {
    expect(idsInRange(order, 1, 3)).toEqual(["b", "c", "d"]);
    expect(idsInRange(order, 3, 1)).toEqual(["b", "c", "d"]);
    expect(idsInRange(order, -4, 1)).toEqual(["a", "b"]);
    expect(idsInRange(order, 4, 99)).toEqual(["e", "f"]);
    expect(idsInRange([], 0, 2)).toEqual([]);
  });
});

describe("columnPick", () => {
  test("plain click selects just that column and anchors it", () => {
    expect(columnPick(["a", "b"], order, { lo: 2 })).toEqual({ selected: ["c"], anchorId: "c" });
  });
  test("multi adds, then removes", () => {
    const one = columnPick(["a"], order, { lo: 3, multi: true, anchorId: "a" });
    expect(one.selected).toEqual(["a", "d"]);
    expect(one.anchorId).toBe("d");
    expect(columnPick(one.selected, order, { lo: 3, multi: true, anchorId: "d" }).selected).toEqual(["a"]);
  });
  test("multi on a binned block removes only when all of it is selected", () => {
    expect(columnPick(["b"], order, { lo: 1, hi: 2, multi: true }).selected).toEqual(["b", "c"]);
    expect(columnPick(["b", "c"], order, { lo: 1, hi: 2, multi: true }).selected).toEqual([]);
  });
  test("shift selects from the anchor, in either direction, keeping the anchor", () => {
    expect(columnPick(["x"], order, { lo: 4, shift: true, anchorId: "b" })).toEqual({ selected: ["b", "c", "d", "e"], anchorId: "b" });
    expect(columnPick([], order, { lo: 0, shift: true, anchorId: "c" }).selected).toEqual(["a", "b", "c"]);
  });
  test("shift without an anchor behaves as a plain click", () => {
    expect(columnPick([], order, { lo: 2, shift: true }).selected).toEqual(["c"]);
    expect(columnPick([], order, { lo: 2, shift: true, anchorId: "gone" }).selected).toEqual(["c"]);
  });
  test("shift with multi adds the range to the selection", () => {
    expect(columnPick(["f"], order, { lo: 2, shift: true, multi: true, anchorId: "a" }).selected).toEqual(["f", "a", "b", "c"]);
  });
  test("follows the current column order, so a reorder changes the range", () => {
    const rev = [...order].reverse();
    expect(columnPick([], rev, { lo: rev.indexOf("b"), shift: true, anchorId: "d" }).selected).toEqual(["d", "c", "b"]);
  });
  test("drag range, additive or not", () => {
    expect(dragPick(["f"], order, 3, 1)).toEqual(["b", "c", "d"]);
    expect(dragPick(["f"], order, 1, 2, true)).toEqual(["f", "b", "c"]);
  });
});

describe("matrix lookups", () => {
  test("ids to columns drops unknown ids", () => {
    expect(idsToColumns(snv, ["c", "zz", "a"])).toEqual([2, 0]);
    expect(knownIds(snv, ["zz", "b"])).toEqual(["b"]);
  });
  test("carriers: any vs all, no call never counts", () => {
    expect(carrierCells(snv, [0, 1], "any")).toEqual(["c1", "c2"]);
    expect(carrierCells(snv, [0, 1], "all")).toEqual(["c1"]);
    expect(carrierCells(snv, [0, 2], "all")).toEqual(["c2"]);
    expect(carrierCells(snv, [1, 2], "all")).toEqual([]);
    expect(carrierCells(snv, [], "any")).toEqual([]);
  });
});

describe("url and sets", () => {
  test("snsel round trip", () => {
    expect(serializeSnsel(["chr1_5_A_T", "chr2_9_C_G"])).toBe("chr1_5_A_T,chr2_9_C_G");
    expect(parseSnsel("chr1_5_A_T, chr2_9_C_G,")).toEqual(["chr1_5_A_T", "chr2_9_C_G"]);
    expect(serializeSnsel([])).toBeNull();
    expect(parseSnsel(null)).toEqual([]);
  });
  test("named sets replace by name and ignore empties", () => {
    const s = upsertSet([], "drivers", ["a", "b"]);
    expect(upsertSet(s, "drivers", ["c"])).toEqual([{ name: "drivers", ids: ["c"] }]);
    expect(upsertSet(s, "  ", ["c"])).toBe(s);
    expect(upsertSet(s, "x", [])).toBe(s);
    expect(removeSet(s, "drivers")).toEqual([]);
  });
});

describe("selected only filter", () => {
  test("acts through filterSnvColumns", () => {
    const sel = selectedOnlyIds(["b"], true);
    expect(filterSnvColumns(snv, [0, 1, 2], { snvSiteIds: sel })).toEqual([1]);
    expect(selectedOnlyIds(["b"], false)).toBeNull();
    expect(selectedOnlyIds([], true)).toBeNull();
    expect(filterSnvColumns(snv, [0, 1, 2], { snvSiteIds: selectedOnlyIds([], true) })).toEqual([0, 1, 2]);
  });
});

describe("filterSnvColumns with the selection", () => {
  test("snvSelectedOnly restricts to the selected ids; off or empty leaves all", () => {
    expect(filterSnvColumns(snv, [0, 1, 2], { snvSelected: ["a", "c"], snvSelectedOnly: true })).toEqual([0, 2]);
    expect(filterSnvColumns(snv, [0, 1, 2], { snvSelected: ["a", "c"], snvSelectedOnly: false })).toEqual([0, 1, 2]);
    expect(filterSnvColumns(snv, [0, 1, 2], { snvSelected: [], snvSelectedOnly: true })).toEqual([0, 1, 2]);
  });
});
