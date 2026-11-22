/**
 * @jest-environment node
 */
import { parseAtacIndex, perCopyValues, poolCellArrays, poolFor, signalMax, valueColumns } from "./atac";
import {
  applyCellFilters, depthClass, diffSides, filterLabel, filterParams, orderBySelection, parseFilterParams, rowEmphasis, rowsBySelection,
  sPhaseOf, toggleSelection,
} from "./cellFilters";

describe("atac index", () => {
  const json = {
    format: "gos-atac-index",
    version: 1,
    unit: "cpm",
    bin_size: 1000,
    pools: [
      { id: "c1", group: "c1", n_cells: 29, fragments: 100, bigwig: "c1.bw", peaks: "c1.peaks.bed.gz", cells: ["a"] },
      { id: "tp_T0", group: null, n_cells: 5, bigwig: "tp_T0.bw" },
      { id: "bad" },
    ],
    all: { bigwig: "all.bw", peaks: "all.peaks.bed.gz", n_cells: 40 },
  };
  test("parse, pools by group, named pools and the all pool", () => {
    const r = parseAtacIndex(json);
    expect(r.ok).toBe(true);
    expect(r.index.pools.map((p) => p.id)).toEqual(["c1", "tp_T0"]);
    expect(poolFor(r.index, { group: "c1" }).bigwig).toBe("c1.bw");
    expect(poolFor(r.index, { group: "c9" })).toBeNull();
    expect(poolFor(r.index, { id: "tp_T0" }).n_cells).toBe(5);
    expect(poolFor(r.index, {}).id).toBe("all");
  });
  test("reasons for unreadable indexes", () => {
    expect(parseAtacIndex({ format: "x" }).error).toMatch(/unknown format/);
    expect(parseAtacIndex({ format: "gos-atac-index", version: 1, pools: [] }).error).toBe("no pools");
  });
});

describe("atac signal", () => {
  const slot = { window: { chrom: "1", start: 1, end: 4000 }, x0: 0, width: 4 };
  test("overlap-weighted pixel columns", () => {
    const cols = valueColumns([{ start: 0, end: 1000, value: 2 }, { start: 1000, end: 1500, value: 4 }, { start: 1500, end: 2000, value: 0 }], slot);
    expect(cols[0]).toBeCloseTo(2);
    expect(cols[1]).toBeCloseTo(2);
    expect(Number.isNaN(cols[3])).toBe(true);
  });
  test("per copy divides by the clade median CN of the bin; CN 0 or NA gives NaN", () => {
    const entry = { starts: Float64Array.from([1, 2001]), ends: Float64Array.from([2000, 4000]) };
    const median = Float32Array.from([2, 4]);
    const v = perCopyValues([{ start: 0, end: 1000, value: 6 }, { start: 3000, end: 4000, value: 8 }], entry, median);
    expect(v.map((x) => x.value)).toEqual([3, 2]);
    const zero = perCopyValues([{ start: 0, end: 1000, value: 6 }], entry, Float32Array.from([0, NaN]));
    expect(Number.isNaN(zero[0].value)).toBe(true);
    expect(Number.isNaN(perCopyValues([{ start: 0, end: 10, value: 1 }], null, null)[0].value)).toBe(true);
  });
  test("signal max and pooling per-cell arrays", () => {
    expect(signalMax([Float32Array.from([...Array.from({ length: 100 }, (_, i) => i + 1), NaN, 1e6])])).toBe(100);
    expect(signalMax([])).toBeNull();
    const p = poolCellArrays([{ x: [10, 20], y: [2, 4] }, { x: [20, 30], y: [6, 1] }, null]);
    expect(Array.from(p.x)).toEqual([10, 20, 30]);
    expect(Array.from(p.y)).toEqual([2, 5, 1]);
    expect(p.n).toBe(2);
  });
});

describe("cell filters and selection", () => {
  const units = [
    { id: "a", group: "c1", depth_class: "deep", s_phase: "TRUE", time_point: "T0" },
    { id: "b", group: "c1", depth: 5e4, s_phase: "FALSE", time_point: "T11" },
    { id: "c", group: "c2", depth: 2e5, s_phase: "NA", time_point: "T12" },
    { id: "d", group: "c3", s_phase: "FALSE", time_point: "T0" },
  ];
  test("depth class and S-phase calls", () => {
    expect(units.map(depthClass)).toEqual(["deep", "shallow", "deep", null]);
    expect(units.map(sPhaseOf)).toEqual([true, false, null, false]);
  });
  test("filters keep the right cells and count what they drop", () => {
    expect(applyCellFilters(units).units).toHaveLength(4);
    const deep = applyCellFilters(units, { depth: "deep" });
    expect(deep.units.map((u) => u.id)).toEqual(["a", "c"]);
    expect(deep.dropped.depth).toBe(2);
    expect(applyCellFilters(units, { sphase: "hide" }).units.map((u) => u.id)).toEqual(["b", "c", "d"]);
    expect(applyCellFilters(units, { sphase: "only" }).units.map((u) => u.id)).toEqual(["a"]);
    expect(applyCellFilters(units, { depth: "deep", sphase: "hide" }).units.map((u) => u.id)).toEqual(["c"]);
    expect(filterLabel({ depth: "deep", sphase: "only" })).toBe("deep cells, S-phase only");
    expect(filterLabel({})).toBe("");
  });
  test("selection moves selected clades to the top and dims the rest", () => {
    expect(orderBySelection(units, ["c3", "c2"]).map((u) => u.id)).toEqual(["d", "c", "a", "b"]);
    expect(orderBySelection(units, []).map((u) => u.id)).toEqual(["a", "b", "c", "d"]);
    const rows = [{ key: "clade:c1", group: "c1" }, { key: "clade:c2", group: "c2" }, { key: "cell:x", group: "c2" }];
    expect(rowsBySelection(rows, ["c2"]).map((r) => r.key)).toEqual(["clade:c2", "cell:x", "clade:c1"]);
    expect(rowEmphasis(rows[0], ["c2"])).toBe("dimmed");
    expect(rowEmphasis(rows[1], ["c2"])).toBe("selected");
    expect(rowEmphasis(rows[0], [])).toBe("normal");
    expect(toggleSelection([], "c1")).toEqual(["c1"]);
    expect(toggleSelection(["c1"], "c1")).toEqual([]);
    expect(toggleSelection(["c1"], "c2", true)).toEqual(["c1", "c2"]);
    expect(toggleSelection(["c1", "c2"], "c1", true)).toEqual(["c2"]);
  });
  test("URL round trip", () => {
    const p = filterParams({ depth: "deep", sphase: "hide", selected: ["c1", "j 2"] });
    expect(p).toEqual({ tbdepth: "deep", tbsphase: "hide", tbsel: "c1,j%202" });
    const back = parseFilterParams((k) => p[k]);
    expect(back).toEqual({ depth: "deep", sphase: "hide", selected: ["c1", "j 2"] });
    expect(parseFilterParams(() => null)).toEqual({ depth: "all", sphase: "show", selected: [] });
    expect(filterParams({})).toEqual({ tbdepth: null, tbsphase: null, tbsel: null });
  });
  test("cn_diff sides by clade and by time point", () => {
    expect(diffSides(units, { by: "clade", a: "c1", b: "c2" })).toEqual({ a: ["a", "b"], b: ["c"], label: "c1 minus c2" });
    const tp = diffSides(units, { by: "time_point", a: ["T11", "T12"], b: ["T0"] });
    expect(tp.a).toEqual(["b", "c"]);
    expect(tp.b).toEqual(["a", "d"]);
    expect(tp.label).toBe("T11+T12 minus T0");
  });
});
