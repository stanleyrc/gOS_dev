// Zoomable CN heatmap over a figure panel: the per-cell 100 kb copy-number bins of the gOS export
// (<patient>/cn_binned.json levels["100kb"] + cn_binned_100kb.cn.u16, cell-major uint16, 65535 = missing),
// drawn in the panel's exact rectangle for the panel's rows (cells top to bottom). d3-free.

/** cn_binned.json -> { cells, index: Map(cell -> row), binSize, nBins, missing, chroms: Map(chr -> { first, n }) } | null */
export function parseCnBinnedMeta(json) {
  const lv = json?.levels?.["100kb"];
  if (!lv || !Array.isArray(json.cells)) return null;
  const chroms = new Map((lv.chromosomes || []).map((c) => [`${c.chr}`.replace(/^chr/, ""), { first: Number(c.first_bin), n: Number(c.n_bins) }]));
  return {
    cells: json.cells.map(String),
    index: new Map(json.cells.map((c, i) => [`${c}`, i])),
    binSize: Number(lv.bin_size) || 100000,
    nBins: Number(lv.n_bins),
    missing: lv.missing_value == null ? 65535 : Number(lv.missing_value),
    file: lv.files?.cn || "cn_binned_100kb.cn.u16",
    chroms,
  };
}

/** Global bin range [b0, b1) of a genomic window on one chromosome (clamped to the chromosome), or null. */
export function windowBins(meta, chr, from, to) {
  const c = meta?.chroms.get(`${chr}`.replace(/^chr/, ""));
  if (!c) return null;
  const k0 = Math.max(0, Math.floor((Math.min(from, to) - 1) / meta.binSize));
  const k1 = Math.min(c.n, Math.ceil(Math.max(from, to) / meta.binSize));
  if (!(k1 > k0)) return null;
  return { b0: c.first + k0, b1: c.first + k1 };
}

/** Chromosome extent in bp [1, n * binSize]. */
export function chromLimits(meta, chr) {
  const c = meta?.chroms.get(`${chr}`.replace(/^chr/, ""));
  return c ? [1, c.n * meta.binSize] : null;
}

/** Zoom a window by `factor` (< 1 zooms in) about a point at fraction `at` of the window; clamped to limits and a minimum span. */
export function zoomWindow(win, factor, at, limits, minSpan = 200000) {
  const span = win.to - win.from;
  const ns = Math.min(limits[1] - limits[0], Math.max(minSpan, span * factor));
  const anchor = win.from + at * span;
  let from = anchor - at * ns;
  from = Math.max(limits[0], Math.min(limits[1] - ns, from));
  return { from: Math.round(from), to: Math.round(from + ns) };
}

/** Pan a window by a fraction of its span (positive = right), clamped to limits. */
export function panWindow(win, frac, limits) {
  const span = win.to - win.from;
  const from = Math.max(limits[0], Math.min(limits[1] - span, win.from + frac * span));
  return { from: Math.round(from), to: Math.round(from + span) };
}

/**
 * RGBA pixels (width x rows.length) of the window: each pixel column takes the bin under its centre, each row the
 * cell of that row (unknown cells and missing bins transparent). values: cell-major Uint16Array (nCells x nBins);
 * colorOf(cn) -> [r, g, b].
 */
export function cnPixels(values, meta, rows, win, chr, width, colorOf) {
  const out = new Uint8ClampedArray(width * rows.length * 4);
  const c = meta.chroms.get(`${chr}`.replace(/^chr/, ""));
  if (!c) return out;
  const binOfX = new Int32Array(width);
  for (let x = 0; x < width; x += 1) {
    const pos = win.from + ((x + 0.5) / width) * (win.to - win.from);
    const k = Math.floor((pos - 1) / meta.binSize);
    binOfX[x] = k >= 0 && k < c.n ? c.first + k : -1;
  }
  const cache = new Map();
  const rgb = (v) => {
    if (!cache.has(v)) cache.set(v, colorOf(v));
    return cache.get(v);
  };
  rows.forEach((id, r) => {
    const ci = meta.index.get(`${id}`);
    if (ci == null) return;
    const base = ci * meta.nBins;
    for (let x = 0; x < width; x += 1) {
      const b = binOfX[x];
      if (b < 0) continue;
      const v = values[base + b];
      if (v === meta.missing) continue;
      const [cr, cg, cb] = rgb(v);
      const o = (r * width + x) * 4;
      out[o] = cr;
      out[o + 1] = cg;
      out[o + 2] = cb;
      out[o + 3] = 255;
    }
  });
  return out;
}

/** "chr7:50.1-57.0 Mb" */
export const windowLabel = (chr, win) => `chr${`${chr}`.replace(/^chr/, "")}:${(win.from / 1e6).toFixed(win.to - win.from < 2e6 ? 2 : 1)}–${(win.to / 1e6).toFixed(win.to - win.from < 2e6 ? 2 : 1)} Mb`;
