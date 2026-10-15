import {
  parseJcf, formatJcf, junctionFocusFromSearch, junctionFocusToSearch, effectiveFilter, isZoomed, junctionType, junctionLabel,
  junctionStats, touchesDomains, walkJunctionSet, walkOptions, junctionColumns, carrierRows,
} from "./junctionFocus";

const J = (index, c1, p1, s1, c2, p2, s2, g1, g2) => ({ index, chromosome1: c1, position1: p1, strand1: s1, chromosome2: c2, position2: p2, strand2: s2, global1: g1, global2: g2 });
const m = {
  cells: ["a", "b", "c"],
  junctions: [
    J(0, "1", 1e6, "+", "1", 2e6, "-", 1e6, 2e6),
    J(1, "7", 55.1e6, "-", "7", 56.0e6, "+", 800e6, 801e6),
    J(2, "7", 55.5e6, "-", "12", 60e6, "-", 801e6, 1000e6),
  ],
  cn: [Float32Array.from([1, 4, 0]), Float32Array.from([2, 6, 3]), Float32Array.from([0, 8, NaN])],
  maxCn: 8,
};
const walk = {
  id: "w1", ncells: 2,
  nodes: [{ chromosome: "7", start: 55100000, end: 55300000, strand: "+" }, { chromosome: "7", start: 55800000, end: 56000000, strand: "+" }],
  junctions: [{ from: 0, to: 1, type: "ALT" }, { from: 1, to: 0, type: "ALT" }],
};

test("jcf parse/format and url", () => {
  expect(parseJcf("walk:12")).toEqual({ mode: "walk", walkId: "12" });
  expect(parseJcf("view")).toEqual({ mode: "view", walkId: null });
  expect(parseJcf("bogus")).toBeNull();
  expect(formatJcf({ mode: "walk", walkId: "12" })).toBe("walk:12");
  expect(junctionFocusFromSearch("?jcf=walk:3&jsort=carriers")).toEqual({ junctionFilter: { mode: "walk", walkId: "3" }, junctionSort: "carriers" });
  expect(junctionFocusToSearch({ heatmapType: "cn", junctionFilter: { mode: "view" } })).toEqual({});
  expect(junctionFocusToSearch({ heatmapType: "junctions", junctionFilter: { mode: "all" }, junctionSort: "carriers" })).toEqual({ jcf: "all", jsort: "carriers" });
});

test("default filter follows zoom", () => {
  expect(isZoomed([[1, 3000]], [1, 3000])).toBe(false);
  expect(isZoomed([[800, 900]], [1, 3000])).toBe(true);
  expect(effectiveFilter(null, true).mode).toBe("view");
  expect(effectiveFilter(null, false).mode).toBe("all");
  expect(effectiveFilter({ mode: "all" }, true).mode).toBe("all");
});

test("type and label", () => {
  expect(junctionType(m.junctions[0])).toBe("DEL-like");
  expect(junctionType(m.junctions[1])).toBe("DUP-like");
  expect(junctionType(m.junctions[2])).toBe("TRA");
  expect(junctionLabel(m.junctions[1])).toBe("7:55.1M→7:56.0M DUP-like");
});

test("stats, carriers", () => {
  const s = junctionStats(m);
  expect(s[1]).toEqual({ n: 3, median: 6 });
  expect(s[2].n).toBe(1);
  expect(carrierRows(m, 0)).toEqual([0, 1]);
});

test("viewport and walk filters", () => {
  expect(touchesDomains(m.junctions[2], [[790e6, 810e6]])).toBe(true);
  expect(junctionColumns(m, { filter: { mode: "view" }, domains: [[790e6, 802e6]] })).toEqual([1, 2]);
  expect(junctionColumns(m, { filter: { mode: "view" }, domains: [[995e6, 1005e6]] })).toEqual([2]);
  expect([...walkJunctionSet(walk, m.junctions)]).toEqual([1]);
  expect(junctionColumns(m, { filter: { mode: "walk", walkId: "w1" }, walks: [walk] })).toEqual([1]);
  expect(junctionColumns(m, { filter: { mode: "walk", walkId: "none" }, walks: [walk] })).toEqual([]);
  expect(walkOptions([walk, { id: "x", junctions: [], nodes: [] }]).map((o) => o.id)).toEqual(["w1"]);
});

test("sort by carriers", () => {
  expect(junctionColumns(m, { filter: { mode: "all" }, sort: "carriers" })).toEqual([1, 0, 2]);
  expect(junctionColumns(m, { filter: { mode: "all" }, sort: "pos" })).toEqual([0, 1, 2]);
});
