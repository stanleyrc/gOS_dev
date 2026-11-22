import {
  CHUNK_BINS, axisLength, axisLocus, axisOfPos, buildMatrix, chunkRanges, chunksFor, colorPos, columnAxis, decodeChunk,
  heatRgb, hicStateFromTrack, hicTrack, junctionMarks, pairAt, pickResolution, pixelRange, renderPixels, robustMax,
  trianglePair, triangleXY, validateHicIndex, windowBins,
} from "./hic";
import { layoutWindows } from "./locus";
import { buildSpec, validateSpec } from "./trackSpec";
import { defaultHicUnits } from "./hic";

// Synthetic export: chr1 (10 bins of 100 bp) + chr2 (5 bins), one resolution. Pixels upper triangle, sorted.
const RES = 100;
const CHROMS = [
  { name: "1", length: 1000, bin_offset: 0, nbins: 10 },
  { name: "2", length: 500, bin_offset: 10, nbins: 5 },
];
const NB = 15;
const PIX = [
  [0, 0, 50], [0, 1, 20], [1, 1, 40], [2, 3, 7], [3, 12, 9], // (3, 12): chr1 bin 3 <-> chr2 bin 2, a trans "junction"
  [5, 5, 30], [5, 6, 10], [10, 10, 25], [10, 11, 5], [12, 12, 33],
];
function synthBuffer() {
  const off = new Uint32Array(NB + 1);
  PIX.forEach(([b1]) => { off[b1 + 1] += 1; });
  for (let i = 1; i <= NB; i += 1) off[i] += off[i - 1];
  const w = new Float32Array(NB).map((_, i) => (i === 7 ? NaN : 1 + i / 10));
  const px = new ArrayBuffer(8 * PIX.length);
  const dv = new DataView(px);
  PIX.forEach(([, b2, c], i) => {
    dv.setUint32(8 * i, b2, true);
    dv.setFloat32(8 * i + 4, c, true);
  });
  const buf = new Uint8Array(4 * (NB + 1) + 4 * NB + px.byteLength);
  buf.set(new Uint8Array(off.buffer), 0);
  buf.set(new Uint8Array(w.buffer), 4 * (NB + 1));
  buf.set(new Uint8Array(px), 4 * (NB + 1) + 4 * NB);
  return buf.buffer;
}
const RESENTRY = {
  res: RES, file: "r100.bin", nbins: NB, nnz: PIX.length, chroms: CHROMS,
  sections: { offsets: { byte: 0, n: NB + 1 }, weights: { byte: 4 * (NB + 1), n: NB }, pixels: { byte: 4 * (NB + 1) + 4 * NB, n: PIX.length, stride: 8 } },
};
const INDEX = { format: "gos-hic-tiles/1", unit: "U", resolutions: [RESENTRY, { ...RESENTRY, res: 500, file: "r500.bin", nbins: 3, chroms: [{ name: "1", length: 1000, bin_offset: 0, nbins: 2 }, { name: "2", length: 500, bin_offset: 2, nbins: 1 }] }] };

// fetch emulation: inclusive byte ranges on the buffer
const slice = (buf, [a, b]) => buf.slice(a, b + 1);
function loadChunks(buf, resEntry, wb) {
  const m = new Map();
  chunksFor(wb, resEntry.nbins).forEach((c) => {
    const r = chunkRanges(resEntry, c);
    const offs = new Uint32Array(slice(buf, r.offsets));
    const pr = pixelRange(resEntry, offs[0], offs[offs.length - 1]);
    m.set(c, decodeChunk(r.r0, r.r1, slice(buf, r.offsets), slice(buf, r.weights), pr ? slice(buf, pr) : null));
  });
  return m;
}

describe("hic helpers", () => {
  const buf = synthBuffer();
  const windows = [{ chrom: "1", start: 1, end: 600 }, { chrom: "2", start: 101, end: 400 }];

  it("validates the index", () => {
    expect(validateHicIndex(INDEX)).toEqual([]);
    expect(validateHicIndex({ format: "x" })).toHaveLength(2);
  });

  it("concatenates window bins", () => {
    const wb = windowBins(RESENTRY, windows);
    expect(wb.map((w) => [w.b0, w.b1, w.n, w.axis0])).toEqual([[0, 5, 6, 0], [11, 13, 3, 6]]);
    expect(axisLength(wb)).toBe(9);
    expect(windowBins(RESENTRY, [{ chrom: "7", start: 1, end: 100 }])[0].n).toBe(0);
    expect(axisLocus(wb, 7)).toEqual({ k: 1, chrom: "2", start: 201, end: 300 });
    expect(axisOfPos(wb, "chr2", 250)).toBe(7);
    expect(axisOfPos(wb, "2", 450)).toBe(-1);
  });

  it("picks the finest resolution that fits, honors a fitting override", () => {
    expect(pickResolution(INDEX, windows, 100).res).toBe(100);
    expect(pickResolution(INDEX, windows, 4).res).toBe(100); // the target never drops below 16 bins
    const wide = [{ chrom: "1", start: 1, end: 1000 }, { chrom: "1", start: 1, end: 1000 }];
    expect(pickResolution(INDEX, wide, 16).res).toBe(500);
    expect(pickResolution(INDEX, windows, 100, 500).res).toBe(500);
  });

  it("builds the symmetric matrix with cis blocks on the diagonal and the trans pixel off it", () => {
    const wb = windowBins(RESENTRY, windows);
    const chunks = loadChunks(buf, RESENTRY, wb);
    expect(chunks.size).toBe(Math.ceil(NB / CHUNK_BINS));
    const m = buildMatrix(wb, chunks, "raw");
    const at = (i, j) => m.values[i * m.n + j];
    expect(m.n).toBe(9);
    expect(at(0, 0)).toBe(50);
    expect(at(1, 0)).toBe(20);
    expect(at(5, 5)).toBe(30);
    // chr1 bin 3 (axis 3) <-> chr2 bin 2 (axis 6 + 1 = 7)
    expect(at(3, 7)).toBe(9);
    expect(at(7, 3)).toBe(9);
    expect(at(7, 7)).toBe(33);
    // chr2 bin 0 is outside the second window
    expect(m.values.some((v) => v === 25)).toBe(false);
    const bal = buildMatrix(wb, chunks, "balanced");
    expect(bal.values[3 * 9 + 7]).toBeCloseTo(9 * 1.3 * 2.2, 4);
    expect(robustMax(m, 1)).toBe(20);
  });

  it("maps screen columns to the axis and renders the triangle and square", () => {
    const slots = layoutWindows(windows, 90, 10); // two 40 px windows, 10 px gap
    const wb = windowBins(RESENTRY, windows);
    const cols = columnAxis(slots, wb, 90);
    expect(cols[0]).toBe(0);
    expect(cols[39]).toBe(5);
    expect(cols[45]).toBe(-1); // gap
    expect(cols[50]).toBe(6);
    expect(cols[89]).toBe(8);
    const m = buildMatrix(wb, loadChunks(buf, RESENTRY, wb), "raw");
    const px = renderPixels(m, cols, 90, 45, { mode: "triangle", max: 50 });
    // top row (diagonal) at x = 1 is bin (0, 0): the darkest red
    expect(Array.from(px.slice(4, 8))).toEqual([...heatRgb(1), 255]);
    // a pixel whose pair falls in the gap stays transparent
    const [x, y] = triangleXY(45, 45);
    expect(px[4 * (y * 90 + x) + 3]).toBe(0);
    const sq = renderPixels(m, cols, 90, 90, { mode: "square", max: 50 });
    expect(sq[4 * (0 * 90 + 0) + 3]).toBe(255);
    expect(pairAt(cols, 20, 0)).toEqual({ a: 3, b: 3 });
    const [xa, xb] = trianglePair(40, 10);
    expect([xa, xb]).toEqual([30, 50]);
  });

  it("colors on a log scale and places junction marks", () => {
    expect(colorPos(0, 10)).toBe(0);
    expect(colorPos(10, 10)).toBe(1);
    expect(colorPos(100, 10)).toBe(1);
    expect(colorPos(NaN, 10)).toBeNaN();
    expect(colorPos(5, 10, false)).toBe(0.5);
    const slots = layoutWindows(windows, 90, 10);
    const wb = windowBins(RESENTRY, windows);
    const m = buildMatrix(wb, loadChunks(buf, RESENTRY, wb), "raw");
    const marks = junctionMarks([{ a: { chrom: "1", pos: 350 }, b: { chrom: "2", pos: 250 } }, { a: { chrom: "1", pos: 350 }, b: { chrom: "5", pos: 1 } }], slots, wb, m);
    expect(marks).toHaveLength(1);
    expect(marks[0].value).toBe(9);
    expect(marks[0].xa).toBeLessThan(marks[0].xb);
  });

  it("round-trips the spec track", () => {
    const st = { units: ["A", "B"], mode: "square", resolution: 5000, normalization: "balanced", log: true, quantile: 0.98, max: null, shareMax: true, junctions: false, overlays: { graph: { on: false }, eaglec: { on: true, minProb: 0.7, show: "dropped" } }, height: 300, visible: true };
    const t = hicTrack(st);
    expect(t.overlays.map((o) => o.type)).toEqual(["graph-junctions", "eaglec"]);
    expect(t.overlays[1]).toMatchObject({ on: true, min_prob: 0.7, show: "dropped", url: "{dataPath}{unit}/hic/eaglec.json" });
    expect(t.type).toBe("hic");
    expect(t.color.max).toBe("p98");
    expect(hicStateFromTrack(t)).toEqual(st);
    expect(hicStateFromTrack({}).mode).toBe("triangle");
    expect(hicStateFromTrack(hicTrack({ ...st, max: 12 })).max).toBe(12);
  });

  it("a spec with a hic track validates and round-trips through JSON", () => {
    const st = hicStateFromTrack({});
    const units = { kind: "cell", list: [{ id: "U1" }, { id: "U2" }] };
    const spec = buildSpec({ patient: "GBM39", windows, units, tracks: [hicTrack({ ...st, units: ["U1"] })] });
    expect(spec.version).toBe("0.6");
    expect(validateSpec(spec)).toEqual([]);
    const back = JSON.parse(JSON.stringify(spec));
    expect(back.loci).toEqual(spec.loci);
    expect(hicStateFromTrack(back.tracks[0])).toEqual({ ...st, units: ["U1"] });
  });

  it("defaults to the large clusters", () => {
    expect(defaultHicUnits([{ id: "a", nCells: 5 }, { id: "b", nCells: 593 }, { id: "c", nCells: 2438 }])).toEqual(["b", "c"]);
    expect(defaultHicUnits([{ id: "a", nCells: 5 }])).toEqual(["a"]);
  });
});
