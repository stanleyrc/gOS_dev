// Synthetic fixtures only (no patient data).
import { axisIndexOf, axisLabel, cnAxis, cnCorrelation1d, cnCorrelation2d, cnMatrix, cnMetaFrom, correlationTrianglePixels, divergingRgb, heatmapPixels } from "./cnTracks";
import { atacInWindows, parseWalks, validateAtac, walkCopies, walkGeometry, walksInWindows } from "./walkTracks";
import { JAWA_TYPES, defaultJawaState, jawaStateFromTracks, jawaTracks } from "./jawaSpec";
import { columnAxis } from "./hic";
import { buildSpec, validateSpec } from "./trackSpec";

// 4 cells x 2 chromosomes of 10 bins (100 kb): chr1 bins 0-9, chr2 bins 10-19
const json = {
  cells: ["c1", "c2", "c3", "c4"],
  levels: { "100kb": { bin_size: 100000, n_bins: 20, missing_value: 65535, chromosomes: [{ chr: "1", first_bin: 0, n_bins: 10 }, { chr: "2", first_bin: 10, n_bins: 10 }] } },
};
const meta = cnMetaFrom(json);
// chr1 bins 2-4 and chr2 bins 5-6 co-vary (one molecule): CN 2, 6, 10, 20 across cells; everything else 2;
// chr1 bin 8 anti-varies; chr2 bin 9 missing in c4
const values = new Uint16Array(4 * 20).fill(2);
const amp = [2, 6, 10, 20];
for (let c = 0; c < 4; c += 1) {
  [2, 3, 4, 15, 16].forEach((b) => { values[c * 20 + b] = amp[c]; });
  values[c * 20 + 8] = [20, 10, 6, 2][c];
}
values[3 * 20 + 19] = 65535;
const windows = [{ chrom: "1", start: 1, end: 1000000 }, { chrom: "2", start: 1, end: 1000000 }];

describe("cnTracks", () => {
  it("reads the binned CN metadata", () => {
    expect(meta.binSize).toBe(100000);
    expect(meta.chroms.get("2")).toEqual({ first: 10, n: 10 });
    expect(cnMetaFrom({})).toBeNull();
  });

  it("lays out axis bins over the windows and merges bins above maxBins", () => {
    const ax = cnAxis(meta, windows, 600);
    expect(ax.n).toBe(20);
    expect(ax.wins[1].axis0).toBe(10);
    expect(axisIndexOf(ax, "chr2", 550001)).toBe(15);
    expect(axisLabel(ax, 15)).toBe("chr2:0.50-0.60 Mb");
    const ax2 = cnAxis(meta, windows, 10);
    expect(ax2.factor).toBeGreaterThan(1);
    expect(ax2.n).toBeLessThanOrEqual(12);
  });

  it("builds the cells x bins matrix with NaN for missing bins and unknown cells", () => {
    const ax = cnAxis(meta, windows);
    const m = cnMatrix(values, meta, ax, ["c4", "c1", "nope"]);
    expect(m[0 * 20 + 2]).toBe(20);
    expect(m[1 * 20 + 2]).toBe(2);
    expect(Number.isNaN(m[0 * 20 + 19])).toBe(true);
    expect(Number.isNaN(m[2 * 20 + 0])).toBe(true);
  });

  it("correlates co-varying bins across cells (2D) and against an anchor (1D)", () => {
    const ax = cnAxis(meta, windows);
    const rows = ["c1", "c2", "c3", "c4"];
    const m = cnMatrix(values, meta, ax, rows);
    const c2 = cnCorrelation2d(m, 4, ax.n, { minRows: 3 });
    expect(c2.values[2 * 20 + 15]).toBeCloseTo(1, 5); // chr1 amplicon bin vs chr2 amplicon bin
    expect(c2.values[2 * 20 + 8]).toBeLessThan(-0.8); // anti-varying bin
    expect(Number.isNaN(c2.values[0 * 20 + 2])).toBe(true); // constant bin: no variance
    const c1 = cnCorrelation1d(m, 4, ax.n, [16], { minRows: 3 });
    expect(c1[3]).toBeCloseTo(1, 5);
    expect(Number.isNaN(c1[0])).toBe(true);
    expect(cnCorrelation1d(m, 4, ax.n, [])[3]).toBeNaN();
    // a near-constant bin (one cell off by one copy among many) is masked, not drawn as r ~ 1
    const rows9 = 40;
    const flat = new Float32Array(rows9 * 2).fill(2);
    flat[0] = 3;
    flat[1] = 3;
    expect(cnCorrelation2d(flat, rows9, 2).values[1]).toBeNaN();
    expect(cnCorrelation2d(flat, rows9, 2, { minSd: 0 }).values[1]).toBeCloseTo(1, 5);
  });

  it("draws heat map and triangle pixels aligned to the columns", () => {
    const ax = cnAxis(meta, windows);
    const slots = [{ window: windows[0], x0: 0, width: 10 }, { window: windows[1], x0: 12, width: 10 }];
    const cols = columnAxis(slots, ax.wins, 22);
    expect(cols[10]).toBe(-1); // gap between windows
    expect(cols[12]).toBe(10);
    const m = cnMatrix(values, meta, ax, ["c4"]);
    const px = heatmapPixels(m, 1, ax.n, cols, 22, 1);
    expect(px[4 * 2 + 3]).toBe(255);
    expect(px[4 * 10 + 3]).toBe(0);
    const tri = correlationTrianglePixels({ n: 20, values: new Float32Array(400).fill(1) }, cols, 22, 4);
    expect(tri.length).toBe(22 * 4 * 4);
    expect(divergingRgb(1)[0]).toBeGreaterThan(divergingRgb(1)[2]);
    expect(divergingRgb(-1)[2]).toBeGreaterThan(divergingRgb(-1)[0]);
  });
});

const walkDoc = {
  format: "gos-sc-walks/1",
  walks: [
    { id: "w1", label: "AMP circle", circular: "True", ncells: 3, nodes: [{ chromosome: "1", start: 200001, end: 500000, strand: "+" }, { chromosome: "2", start: 500001, end: 700000, strand: "-" }], cells: { c1: 2, c2: 6, c3: 10 } },
    { id: "w2", label: "elsewhere", circular: false, ncells: 9, nodes: [{ chromosome: "5", start: 1, end: 100 }] },
    { id: "w3", label: "linear", circular: "False", ncells: 1, nodes: [{ chromosome: "1", start: 100001, end: 150000, strand: "+" }] },
  ],
};

describe("walkTracks", () => {
  it("parses walks and keeps those touching the windows, most cells first", () => {
    const w = parseWalks(walkDoc);
    expect(w).toHaveLength(3);
    expect(w[0].circular).toBe(true);
    expect(w[2].circular).toBe(false);
    const shown = walksInWindows(w, windows);
    expect(shown.map((x) => x.id)).toEqual(["w1", "w3"]);
    expect(walksInWindows(w, windows, { minCells: 2 }).map((x) => x.id)).toEqual(["w1"]);
  });

  it("gives bars, links (with the closing link of a circle) and per-row copies", () => {
    const [w] = parseWalks(walkDoc);
    const xOf = (c, p) => (c === "1" ? p / 100000 : c === "2" ? 12 + p / 100000 : null);
    const g = walkGeometry(w, xOf);
    expect(g.bars).toHaveLength(2);
    expect(g.links).toHaveLength(2);
    expect(g.links[1].closing).toBe(true);
    expect(g.links[0].xa).toBeCloseTo(5); // end of the + node
    expect(g.links[0].xb).toBeCloseTo(19); // start of the - node in walk orientation = its end
    const cp = walkCopies(w, ["c3", "c9"]);
    expect(cp[0]).toBe(10);
    expect(Number.isNaN(cp[1])).toBe(true);
  });

  it("reads gos-atac-bins/1 (synthetic) with per-copy normalization and peaks", () => {
    const doc = { format: "gos-atac-bins/1", bin_size: 100000, chroms: [{ name: "1", n_bins: 10 }], signal: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], cn: [2, 2, 4, 0, 2, 2, 2, 2, 2, 2], peaks: [["chr1", 250000, 260000]] };
    expect(validateAtac(doc)).toEqual([]);
    expect(validateAtac({ ...doc, signal: [1] }).length).toBeGreaterThan(0);
    const slots = [{ window: { chrom: "1", start: 1, end: 1000000 }, x0: 0, width: 100 }];
    const a = atacInWindows(doc, slots);
    expect(a.bars).toHaveLength(10);
    expect(a.max).toBe(10);
    expect(a.peaks).toHaveLength(1);
    const pc = atacInWindows(doc, slots, { perCopy: true });
    expect(pc.bars).toHaveLength(9); // CN 0 bin skipped
    expect(pc.bars[2].v).toBeCloseTo(0.75);
  });
});

describe("jawaSpec", () => {
  it("round-trips the sections through spec v0.6 tracks", () => {
    const s = defaultJawaState();
    JAWA_TYPES.forEach((t) => { s.on[t] = true; });
    s.anchor = "chr12:69200000";
    s.walkLayer = "peel";
    const tracks = jawaTracks(s);
    expect(tracks.map((t) => t.type)).toEqual(JAWA_TYPES);
    const back = jawaStateFromTracks(tracks);
    expect(back.on).toEqual(s.on);
    expect(back.anchor).toBe("chr12:69200000");
    expect(back.walkLayer).toBe("peel");
    const spec = buildSpec({ patient: "P", windows: [{ chrom: "12", start: 1, end: 100 }], units: { kind: "cell", list: [{ id: "U1" }] }, tracks });
    expect(spec.version).toBe("0.6");
    expect(validateSpec(spec)).toEqual([]);
  });
});
