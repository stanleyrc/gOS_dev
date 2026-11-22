// d3-free helpers for the JaWA track types of the track browser (spec v0.6): cn_heatmap, cn_correlation_1d,
// cn_correlation_2d. Source: the patient's per-cell binned copy number (cn_binned.json levels["100kb"] +
// cn_binned_100kb.cn.u16, cell-major uint16, 65535 = missing), i.e. the JaBbA segment CN at each bin centre.
// Correlations are Pearson across the shown units (cells), computed in the browser.

const bare = (c) => `${c ?? ""}`.replace(/^chr/i, "");

/** cn_binned.json -> { cells, index, binSize, nBins, missing, file, chroms: Map(chr -> { first, n }) } | null. */
export function cnMetaFrom(json, level = "100kb") {
  const lv = json?.levels?.[level];
  if (!lv || !Array.isArray(json?.cells)) return null;
  const chroms = new Map((lv.chromosomes || []).map((c) => [bare(c.chr), { first: Number(c.first_bin), n: Number(c.n_bins) }]));
  return {
    cells: json.cells.map(String),
    index: new Map(json.cells.map((c, i) => [`${c}`, i])),
    binSize: Number(lv.bin_size) || 100000,
    nBins: Number(lv.n_bins),
    missing: lv.missing_value == null ? 65535 : Number(lv.missing_value),
    file: lv.files?.cn || `cn_binned_${level}.cn.u16`,
    chroms,
  };
}

/**
 * Axis bins over the windows (concatenated, display order). Bins are merged by an integer factor so the axis has
 * at most maxBins entries. Each entry is hic.js windowBins-compatible ({ k, chrom, n, axis0, res, binStart, start,
 * end }) plus first (global index of the first source bin) and factor, so hic.columnAxis maps screen columns to it.
 */
export function cnAxis(meta, windows, maxBins = 600) {
  if (!meta) return { wins: [], n: 0, factor: 1 };
  const raw = (windows || []).reduce((s, w) => s + Math.max(0, Math.ceil((w.end - w.start + 1) / meta.binSize) + 1), 0);
  const factor = Math.max(1, Math.ceil(raw / Math.max(1, maxBins)));
  const res = meta.binSize * factor;
  let axis = 0;
  const wins = (windows || []).map((w, k) => {
    const c = meta.chroms.get(bare(w.chrom));
    if (!c) return { k, chrom: bare(w.chrom), n: 0, axis0: axis, res, binStart: 1, start: w.start, end: w.end, missing: true, first: 0, factor };
    const nAgg = Math.ceil(c.n / factor);
    const lo = Math.max(0, Math.floor((w.start - 1) / res));
    const hi = Math.min(nAgg - 1, Math.floor((w.end - 1) / res));
    const n = Math.max(0, hi - lo + 1);
    const out = { k, chrom: bare(w.chrom), n, axis0: axis, res, binStart: lo * res + 1, start: w.start, end: w.end, first: c.first + lo * factor, last: c.first + c.n - 1, factor };
    axis += n;
    return out;
  });
  return { wins, n: axis, factor };
}

/** Genomic label of axis index i: "chr12:57.3-57.4 Mb". */
export function axisLabel(ax, i) {
  const w = ax.wins.find((x) => i >= x.axis0 && i < x.axis0 + x.n);
  if (!w) return "";
  const s = w.binStart + (i - w.axis0) * w.res;
  return `chr${w.chrom}:${(s / 1e6).toFixed(2)}-${((s + w.res - 1) / 1e6).toFixed(2)} Mb`;
}

/** Axis index of chrom:pos, or -1. */
export function axisIndexOf(ax, chrom, pos) {
  const w = ax.wins.find((x) => x.chrom === bare(chrom) && pos >= x.start && pos <= x.end && x.n > 0);
  if (!w) return -1;
  const j = Math.floor((pos - w.binStart) / w.res);
  return j >= 0 && j < w.n ? w.axis0 + j : -1;
}

/**
 * Units x axis matrix (row-major Float32Array, NaN = missing): the mean CN of the merged source bins.
 * rows: unit ids; a unit absent from the CN file gets an all-NaN row (drawn "not available").
 */
export function cnMatrix(values, meta, ax, rows) {
  const n = ax.n;
  const out = new Float32Array(rows.length * n).fill(NaN);
  rows.forEach((id, r) => {
    const ci = meta.index.get(`${id}`);
    if (ci == null) return;
    const base = ci * meta.nBins;
    ax.wins.forEach((w) => {
      for (let j = 0; j < w.n; j += 1) {
        const b0 = w.first + j * w.factor;
        const b1 = Math.min(w.last, b0 + w.factor - 1);
        let s = 0;
        let m = 0;
        for (let b = b0; b <= b1; b += 1) {
          const v = values[base + b];
          if (v !== meta.missing && v != null) {
            s += v;
            m += 1;
          }
        }
        if (m) out[r * n + w.axis0 + j] = s / m;
      }
    });
  });
  return out;
}

const tx = (v, log) => (log ? Math.log2(v + 1) : v);

/** Column means / centered columns over the rows that have a value; columns with < minRows values or no variance are null. */
function centered(mat, nRows, n, log, minRows, minSd = 0) {
  const cols = new Array(n).fill(null);
  for (let j = 0; j < n; j += 1) {
    let s = 0;
    let m = 0;
    for (let r = 0; r < nRows; r += 1) {
      const v = mat[r * n + j];
      if (Number.isFinite(v)) {
        s += tx(v, log);
        m += 1;
      }
    }
    if (m < minRows) continue;
    const mean = s / m;
    const c = new Float64Array(nRows).fill(NaN);
    let ss = 0;
    for (let r = 0; r < nRows; r += 1) {
      const v = mat[r * n + j];
      if (Number.isFinite(v)) {
        c[r] = tx(v, log) - mean;
        ss += c[r] * c[r];
      }
    }
    // near-constant bins (a handful of deviating cells) give spurious |r| ~ 1: masked below minSd
    if (ss > 1e-12 && Math.sqrt(ss / m) >= minSd) cols[j] = { c, ss };
  }
  return cols;
}

function pearson(a, b, nRows, minRows) {
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  let m = 0;
  for (let r = 0; r < nRows; r += 1) {
    const x = a.c[r];
    const y = b.c[r];
    if (Number.isNaN(x) || Number.isNaN(y)) continue;
    sab += x * y;
    saa += x * x;
    sbb += y * y;
    m += 1;
  }
  if (m < minRows || saa <= 1e-12 || sbb <= 1e-12) return NaN;
  return sab / Math.sqrt(saa * sbb);
}

/**
 * Bin x bin Pearson correlation of CN across the rows: { n, values: Float32Array n*n (NaN where a bin has no
 * variance, a CN standard deviation below minSd (log2 units when log) or fewer than minRows values), nRows }. log: correlate log2(CN + 1) (default), so a few very high copies
 * do not dominate.
 */
export function cnCorrelation2d(mat, nRows, n, { log = true, minRows = 5, minSd = 0.15 } = {}) {
  const cols = centered(mat, nRows, n, log, minRows, minSd);
  const values = new Float32Array(n * n).fill(NaN);
  for (let a = 0; a < n; a += 1) {
    if (!cols[a]) continue;
    values[a * n + a] = 1;
    for (let b = a + 1; b < n; b += 1) {
      if (!cols[b]) continue;
      const r = pearson(cols[a], cols[b], nRows, minRows);
      values[a * n + b] = r;
      values[b * n + a] = r;
    }
  }
  return { n, values, nRows };
}

/**
 * Correlation of every bin's CN with the anchor (mean CN over the anchor's axis bins) across the rows:
 * Float32Array n (NaN where undefined). anchorIdx: axis indices.
 */
export function cnCorrelation1d(mat, nRows, n, anchorIdx, { log = true, minRows = 5, minSd = 0.15 } = {}) {
  const out = new Float32Array(n).fill(NaN);
  const idx = (anchorIdx || []).filter((i) => i >= 0 && i < n);
  if (!idx.length) return out;
  const anchor = new Float32Array(nRows).fill(NaN);
  for (let r = 0; r < nRows; r += 1) {
    let s = 0;
    let m = 0;
    idx.forEach((j) => {
      const v = mat[r * n + j];
      if (Number.isFinite(v)) {
        s += v;
        m += 1;
      }
    });
    if (m) anchor[r] = s / m;
  }
  const a = centered(anchor, nRows, 1, log, minRows)[0];
  if (!a) return out;
  const cols = centered(mat, nRows, n, log, minRows, minSd);
  for (let j = 0; j < n; j += 1) if (cols[j]) out[j] = pearson(a, cols[j], nRows, minRows);
  return out;
}

/** Blue (-1) -> white (0) -> red (+1); NaN light grey. */
export function divergingRgb(r) {
  if (!Number.isFinite(r)) return [228, 228, 228];
  const t = Math.max(-1, Math.min(1, r));
  if (t >= 0) return [Math.round(255 - 40 * t), Math.round(255 - 215 * t), Math.round(255 - 215 * t)];
  const u = -t;
  return [Math.round(255 - 215 * u), Math.round(255 - 135 * u), Math.round(255 - 40 * u)];
}

/** The gOS CN palette (as the Single-Cell heatmap): 0 dark blue, 1 light blue, 2 white, 3+ orange to dark red, 11+ black. */
const CN_RGB = [[44, 123, 182], [146, 197, 222], [255, 255, 255], [253, 192, 134], [244, 134, 66], [228, 82, 50], [204, 37, 41], [165, 15, 21], [127, 0, 0], [90, 0, 0], [60, 0, 0], [0, 0, 0]];
export function cnRgb(v) {
  if (!Number.isFinite(v)) return null;
  const k = Math.max(0, Math.min(CN_RGB.length - 1, Math.round(v)));
  return CN_RGB[k];
}

/**
 * RGBA pixels of a units x axis heat map: width x height, row r covers rows [r*h/nRows, (r+1)*h/nRows), screen
 * column x takes cols[x] (hic.columnAxis; -1 = gap). Missing cells transparent.
 */
export function heatmapPixels(mat, nRows, n, cols, width, height, colorOf = null) {
  // colorOf: matrix.cnColorer(palette) (packed ABGR uint32, the Single-Cell heatmap colors); default cnRgb
  const rgbOf = colorOf
    ? (v) => {
        if (!Number.isFinite(v)) return null;
        const p = colorOf(v);
        return [p & 255, (p >>> 8) & 255, (p >>> 16) & 255];
      }
    : cnRgb;
  const W = Math.max(1, Math.round(width));
  const H = Math.max(1, Math.round(height));
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y += 1) {
    const r = Math.min(nRows - 1, Math.floor(((y + 0.5) / H) * nRows));
    if (r < 0) continue;
    for (let x = 0; x < W; x += 1) {
      const j = cols[x] ?? -1;
      if (j < 0) continue;
      const c = rgbOf(mat[r * n + j]);
      if (!c) continue;
      const o = 4 * (y * W + x);
      rgba[o] = c[0];
      rgba[o + 1] = c[1];
      rgba[o + 2] = c[2];
      rgba[o + 3] = 255;
    }
  }
  return rgba;
}

/** Triangle (apex down, diagonal on top) pixels of a correlation matrix, x aligned with the tracks (as hic.renderPixels). */
export function correlationTrianglePixels(m, cols, width, height) {
  const W = Math.max(1, Math.round(width));
  const H = Math.max(1, Math.round(height));
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const xa = x - y;
      const xb = x + y;
      if (xa < 0 || xb >= cols.length) continue;
      const a = cols[xa];
      const b = cols[xb];
      if (a < 0 || b < 0) continue;
      const [r, g, bl] = divergingRgb(m.values[a * m.n + b]);
      const o = 4 * (y * W + x);
      rgba[o] = r;
      rgba[o + 1] = g;
      rgba[o + 2] = bl;
      rgba[o + 3] = 255;
    }
  }
  return rgba;
}
