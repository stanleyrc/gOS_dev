/**
 * @jest-environment node
 */
import {
  activeStrips, binRange, cnLevel, cnRgb, columnBins, decodeU16, diffProfile, heatmapRowAt, heatmapRows, lodBinAt, lodLayout, medianProfile, parseHeatmapIndex, rowsOf,
  stripScales, stripValue, CN_PALETTE, NA_COLOR,
} from "./cnHeatmap";

// synthetic index: 4 cells, chr1 with 4 bins of 500 kb, chr2 with 2; LOD with 2 bins
const indexJson = {
  format: "gos-cn-heatmap-u16",
  version: 1,
  scale: 100,
  na: 65535,
  order: "tree",
  cells: ["a", "b", "c", "d"],
  chroms: [
    { chrom: "1", file: "chr1.u16", starts: [1, 500001, 1000001, 1500001], ends: [500000, 1000000, 1500000, 2000000] },
    { chrom: "2", file: "chr2.u16", starts: [1, 500001], ends: [500000, 1000000] },
  ],
  lod: { file: "genome_5mb.u16", bin_size: 5000000, bins: [{ chrom: "1", start: 1, end: 2000000 }, { chrom: "2", start: 1, end: 1000000 }] },
};
const u16 = (vals) => {
  const b = new ArrayBuffer(vals.length * 2);
  const dv = new DataView(b);
  vals.forEach((v, i) => dv.setUint16(2 * i, v, true));
  return b;
};

describe("cn_heatmap index and decode", () => {
  test("parses and normalizes", () => {
    const r = parseHeatmapIndex(indexJson);
    expect(r.ok).toBe(true);
    expect(r.index.cells).toEqual(["a", "b", "c", "d"]);
    expect(r.index.chroms.get("1").starts.length).toBe(4);
    expect(r.index.lod.bins).toHaveLength(2);
    expect(rowsOf(r.index, ["d", "zz", "a"])).toEqual([3, 0]);
  });
  test("rejects malformed indexes with a reason", () => {
    expect(parseHeatmapIndex(null).ok).toBe(false);
    expect(parseHeatmapIndex({ ...indexJson, format: "x" }).error).toMatch(/unknown format/);
    expect(parseHeatmapIndex({ ...indexJson, version: 2 }).error).toMatch(/unsupported version/);
    expect(parseHeatmapIndex({ ...indexJson, chroms: [{ chrom: "1", file: "f", starts: [1], ends: [] }] }).error).toMatch(/malformed/);
  });
  test("decodes uint16 CN x 100 with 65535 as NA", () => {
    const m = decodeU16(u16([200, 300, 65535, 0, 150, 65535]), 2, 3);
    expect(Array.from(m.slice(0, 2))).toEqual([2, 3]);
    expect(Number.isNaN(m[2])).toBe(true);
    expect(m[4]).toBeCloseTo(1.5);
    expect(() => decodeU16(u16([1, 2, 3]), 2, 3)).toThrow(/expected 2 x 3/);
  });
});

describe("bins and columns", () => {
  const { index } = parseHeatmapIndex(indexJson);
  const chr1 = index.chroms.get("1");
  test("bin range of a window", () => {
    expect(binRange(chr1, { chrom: "1", start: 600000, end: 1200000 })).toEqual([1, 3]);
    expect(binRange(chr1, { chrom: "1", start: 1, end: 2000000 })).toEqual([0, 4]);
    expect(binRange(chr1, { chrom: "1", start: 3000000, end: 4000000 })).toEqual([4, 4]);
  });
  test("pixel columns sample the bin under each column", () => {
    const cols = columnBins(chr1, { chrom: "1", start: 1, end: 2000000 }, 8);
    expect(Array.from(cols)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    const zoomed = columnBins(chr1, { chrom: "1", start: 400001, end: 600000 }, 4);
    expect(Array.from(zoomed)).toEqual([0, 0, 1, 1]);
  });
  test("LOD genome layout splits the width by chromosome length", () => {
    const L = lodLayout(index.lod, 300);
    expect(L.map((c) => c.chrom)).toEqual(["1", "2"]);
    expect(L[0].x1).toBeCloseTo(200);
    expect(L[1].firstBin).toBe(1);
  });
});

describe("clade median and cn_diff", () => {
  // 4 cells x 3 bins
  const mat = Float32Array.from([2, 2, 4, 2, 3, NaN, 3, 3, 4, 3, 3, 4]);
  test("median, IQR and n per bin ignore NA", () => {
    const p = medianProfile(mat, 3, [0, 1, 2, 3]);
    expect(Array.from(p.median)).toEqual([2.5, 3, 4]);
    expect(p.n[2]).toBe(3);
    expect(p.q1[0]).toBeCloseTo(2);
    expect(p.q3[0]).toBeCloseTo(3);
    const sub = medianProfile(mat, 3, [0], [1, 2]);
    expect(Number.isNaN(sub.median[0])).toBe(true);
    expect(sub.median[1]).toBe(2);
  });
  test("diff = median(A) - median(B)", () => {
    const d = diffProfile(mat, 3, [2, 3], [0, 1]);
    expect(Array.from(d.diff)).toEqual([1, 0.5, 0]);
    expect(d.nA).toBe(2);
    const empty = diffProfile(mat, 3, [], [0]);
    expect(Number.isNaN(empty.diff[0])).toBe(true);
  });
});

describe("colors and strips", () => {
  test("CN levels are relative to the neutral CN and clipped at 0 and 8", () => {
    expect(cnLevel(2)).toBe(2);
    expect(cnLevel(3, 3)).toBe(2);
    expect(cnLevel(0, 3)).toBe(0);
    expect(cnLevel(40)).toBe(CN_PALETTE.length - 1);
    expect(cnLevel(NaN)).toBe(-1);
    expect(cnRgb(NaN)).toEqual([0xcf, 0xcf, 0xcf]);
  });
  const units = [
    { id: "a", group: "c1", plate: "T0_A", time_point: "T0", s_phase: "TRUE", qc_mapd: 0.2, depth: 2e5, ecdna_call: "none" },
    { id: "b", group: "c2", plate: "T1_A", time_point: "T1", s_phase: "FALSE", qc_mapd: 0.5, depth: 5e4, ecdna_call: "amp1" },
    { id: "c", group: "c2", plate: "T1_A", time_point: "NA", s_phase: "NA", qc_mapd: null, depth: null, ecdna_call: null },
  ];
  test("strip values (NA -> null; S-phase and ecDNA caller collapse to classes)", () => {
    expect(stripValue(units[0], "s_phase")).toBe("S");
    expect(stripValue(units[1], "s_phase")).toBe("non-S");
    expect(stripValue(units[2], "s_phase")).toBeNull();
    expect(stripValue(units[1], "ecdna_call")).toBe("called");
    expect(stripValue(units[2], "time_point")).toBeNull();
    expect(stripValue(units[0], "clade")).toBe("c1");
  });
  test("active strips and scales", () => {
    expect(activeStrips(units).map((s) => s.key)).toEqual(["clade", "plate", "time_point", "s_phase", "qc_mapd", "depth", "ecdna_call"]);
    expect(activeStrips([{ id: "x", group: "c1" }]).map((s) => s.key)).toEqual(["clade"]);
    const sc = stripScales(units, (g) => (g === "c1" ? "#111111" : "#222222"));
    expect(sc.get("clade").color("c1")).toBe("#111111");
    expect(sc.get("s_phase").color("S")).toBe("#d62728");
    expect(sc.get("time_point").legend.map((l) => l[0])).toEqual(["T0", "T1"]);
    expect(sc.get("depth").color(null)).toBe(NA_COLOR);
    expect(sc.get("qc_mapd").color(0.2)).not.toBe(sc.get("qc_mapd").color(0.5));
  });
});

describe("heat-map row layout", () => {
  const units = [{ id: "a", group: "c1" }, { id: "b", group: "c1" }, { id: "c", group: "c2" }];
  test("cells mode: rowPx each, compressed beyond maxH", () => {
    const r = heatmapRows(units, "cells", {}, 4);
    expect(r.rows.map((x) => [x.id, x.y, x.h])).toEqual([["a", 0, 4], ["b", 4, 4], ["c", 8, 4]]);
    expect(r.height).toBe(12);
    const many = Array.from({ length: 2280 }, (_, i) => ({ id: `x${i}`, group: "j1" }));
    const m = heatmapRows(many, "cells", {}, 3, { maxH: 480 });
    expect(m.height).toBe(480);
    expect(m.rows[2279].y).toBeCloseTo(480 - 480 / 2280);
    expect(heatmapRowAt(m.rows, 479.9)).toBe(2279);
    expect(heatmapRowAt(m.rows, 500)).toBe(-1);
  });
  test("clades mode: one band per clade, expanded clades list their cells", () => {
    const r = heatmapRows(units, "pseudobulk", { c2: true }, 5, { bandPx: 16 });
    expect(r.rows.map((x) => `${x.kind}:${x.group}:${x.id ?? ""}:${x.y}`)).toEqual(["band:c1::0", "band:c2::16", "cell:c2:c:32"]);
    expect(r.rows[0].members).toEqual(["a", "b"]);
    expect(r.height).toBe(37);
    expect(heatmapRowAt(r.rows, 20)).toBe(1);
  });
  test("LOD column lookup", () => {
    const L = lodLayout({ bins: [{ chrom: "1", start: 1, end: 100 }, { chrom: "1", start: 101, end: 200 }, { chrom: "2", start: 1, end: 200 }] }, 400);
    expect(lodBinAt(L, 10)).toBe(0);
    expect(lodBinAt(L, 150)).toBe(1);
    expect(lodBinAt(L, 399)).toBe(2);
    expect(lodBinAt(L, 401)).toBe(-1);
  });
});
