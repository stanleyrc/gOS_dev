/**
 * @jest-environment node
 */
// Spec v0.5 helpers: JW-07 events lane + clade rates, JW-08 atac_residual / atac_cn, pseudobulk-row collapse, lazy loading.
// Synthetic fixtures only (TEST ONLY: shapes of contract_v05, values made up).
import {
  cinEventLabel, cinEventLines, cinStatusColor, cinStatusKey, formatRate, isCinEventsTrack, normalizeCinEvents, normalizeCladeRates, plateOfDataset, ratesOfClade, CIN_STATUS_COLORS,
} from "./cinEvents";
import {
  armOf, atacCnInWindow, atacCnMax, genomeLayout, normalizeAtacCn, normalizeAtacResiduals, regionsInWindows, residualLanes, residualLines, residualRange,
} from "./atacV05";
import { buildRows, pbRowsOf, rowOffsets, subRowHeights, PB_SUMMARY_H } from "./layout";
import { normalizePseudobulkGraphs } from "./pseudobulkGraphs";
import { graphIdsToLoad, matrixPseudobulk, shouldDeferCellFiles } from "./lazyUnits";
import { parseHeatmapIndex } from "./cnHeatmap";
import { STRIPS, stripValue } from "./cnHeatmap";

describe("JW-07 events lane", () => {
  const json = {
    source: "test",
    caveat: "TEST ONLY",
    events: [
      { id: "X_amp1", kind: "amplicon", chrom: "8", start: 126e6, end: 129e6, class: "complex amplicon", status: "fixed (subclonal)", status_rule: "fixed (subclonal)", confidence: "low", carrier_frac: 0.1, by_group: { c1: 3, c2: 0 }, evidence: "var/mean 0.12; carriers by plate p:8" },
      { id: "X_arm7p", kind: "arm", chrom: "chr7", start: 1, end: 60e6, arm: "7p", direction: "gain", class: "arm event", status: "unresolved (ongoing downgraded)", confidence: "medium", carrier_frac: "0.42", by_group: "NA" },
      { id: "X_arm2q", kind: "arm", chrom: "2", start: 94e6, end: 242e6, arm: "2q", direction: "loss", class: "arm event", status: "fixed", carrier_frac: null },
    ],
  };
  test("status keys and colors", () => {
    expect(cinStatusKey("fixed (subclonal)")).toBe("fixed subclonal");
    expect(cinStatusKey("fixed (clonal)")).toBe("fixed");
    expect(cinStatusKey("unresolved")).toBe("unresolved");
    expect(cinStatusKey("ongoing")).toBe("unresolved");
    expect(cinStatusKey("")).toBe("other");
    expect(cinStatusColor("fixed")).toBe(CIN_STATUS_COLORS.fixed);
  });
  test("normalize, labels and tooltip lines", () => {
    const r = normalizeCinEvents(json);
    expect(r.caveat).toBe("TEST ONLY");
    expect(r.events.map((e) => e.statusKey)).toEqual(["fixed subclonal", "unresolved", "fixed"]);
    expect(r.events[0].byGroup).toBe("c1:3, c2:0");
    expect(r.events[1].carrierFrac).toBe(0.42);
    expect(r.events[1].byGroup).toBe("");
    expect(r.events[2].carrierFrac).toBeNull();
    expect(cinEventLabel(r.events[1])).toBe("7p gain · unresolved");
    const lines = cinEventLines(r.events[0]);
    expect(lines.join("\n")).toMatch(/class: complex amplicon/);
    expect(lines.join("\n")).toMatch(/carrier fraction: 0.10/);
    expect(lines.join("\n")).toMatch(/evidence: var\/mean/);
    expect(cinEventLines(r.events[2]).join("\n")).toMatch(/carrier fraction: not available/);
  });
  test("track detection", () => {
    expect(isCinEventsTrack({ type: "events", url: "{dataPath}{patient}/cin_events.json" })).toBe(true);
    expect(isCinEventsTrack({ type: "events", url: "{dataPath}{patient}/events.json" })).toBe(false);
    expect(isCinEventsTrack({ type: "events", color_by: "status" })).toBe(true);
  });
});

test("by_group nested form and per-plate clade_map; loci genome validates", () => {
  const { byGroupText } = require("./cinEvents");
  expect(byGroupText({ by: "plate", measure: "carriers", values: { T0_A: 3, T1_A: 1 } })).toBe("carriers by plate: T0_A:3, T1_A:1");
  expect(byGroupText({ by: "plate", measure: "carriers", values: {} })).toBe("");
  const r = normalizeAtacResiduals({ regions: [{ id: "a", chrom: "1", start: 1, end: 10 }], clade_means: [{ clade: "j1", region: "a", resid: 0.1, se: 0.01, n: 5 }, { clade: "j2", region: "a", resid: 0.2 }], clade_map: { c1: "j1", c2: "j1" } });
  expect(residualLanes(r).map((l) => l.note)).toEqual(["this plate: c1, c2", "no clade of this plate"]);
  const { validateSpec } = require("./trackSpec");
  expect(validateSpec({ spec: "gos-track-spec", version: "0.5", loci: ["genome"], tracks: [] })).toEqual([]);
});

describe("clade rates", () => {
  const json = {
    unit: "whole-chromosome changes per cell (bias-corrected, calibrated)",
    by_clade_plate: [
      { clade: "j1", plate: "T11_A", n_cells: 19, rate: 0.59, lo: 0.25, hi: 1.51, p_per_chrom: 0.027 },
      { clade: "j1", plate: "T0_A", n_cells: 96, rate: 0.27, lo: 0.12, hi: 0.47, p_per_chrom: 0.012 },
      { clade: "j2", plate: "T0_A", n_cells: 5, rate: null, lo: null, hi: null },
    ],
  };
  test("rows, plate filter, ordering, formatting", () => {
    const r = normalizeCladeRates(json);
    expect(r.notAvailable).toBeNull();
    expect(ratesOfClade(r, "j1").map((x) => x.plate)).toEqual(["T0_A", "T11_A"]);
    expect(formatRate(ratesOfClade(r, "j1")[0])).toBe("0.27 [0.12, 0.47] (n 96)");
    expect(formatRate(ratesOfClade(r, "j2")[0])).toBe("not available");
    expect(normalizeCladeRates(json, "T11_A").rows.map((x) => x.plate)).toEqual(["T11_A"]);
    expect(normalizeCladeRates(json, "T4_B").notAvailable).toMatch(/no clade x plate rates/);
  });
  test("H1299: not available reason kept", () => {
    const r = normalizeCladeRates({ not_available: "no JW-07 rates for this line (TEST)" });
    expect(r.notAvailable).toBe("no JW-07 rates for this line (TEST)");
    expect(normalizeCladeRates(null).notAvailable).toMatch(/no clade_rates/);
  });
  test("plate of a dataset id", () => {
    expect(plateOfDataset("datac_sw620_t0_a")).toBe("T0_A");
    expect(plateOfDataset("datac_sw620_t12_b")).toBe("T12_B");
    expect(plateOfDataset("datac_sw620_joint")).toBeNull();
    expect(plateOfDataset("datac_h1299")).toBeNull();
  });
});

describe("JW-07 heat-map strips", () => {
  test("cin_wc_changes and cin_events_carried are numeric strips; NA stays null", () => {
    expect(STRIPS.map((s) => s.key)).toEqual(expect.arrayContaining(["cin_wc_changes", "cin_events_carried"]));
    expect(stripValue({ cin_wc_changes: 2 }, "cin_wc_changes")).toBe(2);
    expect(stripValue({ cin_wc_changes: "NA" }, "cin_wc_changes")).toBeNull();
    expect(stripValue({ cin_events_carried: "3" }, "cin_events_carried")).toBe(3);
  });
});

describe("atac_residual", () => {
  const json = {
    unit: "log2 residual accessibility after dose (log CN, depth, TSS)",
    regions: [{ id: "S_amp1", kind: "amplicon", chrom: "8", start: 126e6, end: 129e6 }, { id: "S_arm7p", kind: "arm", chrom: "chr7", start: 1, end: 60e6 }, { id: "bad", chrom: "1", start: 5, end: 1 }],
    clade_means: [
      { clade: "j2", region: "S_amp1", n: 40, resid: -0.2, se: 0.05 },
      { clade: "j1", region: "S_amp1", n: 600, resid: 0.1, se: 0.02 },
      { clade: "j1", region: "S_arm7p", n: 600, resid: -0.31, se: 0.04 },
    ],
    tests: [{ region: "S_amp1", clade_q: 0.01, clade_eta2: 0.12, lineage_z: 2.3, lineage_q: 0.07 }],
    time_means: [
      { region: "S_amp1", sample: "T0_A", time: "T0", resid: 0.2, n: 100 },
      { region: "S_amp1", sample: "T0_B", time: "T0", resid: 0.1, n: 100 },
      { region: "S_amp1", sample: "T11_A", time: "late", resid: -0.05, n: 50 },
    ],
  };
  test("normalize, lanes by clade and time", () => {
    const r = normalizeAtacResiduals(json);
    expect(r.ok).toBe(true);
    expect([...r.regions.keys()]).toEqual(["S_amp1", "S_arm7p"]);
    expect(r.clades).toEqual(["j1", "j2"]);
    expect(r.times).toEqual(["T0", "late"]);
    expect(r.timeMeans.get("T0").get("S_amp1").resid).toBeCloseTo(0.15);
    expect(r.timeMeans.get("T0").get("S_amp1").n).toBe(200);
    expect(residualLanes(r).map((l) => l.label)).toEqual(["j1", "j2"]);
    expect(residualLanes(r, "time").map((l) => l.label)).toEqual(["T0", "late"]);
    expect(normalizeAtacResiduals({ regions: [] }).ok).toBe(false);
  });
  test("windows, range, hover lines with q values", () => {
    const r = normalizeAtacResiduals(json);
    const slots = [{ window: { chrom: "8", start: 127e6, end: 140e6 } }, { window: { chrom: "7", start: 1, end: 159e6 } }];
    const hits = regionsInWindows(r, slots);
    expect(hits.map((h) => [h.region.id, h.slot, h.start, h.end])).toEqual([["S_amp1", 0, 127e6, 129e6], ["S_arm7p", 1, 1, 60e6]]);
    expect(residualRange(residualLanes(r), hits)).toBe(0.5);
    const lines = residualLines(r, residualLanes(r)[0], r.regions.get("S_amp1")).join("\n");
    expect(lines).toMatch(/residual 0.100 ± 0.020 \(SE\) · n 600/);
    expect(lines).toMatch(/clade q 0.010/);
    expect(residualLines(r, residualLanes(r)[1], r.regions.get("S_arm7p")).join("\n")).toMatch(/not available/);
    expect(residualLines(r, residualLanes(r, "time")[0], r.regions.get("S_amp1")).join("\n")).toMatch(/plates: T0_A 0.20, T0_B 0.10/);
  });
});

describe("atac_cn", () => {
  const json = {
    unit: "relative CN (ATAC-only, mean = 1; no ploidy)",
    bin_size: 1000000,
    pools: [
      { id: "j1", n_cells: 600, bins: [["1", 1, 1e6, null, null, false], ["1", 1000001, 2e6, 1.2, 1.1, true], ["2", 1, 1e6, 0.8, null, true]] },
      { id: "empty", n_cells: 0, bins: [] },
    ],
    arms: [{ arm: "1p", n_bins: 12, pooled_rel_cn: 0.93, sd_cells: 0.18 }],
  };
  test("normalize, window bins, y max, genome layout, arms", () => {
    const r = normalizeAtacCn(json);
    expect(r.ok).toBe(true);
    expect(r.pools.map((p) => p.id)).toEqual(["j1"]);
    expect(r.hasGenome).toBe(true);
    const b = atacCnInWindow(r.pools[0], { chrom: "chr1", start: 1, end: 1.5e6 });
    expect(b).toEqual([{ start: 1, end: 1e6, atac: null, genome: null, usable: false }, { start: 1000001, end: 1.5e6, atac: 1.2, genome: 1.1, usable: true }]);
    expect(atacCnMax(r.pools, [{ chrom: "1", start: 1, end: 3e6 }])).toBe(2);
    const lay = genomeLayout(r, 102, { 1: { startPoint: 1, endPoint: 3e6 }, 2: { startPoint: 1, endPoint: 1e6 }, 3: { startPoint: 1, endPoint: 5e6 } }, 2);
    expect(lay.map((x) => x.chrom)).toEqual(["1", "2"]);
    expect(lay[0].x1).toBeCloseTo(75);
    expect(lay[1].x0).toBeCloseTo(77);
    expect(r.arms.get("1p").pooled_rel_cn).toBe(0.93);
    expect(armOf("chr7", 10e6)).toBe("7p");
    expect(armOf("7", 100e6)).toBe("7q");
    expect(armOf("MT", 1)).toBeNull();
    expect(normalizeAtacCn({ pools: [], not_available: "ATAC-only CN not computed (TEST)" })).toEqual({ ok: false, error: "ATAC-only CN not computed (TEST)" });
  });
});

describe("pseudobulk-row collapse", () => {
  const entries = normalizePseudobulkGraphs([
    { id: "p1", group: "j1", plate: "T11_A" }, { id: "p2", group: "j1", plate: "T0_A" }, { id: "p3", group: "j1", plate: "T0_A" }, { id: "p4", group: "j1", plate: "T0_B" },
    { id: "q1", group: "j2", plate: "T0_A" },
  ]);
  const units = [{ id: "a", group: "j1" }, { id: "b", group: "j2" }];
  test("collapsed by default when > 3, grouped by plate when expanded", () => {
    expect(entries[0].plate).toBe("T11_A");
    const j1 = entries.filter((e) => e.group === "j1");
    expect(pbRowsOf("j1", j1).map((r) => r.key)).toEqual(["pbsum:j1"]);
    expect(pbRowsOf("j1", j1)[0]).toMatchObject({ n: 4, expanded: false });
    expect(pbRowsOf("j1", j1, { j1: true }).map((r) => r.key)).toEqual(["pbsum:j1", "pbplate:j1:T0_A", "pbgraph:p2", "pbgraph:p3", "pbplate:j1:T0_B", "pbgraph:p4", "pbplate:j1:T11_A", "pbgraph:p1"]);
    expect(pbRowsOf("j2", entries.filter((e) => e.group === "j2")).map((r) => r.key)).toEqual(["pbgraph:q1"]);
  });
  test("buildRows in both modes; summary rows have a fixed height", () => {
    expect(buildRows(units, "pseudobulk", {}, entries).map((r) => r.key)).toEqual(["clade:j1", "pbsum:j1", "clade:j2", "pbgraph:q1"]);
    expect(buildRows(units, "cells", {}, entries, {}).map((r) => r.key)).toEqual(["pbsum:j1", "pbgraph:q1", "cell:a", "cell:b"]);
    expect(subRowHeights({ kind: "pbsummary" }, 56)).toEqual({ graph: 0, coverage: 0, atac: 0, note: PB_SUMMARY_H });
    const { items } = rowOffsets(buildRows(units, "pseudobulk", {}, entries), 56, {}, { graph: true, coverage: true }, 3);
    expect(items[1].height).toBe(PB_SUMMARY_H);
  });
});

describe("lazy loading", () => {
  test("graph ids: visible cell rows, pinned cells, small expanded clades only", () => {
    const rows = [{ kind: "clade", group: "j1", members: ["a", "b"] }, { kind: "clade", group: "j2", members: Array.from({ length: 400 }, (_, i) => `x${i}`) }];
    const visibleItems = [{ row: rows[0] }, { row: { kind: "cell", id: "x3" } }];
    expect(graphIdsToLoad({ visibleItems: [{ row: rows[0] }], rows })).toEqual([]);
    expect(graphIdsToLoad({ visibleItems, pinned: ["cell:z", "clade:j1"], rows, expanded: { j1: true, j2: true } })).toEqual(["x3", "z", "a", "b"]);
    expect(graphIdsToLoad({ visibleItems, rows, expanded: { j1: true }, mode: "cells" })).toEqual(["x3"]);
  });
  test("clade median from the matrix, adjacent equal bins merged", () => {
    const p = parseHeatmapIndex({ format: "gos-cn-heatmap-u16", version: 1, scale: 100, na: 65535, cells: ["a", "b", "c"], chroms: [{ chrom: "1", file: "c1", starts: [1, 501, 1001, 1501], ends: [500, 1000, 1500, 2000] }] });
    expect(p.ok).toBe(true);
    const NaN_ = NaN;
    // rows a, b, c x 4 bins
    const mat = new Float32Array([2, 2, 3, NaN_, 2, 2, 4, NaN_, 2, 2, 5, NaN_]);
    const slots = [{ window: { chrom: "1", start: 200, end: 2000 } }, { window: { chrom: "2", start: 1, end: 10 } }];
    const pb = matrixPseudobulk(p.index, new Map([["1", mat]]), ["a", "b", "c"], slots);
    expect(pb.n).toBe(3);
    expect(pb.source).toBe("matrix");
    expect(pb.steps.map((s) => [s.start, s.end, s.median, s.q1, s.q3])).toEqual([[200, 1000, 2, 2, 2], [1001, 1500, 4, 3.5, 4.5]]);
    expect(matrixPseudobulk(p.index, new Map(), ["a"], slots).pending).toBe(1);
    expect(matrixPseudobulk(p.index, new Map([["1", mat]]), ["nope"], slots).n).toBe(0);
  });
  test("defer per-cell files only on the track browser tab", () => {
    expect(shouldDeferCellFiles({ tab: "21", dataset: { lazyCellFiles: true }, nCells: 10, url: "http://h/?tab=21" })).toBe(true);
    expect(shouldDeferCellFiles({ tab: 21, dataset: {}, nCells: 2280, url: "http://h/" })).toBe(true);
    expect(shouldDeferCellFiles({ tab: "21", dataset: {}, nCells: 300, url: "http://h/" })).toBe(false);
    expect(shouldDeferCellFiles({ tab: "7", dataset: { lazyCellFiles: true }, nCells: 2280, url: "http://h/" })).toBe(false);
    expect(shouldDeferCellFiles({ tab: "21", dataset: { lazyCellFiles: true }, nCells: 2280, full: true })).toBe(false);
    expect(shouldDeferCellFiles({ tab: "21", dataset: { lazyCellFiles: true }, nCells: 2280, url: "http://h/?lazycells=0" })).toBe(false);
    expect(shouldDeferCellFiles({ tab: "21", dataset: {}, nCells: 3, url: "http://h/?lazycells=1" })).toBe(true);
  });
});
