import {
  AUTO_FIT_MIN, autoFitBase, buildRows, clampHeight, loadLayoutPrefs, resolveWindowScales, rowAt, rowOffsets, saveLayoutPrefs,
  scaleFrac, scaleTicks, scalesDiffer, subRowHeights, valueQuantile,
} from "./layout";
import { pseudobulkInWindows } from "./pseudobulk";

const units = [
  { id: "a", group: "C1" },
  { id: "b", group: "C1" },
  { id: "c", group: "C2" },
];
const tracks = { graph: true, coverage: true };

describe("rows", () => {
  test("pseudobulk first, cells expandable per clade", () => {
    expect(buildRows(units).map((r) => r.key)).toEqual(["clade:C1", "clade:C2"]);
    expect(buildRows(units, "pseudobulk", { C1: true }).map((r) => r.key)).toEqual(["clade:C1", "cell:a", "cell:b", "clade:C2"]);
    expect(buildRows(units, "cells").map((r) => r.kind)).toEqual(["cell", "cell", "cell"]);
  });
  test("exported pseudobulk graphs follow their clade (pseudobulk) or lead the stack (cells)", () => {
    const pb = [{ id: "C1_jabba", group: "C1" }, { id: "C3_jabba", group: "C3" }];
    expect(buildRows(units, "pseudobulk", { C1: true }, pb).map((r) => r.key)).toEqual(["clade:C1", "pbgraph:C1_jabba", "cell:a", "cell:b", "clade:C2"]);
    expect(buildRows(units, "cells", {}, pb).map((r) => r.key)).toEqual(["pbgraph:C1_jabba", "cell:a", "cell:b", "cell:c"]);
    const h = subRowHeights({ kind: "pbgraph" }, 30, {}, tracks);
    expect(h).toEqual(subRowHeights({ kind: "clade" }, 30, {}, tracks));
  });
  test("heights: clamp, overrides, clade rows taller and graph only", () => {
    expect(clampHeight(5)).toBe(12);
    expect(clampHeight(999)).toBe(200);
    const cell = { kind: "cell" };
    expect(subRowHeights(cell, 30, { coverage: 80 }, tracks)).toEqual({ graph: 30, coverage: 80, atac: 0 });
    expect(subRowHeights(cell, 30, {}, { graph: false, coverage: true })).toEqual({ graph: 0, coverage: 30, atac: 0 });
    // v0.4 atac sub-row: cells and clades (not exported pseudobulk graphs); default 3/4 of the base, override wins
    expect(subRowHeights(cell, 40, {}, { graph: true, coverage: true, atac: true }).atac).toBe(30);
    expect(subRowHeights(cell, 40, { atac: 70 }, { graph: true, coverage: true, atac: true }).atac).toBe(70);
    expect(subRowHeights({ kind: "clade" }, 40, {}, { graph: true, coverage: false, atac: true }).atac).toBe(30);
    expect(subRowHeights({ kind: "pbgraph" }, 40, {}, { graph: true, coverage: false, atac: true }).atac).toBe(0);
    const clade = subRowHeights({ kind: "clade" }, 30, {}, tracks);
    expect(clade.coverage).toBe(0);
    expect(clade.graph).toBeGreaterThan(AUTO_FIT_MIN);
  });
  test("auto-fit grows few rows to fill the view, never below the minimum", () => {
    const rows = buildRows(units, "cells");
    const b = autoFitBase(rows, 24, {}, tracks, 600);
    expect(b).toBeGreaterThan(24);
    const { total } = rowOffsets(rows, b, {}, tracks);
    expect(total).toBeLessThanOrEqual(600 + 3);
    const many = Array.from({ length: 200 }, (_, i) => ({ kind: "cell", id: `${i}` }));
    expect(autoFitBase(many, 24, {}, tracks, 600)).toBe(AUTO_FIT_MIN);
  });
  test("row offsets and lookup", () => {
    const { items } = rowOffsets(buildRows(units, "cells"), 20, {}, tracks, 2);
    expect(items[1].top).toBe(42);
    expect(rowAt(items, 45)).toBe(1);
    expect(rowAt(items, 41)).toBe(-1);
  });
  test("prefs survive a broken storage", () => {
    const mem = { v: null, getItem() { return this.v; }, setItem(k, v) { this.v = v; } };
    expect(saveLayoutPrefs({ base: 50 }, mem)).toBe(true);
    expect(loadLayoutPrefs(mem)).toEqual({ base: 50 });
    const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
    expect(loadLayoutPrefs(broken)).toBeNull();
    expect(saveLayoutPrefs({}, broken)).toBe(false);
  });
});

describe("per-window y scales", () => {
  const stats = [{ max: 95, p99: 60 }, { max: 3, p99: 3 }];
  test("auto per window, log for high windows, shared when asked", () => {
    const s = resolveWindowScales([{}, {}], stats);
    expect(s[0].max).toBe(100);
    expect(s[0].log).toBe(true);
    expect(s[1].max).toBe(4);
    expect(s[1].log).toBe(false);
    expect(scalesDiffer(s)).toBe(true);
    const shared = resolveWindowScales([{}, {}], stats, true);
    expect(shared[1].max).toBe(100);
    expect(scalesDiffer(shared)).toBe(false);
  });
  test("robust (99th percentile) and manual", () => {
    expect(resolveWindowScales([{ robust: true }], [stats[0]])[0].max).toBe(60);
    const m = resolveWindowScales([{ mode: "manual", min: 1, max: 8, log: false }], [stats[0]])[0];
    expect(m).toMatchObject({ min: 1, max: 8, log: false, mode: "manual" });
  });
  test("fractions clip and ticks are 0 / 2 / max", () => {
    expect(scaleFrac(50, { min: 0, max: 100, log: false }).f).toBe(0.5);
    expect(scaleFrac(150, { min: 0, max: 100, log: false })).toEqual({ f: 1, clipped: true });
    expect(scaleTicks({ min: 0, max: 100 })).toEqual([0, 2, 100]);
    expect(scaleTicks({ min: 0, max: 2 })).toEqual([0, 2]);
    expect(valueQuantile([1, 2, 3, 100], 0.5)).toBe(2);
  });
});

describe("clade pseudobulk", () => {
  const g = (cn, jx = true) => ({
    intervals: [
      { iid: 1, chromosome: "1", startPoint: 1, endPoint: 100, y: 2 },
      { iid: 2, chromosome: "1", startPoint: 101, endPoint: 200, y: cn },
    ],
    connections: jx ? [{ cid: 1, source: 2, sink: -1, type: "ALT", weight: cn, title: "DUP-like" }] : [],
  });
  test("median CN per interval and junction support across cells", () => {
    const pb = pseudobulkInWindows([g(10), g(20), g(30, false), null], [{ window: { chrom: "1", start: 1, end: 200 } }]);
    expect(pb.n).toBe(3);
    expect(pb.steps.map((s) => [s.start, s.end, s.median])).toEqual([[1, 100, 2], [101, 200, 20]]);
    expect(pb.junctions).toHaveLength(1);
    expect(pb.junctions[0].cells).toBe(2);
    expect(pb.junctions[0].frac).toBeCloseTo(2 / 3);
    expect(pb.junctions[0].cnMedian).toBe(15);
  });
});

describe("pseudobulk as a gGnome.js graph", () => {
  const { pseudobulkGenome } = require("./pseudobulk");
  test("steps become intervals, junctions anchor on step boundaries or partner stubs", () => {
    const g = (cn) => ({
      intervals: [
        { iid: 1, chromosome: "1", startPoint: 1, endPoint: 100, y: 2 },
        { iid: 2, chromosome: "1", startPoint: 101, endPoint: 200, y: cn },
        { iid: 3, chromosome: "2", startPoint: 1, endPoint: 50, y: 3 },
      ],
      connections: [{ cid: 1, source: 2, sink: -3, type: "ALT", weight: cn, title: "TRA-like" }],
    });
    const slots = [{ window: { chrom: "1", start: 1, end: 200 } }];
    const pb = pseudobulkInWindows([g(10), g(20)], slots);
    const gg = pseudobulkGenome(pb, slots);
    expect(gg.intervals.filter((i) => i.title !== "partner").map((i) => [i.startPoint, i.endPoint, i.y])).toEqual([[1, 100, 2], [101, 200, 15]]);
    expect(gg.connections).toHaveLength(1);
    const c = gg.connections[0];
    expect(gg.intervals.find((i) => i.iid === Math.abs(c.source)).endPoint).toBe(200);
    expect(gg.intervals.find((i) => i.iid === Math.abs(c.sink))).toMatchObject({ chromosome: "2", title: "partner" });
    expect(c.title).toContain("2/2 cells");
    expect(pseudobulkGenome(pb, slots, 1.01).connections).toHaveLength(0);
  });
});
