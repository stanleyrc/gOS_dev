import {
  eaglecCounts, eaglecHoverLines, eaglecMarks, filterCalls, laneArcs, markColor, markPoints, markRadius, nearestMark, overlaysFromSpec,
  overlaysToSpec, parseEaglec, validateEaglec,
} from "./eaglec";
import { hicStateFromTrack, hicTrack, colorMaxes, sharedLabel } from "./hic";
import { buildSpec, validateSpec } from "./trackSpec";

// synthetic gos-eaglec/1 file (not real data)
const FILE = {
  format: "gos-eaglec/1",
  unit: "U1",
  calls: [
    { id: 1, chr1: "7", pos1: 1500, chr2: "7", pos2: 3500, strand: "+-", prob: 0.99, res: 1000, in_graph: true, edge_id: 12, dist_bp: 400 },
    { id: 2, chr1: "chr7", pos1: 2500, chr2: "9", pos2: 500, strand: "-+", prob: 0.6, res: 5000, in_graph: false, edge_id: null, dist_bp: null },
    { id: 3, chr1: "7", pos1: 100, chr2: "7", pos2: 200, strand: "++", prob: 0.3, res: 1000, in_graph: false },
    { id: 4, chr1: "7", pos1: "x", chr2: "7", pos2: 200 },
  ],
};
const slots = [
  { window: { chrom: "7", start: 1, end: 4000 }, x0: 0, width: 400 },
  { window: { chrom: "9", start: 1, end: 1000 }, x0: 410, width: 100 },
];
const RES = { res: 1000, chroms: [{ name: "7", nbins: 4, bin_offset: 0 }, { name: "9", nbins: 1, bin_offset: 4 }] };

describe("EagleC overlay helpers", () => {
  it("validates and parses calls", () => {
    expect(validateEaglec(FILE)).toEqual([]);
    expect(validateEaglec({ format: "x" })).toHaveLength(2);
    const calls = parseEaglec(FILE);
    expect(calls).toHaveLength(3);
    expect(calls[1].chr1).toBe("7");
    expect(calls[0].edgeId).toBe("12");
    expect(calls[1].inGraph).toBe(false);
  });

  it("filters by probability and kept / dropped", () => {
    const calls = parseEaglec(FILE);
    expect(filterCalls(calls, { minProb: 0.5 }).map((c) => c.id)).toEqual([1, 2]);
    expect(filterCalls(calls, { minProb: 0, show: "kept" }).map((c) => c.id)).toEqual([1]);
    expect(filterCalls(calls, { minProb: 0.5, show: "dropped" }).map((c) => c.id)).toEqual([2]);
    expect(eaglecCounts(calls, { minProb: 0.5, show: "all" })).toEqual({ total: 3, shown: 2, kept: 1, dropped: 1 });
  });

  it("places marks with both ends in the windows (triangle and square) and finds the nearest", () => {
    const calls = parseEaglec(FILE);
    const wb = [{ k: 0, chrom: "7", b0: 0, b1: 3, n: 4, axis0: 0, start: 1, end: 4000, binStart: 1, res: 1000 }, { k: 1, chrom: "9", b0: 4, b1: 4, n: 1, axis0: 4, start: 1, end: 1000, binStart: 1, res: 1000 }];
    const marks = eaglecMarks(calls, slots, wb);
    expect(marks).toHaveLength(3);
    const m2 = marks.find((m) => m.call.id === 2);
    expect(m2.xa).toBeLessThan(m2.xb);
    expect(m2.ib).toBe(4);
    const [[x, y]] = markPoints(marks[0], "triangle");
    expect(x).toBeCloseTo((marks[0].xa + marks[0].xb) / 2);
    expect(markPoints(marks[0], "square", 0.5)).toHaveLength(2);
    const hit = nearestMark(marks.map((m) => ({ ...m, r: 5 })), x + 2, y, "triangle");
    expect(hit.call.id).toBe(marks[0].call.id);
    expect(nearestMark(marks, x + 50, y + 50)).toBeNull();
    expect(RES.res).toBe(1000);
  });

  it("sizes and colors by probability and describes hover", () => {
    expect(markRadius(0.5)).toBe(3);
    expect(markRadius(1)).toBe(7);
    expect(markColor(1)).not.toBe(markColor(0.5));
    const lines = eaglecHoverLines(parseEaglec(FILE)[0]);
    expect(lines.join(" ")).toMatch(/prob 0\.990/);
    expect(lines.join(" ")).toMatch(/kept: in graph \(edge 12/);
    expect(eaglecHoverLines(parseEaglec(FILE)[1]).join(" ")).toMatch(/dropped/);
  });

  it("lane arcs keep one-sided calls", () => {
    const arcs = laneArcs([{ a: { chrom: "7", pos: 100 }, b: { chrom: "12", pos: 5 } }], parseEaglec(FILE), slots);
    expect(arcs.find((a) => a.kind === "graph").x2).toBeNull();
    expect(arcs.filter((a) => a.kind === "eaglec")).toHaveLength(3);
  });

  it("round-trips overlays through spec v0.5 and reads v0.4 tracks", () => {
    const o = { graph: { on: false }, eaglec: { on: true, minProb: 0.8, show: "kept" } };
    expect(overlaysFromSpec({ overlays: overlaysToSpec(o) })).toEqual(o);
    expect(overlaysFromSpec({ junctions: { overlay: false } })).toEqual({ graph: { on: false }, eaglec: { on: true, minProb: 0.5, show: "all" } });
    const st = { ...hicStateFromTrack({}), units: ["U1"], overlays: o, junctions: false, shareMax: "per_sample" };
    const spec = buildSpec({ patient: "P", windows: [{ chrom: "7", start: 1, end: 4000 }], units: { kind: "cell", list: [{ id: "U1" }] }, tracks: [hicTrack(st)] });
    expect(validateSpec(spec)).toEqual([]);
    const back = hicStateFromTrack(JSON.parse(JSON.stringify(spec)).tracks[0]);
    expect(back).toEqual(st);
    expect(back.shareMax).toBe("per_sample");
    // a v0.4 hic track (no overlays, shared boolean) still loads
    const v4 = hicStateFromTrack({ type: "hic", junctions: { overlay: true }, color: { shared: true } });
    expect(v4.overlays.graph.on).toBe(true);
    expect(v4.shareMax).toBe(true);
  });

  it("computes color maxes per mode", () => {
    const auto = { a: 10, b: 30, c: 5 };
    const g = (id) => (id === "c" ? "S2" : "S1");
    expect(colorMaxes(["a", "b", "c"], auto, false, g)).toEqual({ a: 10, b: 30, c: 5 });
    expect(colorMaxes(["a", "b", "c"], auto, true, g)).toEqual({ a: 30, b: 30, c: 30 });
    expect(colorMaxes(["a", "b", "c"], auto, "per_sample", g)).toEqual({ a: 30, b: 30, c: 5 });
    expect(sharedLabel("per_sample")).toMatch(/per sample/);
  });
});
