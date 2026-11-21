import {
  bpToPx, clampWindow, formatLocus, igvLocus, layoutWindows, panWindow, parseLocus, parseWindow, pxToBp, toGlobal, windowAround, zoomWindow,
} from "./locus";
import { cnFromForeground, coverageAxes, expectedDepth, foregroundFromCn, niceTicks, unitFit } from "./coverageAxes";
import { coverageColumns, graphInWindows, junctionCarriers, lowerBound, sameJunction } from "./trackData";
import { buildSpec, interimTracks, resolveUrl, selectUnits, unitsFromCells, validateSpec } from "./trackSpec";

// synthetic two-chromosome genome
const chromoBins = {
  1: { chromosome: "1", startPoint: 1, endPoint: 1000000, startPlace: 1 },
  2: { chromosome: "2", startPoint: 1, endPoint: 500000, startPlace: 1000001 },
};

describe("locus model", () => {
  test("parses windows with chr prefix, commas and suffixes", () => {
    expect(parseWindow("chr1:100,000-200,000", chromoBins)).toEqual({ chrom: "1", start: 100000, end: 200000 });
    expect(parseWindow("2:0.1m-0.2m", chromoBins)).toEqual({ chrom: "2", start: 100000, end: 200000 });
    expect(parseWindow("chr2", chromoBins)).toEqual({ chrom: "2", start: 1, end: 500000 });
    expect(parseWindow("chr9:1-10", chromoBins)).toBeNull();
    expect(parseWindow("nonsense here", chromoBins)).toBeNull();
  });
  test("multi-locus round trip", () => {
    const { windows, errors } = parseLocus("chr1:100000-200000 | chr2:300,000-310,000 | bad:", chromoBins);
    expect(windows).toHaveLength(2);
    expect(errors).toEqual(["bad:"]);
    expect(formatLocus(windows)).toBe("chr1:100,000-200,000 | chr2:300,000-310,000");
    expect(igvLocus(windows)).toBe("chr1:100000-200000 chr2:300000-310000");
  });
  test("global coordinate matches gOS places", () => {
    expect(toGlobal(chromoBins, "chr1", 5)).toBe(5);
    expect(toGlobal(chromoBins, "2", 5)).toBe(1000005);
  });
  test("zoom keeps the pivot, pan and clamp stay in the chromosome", () => {
    const w = { chrom: "1", start: 100000, end: 200000 };
    const z = zoomWindow(w, 0.5, 0.5, 1000000);
    expect(z.start).toBe(125000);
    expect(z.end).toBe(175000);
    expect(panWindow(w, -500000, 1000000)).toEqual({ chrom: "1", start: 1, end: 100001 });
    expect(clampWindow({ chrom: "1", start: 10, end: 20 }, 1000000).end - 10).toBeGreaterThanOrEqual(200);
    expect(windowAround("chr2", 1000, 300, 500000)).toEqual({ chrom: "2", start: 700, end: 1300 });
  });
  test("split layout gives equal widths and invertible scales", () => {
    const slots = layoutWindows([{ chrom: "1", start: 0, end: 100 }, { chrom: "2", start: 0, end: 1000 }], 208, 8);
    expect(slots[0].width).toBe(100);
    expect(slots[1].x0).toBe(108);
    expect(bpToPx(slots[1], 500)).toBe(50);
    expect(pxToBp(slots[1], 50)).toBe(500);
  });
});

describe("two-axis coverage", () => {
  test("single cell: CN = f psi, inverse consistent", () => {
    expect(cnFromForeground(1, 1, 2)).toBe(2);
    expect(cnFromForeground(2.5, 1, 1.98)).toBeCloseTo(4.95);
    expect(foregroundFromCn(4.95, 1, 1.98)).toBeCloseTo(2.5);
  });
  test("bulk formula with purity", () => {
    // p = 0.5, psi = 3: f = 1 means ploidy-average coverage; CN = (1 * (1.5 + 1) - 1) / 0.5 = 3
    expect(cnFromForeground(1, 0.5, 3)).toBeCloseTo(3);
    expect(foregroundFromCn(cnFromForeground(1.7, 0.6, 2.4), 0.6, 2.4)).toBeCloseTo(1.7);
  });
  test("expected depth is f times mean depth", () => {
    expect(expectedDepth(2, 6.8)).toBeCloseTo(13.6);
  });
  test("axes: CN ticks and depth ticks in f, titles carry the fit, missing values say why", () => {
    const fit = unitFit({ ploidy: 2, mean_depth: 5 });
    const ax = coverageAxes(fit, 10, 3); // f up to 10: CN 20, depth 50
    expect(ax.left.map((t) => t.label)).toEqual(["0", "10", "20"]);
    expect(ax.left[2].f).toBeCloseTo(10);
    expect(ax.right[ax.right.length - 1].f).toBeLessThanOrEqual(10);
    expect(ax.leftTitle).toContain("ψ 2.00");
    const none = coverageAxes(unitFit({}), 3);
    expect(none.left).toEqual([]);
    expect(none.leftTitle).toMatch(/not available \(no ploidy/);
    expect(none.rightTitle).toMatch(/not available \(no mean depth/);
    expect(niceTicks(0)).toEqual([0]);
  });
});

describe("track data", () => {
  test("lowerBound", () => {
    expect(lowerBound(Float32Array.from([1, 3, 5]), 4)).toBe(2);
    expect(lowerBound([1, 3, 5], 0)).toBe(0);
  });
  test("coverage columns: exact when zoomed in, binned when zoomed out", () => {
    const xs = Float64Array.from({ length: 100 }, (_, i) => 1 + i * 10000); // chr1 bins every 10 kb
    const vs = Float64Array.from({ length: 100 }, (_, i) => i);
    const near = coverageColumns(xs, vs, { window: { chrom: "1", start: 1, end: 50001 }, width: 500 }, chromoBins);
    expect(near.binned).toBe(false);
    expect(near.columns.length).toBeGreaterThanOrEqual(5);
    const far = coverageColumns(xs, vs, { window: { chrom: "1", start: 1, end: 1000000 }, width: 10 }, chromoBins);
    expect(far.binned).toBe(true);
    expect(far.columns[0].n).toBe(10);
    expect(far.columns[0].min).toBe(0);
    expect(far.columns[0].max).toBe(9);
  });
  const graph = {
    intervals: [
      { iid: 1, chromosome: "1", startPoint: 1, endPoint: 1000, y: 2 },
      { iid: 2, chromosome: "1", startPoint: 1001, endPoint: 5000, y: 30 },
      { iid: 3, chromosome: "2", startPoint: 1, endPoint: 9000, y: 12 },
    ],
    connections: [
      { cid: 7, source: 2, sink: -3, type: "ALT", weight: 10 },
      { cid: 8, source: 1, sink: -2, type: "REF", weight: 2 },
    ],
  };
  test("graph in windows: segments clipped, ALT ends located (positive = end, negative = start)", () => {
    const g = graphInWindows(graph, [{ window: { chrom: "1", start: 500, end: 6000 } }]);
    expect(g.segments.map((s) => [s.start, s.end, s.cn])).toEqual([[500, 1000, 2], [1001, 5000, 30]]);
    expect(g.alts).toHaveLength(1);
    expect(g.alts[0].a).toMatchObject({ chrom: "1", pos: 5000, slot: 0 });
    expect(g.alts[0].b).toMatchObject({ chrom: "2", pos: 1, slot: -1 });
  });
  test("junction carriers match within tolerance in either order", () => {
    const j = { a: { chrom: "2", pos: 400 }, b: { chrom: "1", pos: 5100 } };
    expect(sameJunction(j, { a: { chrom: "1", pos: 5000 }, b: { chrom: "2", pos: 1 } }, 1000)).toBe(true);
    const carriers = junctionCarriers(j, ["c1", "c2"], { c1: graph, c2: { intervals: [], connections: [] } });
    expect(carriers).toEqual([{ id: "c1", cn: 10 }]);
  });
});

describe("track spec", () => {
  const cells = [
    { cell_id: "b", clone_id: "C1", ploidy: 2.1, qc_depth: 6 },
    { cell_id: "a", clone_id: "C2", ploidy: "x" },
  ];
  test("units follow the tree order and carry fit fields", () => {
    const u = unitsFromCells(cells, ["a", "b", "zz"], { C1: "#f00" });
    expect(u.list.map((x) => x.id)).toEqual(["a", "b"]);
    expect(u.list[0].ploidy).toBeNull();
    expect(u.list[1]).toMatchObject({ purity: 1, ploidy: 2.1, mean_depth: 6 });
    expect(u.groups.C1.color).toBe("#f00");
  });
  test("a built spec validates; broken ones report why", () => {
    const spec = buildSpec({ patient: "P", windows: [{ chrom: "1", start: 1, end: 100 }, { chrom: "2", start: 5, end: 500 }], units: unitsFromCells(cells) });
    expect(validateSpec(spec)).toEqual([]);
    expect(spec.loci).toEqual(["chr1:1-100", "chr2:5-500"]);
    expect(validateSpec({ ...spec, version: "2.0" })[0]).toMatch(/not readable/);
    expect(validateSpec({ ...spec, tracks: [{ id: "x", type: "nope" }] })[0]).toMatch(/unknown type/);
    expect(validateSpec({ ...spec, tracks: [{ id: "x", type: "graph", per_unit: true, url: "a.json" }] })[0]).toMatch(/needs \{unit\}/);
    expect(interimTracks().map((t) => t.type)).toEqual(["genes", "junctions", "graph", "coverage", "reads"]);
  });
  test("url templates and selection", () => {
    expect(resolveUrl("{dataPath}{unit}/complex.json", { dataPath: "https://x/data/", unit: "c1" })).toBe("https://x/data/c1/complex.json");
    expect(resolveUrl("cov/{unit}.bw", { unit: "c1", base: "https://x/views/spec.json" })).toBe("https://x/views/cov/c1.bw");
    const list = unitsFromCells(cells).list;
    expect(selectUnits(list, { clades: ["C2"] }).map((u) => u.id)).toEqual(["a"]);
    expect(selectUnits(list, null)).toHaveLength(2);
  });
});

describe("row scales", () => {
  const { autoCnMax, cnFrac, cnTicks, visibleRows } = require("./scales");
  test("cnFrac linear and log, clipped", () => {
    expect(cnFrac(5, 10)).toBe(0.5);
    expect(cnFrac(50, 10)).toBe(1);
    expect(cnFrac(-1, 10)).toBe(0);
    expect(cnFrac(10, 10, "log")).toBeCloseTo(1);
    expect(cnFrac(2, 100, "log")).toBeGreaterThan(0.2);
  });
  test("ticks and auto max", () => {
    expect(cnTicks(20)).toEqual([0, 10, 20]);
    expect(cnTicks(100, "log", 3).every((v) => v <= 100)).toBe(true);
    expect(autoCnMax([2, 3, 80, 90, 95])).toBe(100);
    expect(autoCnMax([])).toBe(4);
  });
  test("visible rows", () => {
    expect(visibleRows(100, 200, 50, 100)).toEqual([2, 6]);
    expect(visibleRows(0, 200, 50, 3, 2)).toEqual([0, 2]);
  });
});

describe("places for the genome-graph component", () => {
  const { windowToPlaces, placesToWindow } = require("./locus");
  test("round trip", () => {
    const w = { chrom: "2", start: 1000, end: 5000 };
    const d = windowToPlaces(chromoBins, w);
    expect(d).toEqual([1001001, 1005001]);
    expect(placesToWindow(chromoBins, d)).toEqual(w);
  });
});
