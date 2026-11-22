// `cn_heatmap` track (spec v0.4): cells x 500 kb bins in tree order, one uint16 matrix per chromosome
// (CN x 100, 65535 = NA) plus a genome-wide 5 Mb level of detail. Decoding, bin lookup, clade median / IQR
// profiles with the shown cells, the `cn_diff` profile, CN colors and the left annotation strips. d3-free (jest).

export const HEATMAP_FORMAT = "gos-cn-heatmap-u16";
export const HEATMAP_URL = "{dataPath}{patient}/cn_heatmap/index.json";
export const NA_U16 = 65535;
const bare = (c) => `${c ?? ""}`.replace(/^chr/i, "");

/**
 * Validate and normalize index.json. Returns { ok: true, index } with index = { cells, cellIndex: Map id -> row,
 * chroms: Map chrom -> { chrom, file, starts, ends }, chromList, lod: { file, binSize, bins } | null, scale, na, order }
 * or { ok: false, error } (the reason, for a "not available (reason)" row).
 */
export function parseHeatmapIndex(json) {
  if (!json || typeof json !== "object") return { ok: false, error: "index is not a JSON object" };
  if (json.format !== HEATMAP_FORMAT) return { ok: false, error: `unknown format ${json.format ?? "(none)"}` };
  if (Number(json.version) !== 1) return { ok: false, error: `unsupported version ${json.version}` };
  if (!Array.isArray(json.cells) || !json.cells.length) return { ok: false, error: "no cells" };
  if (!Array.isArray(json.chroms) || !json.chroms.length) return { ok: false, error: "no chromosomes" };
  const chroms = new Map();
  const chromList = [];
  for (let i = 0; i < json.chroms.length; i += 1) {
    const c = json.chroms[i];
    if (!c || !c.file || !Array.isArray(c.starts) || !Array.isArray(c.ends) || c.starts.length !== c.ends.length) return { ok: false, error: `chromosome entry ${i} malformed` };
    const e = { chrom: bare(c.chrom), file: c.file, starts: Float64Array.from(c.starts), ends: Float64Array.from(c.ends) };
    chroms.set(e.chrom, e);
    chromList.push(e);
  }
  let lod = null;
  if (json.lod && json.lod.file && Array.isArray(json.lod.bins) && json.lod.bins.length) {
    lod = { file: json.lod.file, binSize: Number(json.lod.bin_size) || null, bins: json.lod.bins.map((b) => ({ chrom: bare(b.chrom), start: Number(b.start), end: Number(b.end) })) };
  }
  return {
    ok: true,
    index: {
      cells: json.cells.map(String),
      cellIndex: new Map(json.cells.map((id, i) => [`${id}`, i])),
      chroms,
      chromList,
      lod,
      scale: Number(json.scale) || 100,
      na: Number.isFinite(Number(json.na)) ? Number(json.na) : NA_U16,
      order: json.order || "tree",
    },
  };
}

/**
 * Decode a little-endian uint16 matrix (n_cells x n_bins, row major) into a Float32Array of CN (NaN = NA).
 * Throws when the buffer does not have n_cells * n_bins values.
 */
export function decodeU16(buffer, nCells, nBins, scale = 100, na = NA_U16) {
  const n = nCells * nBins;
  if (!buffer || buffer.byteLength !== n * 2) throw new Error(`matrix has ${buffer ? buffer.byteLength / 2 : 0} values, expected ${nCells} x ${nBins}`);
  const dv = new DataView(buffer);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const v = dv.getUint16(2 * i, true);
    out[i] = v === na ? NaN : v / scale;
  }
  return out;
}

/** Bins of a chromosome entry overlapping a 1-based closed window: [i0, i1) (empty when none). */
export function binRange(entry, w) {
  if (!entry) return [0, 0];
  const { starts, ends } = entry;
  let lo = 0;
  let hi = ends.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ends[mid] < w.start) lo = mid + 1;
    else hi = mid;
  }
  let i1 = lo;
  while (i1 < starts.length && starts[i1] <= w.end) i1 += 1;
  return [lo, i1];
}

/**
 * For each of `width` pixel columns of a window, the bin index under the column's center (or -1 when the center
 * falls in a gap / masked stretch between bins). Sampling, not averaging: 500 kb bins are >= 1 px at chromosome scale.
 */
export function columnBins(entry, w, width) {
  const cols = Math.max(1, Math.round(width));
  const out = new Int32Array(cols).fill(-1);
  if (!entry) return out;
  const [i0, i1] = binRange(entry, w);
  const span = w.end - w.start + 1;
  let b = i0;
  for (let x = 0; x < cols; x += 1) {
    const pos = w.start + ((x + 0.5) / cols) * span;
    while (b < i1 && entry.ends[b] < pos) b += 1;
    if (b < i1 && entry.starts[b] <= pos) out[x] = b;
  }
  return out;
}

function quantileSorted(v, n, q) {
  if (!n) return NaN;
  const i = (n - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return v[lo] + (v[hi] - v[lo]) * (i - lo);
}

/**
 * Median and interquartile range per bin across the given rows (cells) of a decoded matrix, ignoring NA.
 * bins: optional [i0, i1) to restrict the work. Returns { median, q1, q3, n } (Float32Array / Uint16Array of nBins;
 * bins outside the range are NaN / 0).
 */
export function medianProfile(mat, nBins, rows, bins = null) {
  const median = new Float32Array(nBins).fill(NaN);
  const q1 = new Float32Array(nBins).fill(NaN);
  const q3 = new Float32Array(nBins).fill(NaN);
  const n = new Uint16Array(nBins);
  const [b0, b1] = bins || [0, nBins];
  const buf = new Float64Array(rows.length);
  for (let b = b0; b < b1; b += 1) {
    let k = 0;
    for (let r = 0; r < rows.length; r += 1) {
      const v = mat[rows[r] * nBins + b];
      if (v === v) buf[k++] = v; // eslint-disable-line no-self-compare
    }
    if (!k) continue;
    const s = buf.subarray(0, k).sort();
    median[b] = quantileSorted(s, k, 0.5);
    q1[b] = quantileSorted(s, k, 0.25);
    q3[b] = quantileSorted(s, k, 0.75);
    n[b] = k;
  }
  return { median, q1, q3, n };
}

/**
 * `cn_diff`: median CN of rows A minus median CN of rows B per bin (NaN when either side has no value).
 * Returns { diff, nA, nB } (Float32Array, and the number of cells used on each side).
 */
export function diffProfile(mat, nBins, rowsA, rowsB, bins = null) {
  const a = medianProfile(mat, nBins, rowsA, bins);
  const b = medianProfile(mat, nBins, rowsB, bins);
  const diff = new Float32Array(nBins);
  for (let i = 0; i < nBins; i += 1) diff[i] = a.median[i] - b.median[i];
  return { diff, nA: rowsA.length, nB: rowsB.length, a, b };
}

/** Rows of the matrix for unit ids (ids without a row are skipped). */
export const rowsOf = (index, ids) => (ids || []).map((id) => index.cellIndex.get(`${id}`)).filter((r) => r != null);

// ----- colors: CN 0 .. >= 8 with 2 = neutral at the unit's ploidy (CN is shifted by round(ploidy) - 2)
export const CN_PALETTE = ["#2166ac", "#92c5de", "#f7f7f7", "#fddbc7", "#f4a582", "#d6604d", "#b2182b", "#8c0d25", "#4d0717"];
export const NA_COLOR = "#cfcfcf";
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const PAL_RGB = CN_PALETTE.map(hex);
const NA_RGB = hex(NA_COLOR);

/** Palette index (0..8) of a CN; neutral = the CN drawn white (default 2; use round(ploidy) for relative colors). */
export function cnLevel(cn, neutral = 2) {
  if (!Number.isFinite(cn)) return -1;
  const rel = Math.round(cn) - Math.round(neutral) + 2;
  return Math.max(0, Math.min(CN_PALETTE.length - 1, rel));
}
/** [r, g, b] of a CN (NA grey). */
export const cnRgb = (cn, neutral = 2) => {
  const l = cnLevel(cn, neutral);
  return l < 0 ? NA_RGB : PAL_RGB[l];
};
/** Signed difference colors for `cn_diff` bars: losses blue, gains red. */
export const diffColor = (d) => (!Number.isFinite(d) ? NA_COLOR : d > 0 ? "#b2182b" : d < 0 ? "#2166ac" : "#999");

// ----- left annotation strips of the heat map
export const STRIPS = [
  { key: "clade", label: "clade", kind: "group" },
  { key: "plate", label: "plate", kind: "cat" },
  { key: "time_point", label: "time point", kind: "cat" },
  { key: "s_phase", label: "S-phase", kind: "cat" },
  { key: "qc_mapd", label: "MAPD", kind: "num" },
  { key: "depth", label: "depth", kind: "num" },
  { key: "ecdna_call", label: "ecDNA caller", kind: "cat" },
  // v0.5 (JW-07): strict whole-chromosome changes in the cell, and the JW-07 arm events it carries (NA: not scored)
  { key: "cin_wc_changes", label: "JW-07 WC changes", kind: "num" },
  { key: "cin_events_carried", label: "JW-07 arm events", kind: "num" },
];
const NUM_KEYS = new Set(["qc_mapd", "cin_wc_changes", "cin_events_carried"]);
const CAT = ["#4e79a7", "#f28e2b", "#59a14f", "#e15759", "#76b7b2", "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac", "#86bcb6", "#d37295"];
const TIME_ORDER = ["T0", "T1", "T4", "T11", "T12"];
const isNa = (v) => v == null || v === "" || v === "NA" || (typeof v === "number" && !Number.isFinite(v));

/** The value of a strip for a unit (null = NA). Numeric strips return numbers. */
export function stripValue(unit, key) {
  if (!unit) return null;
  if (key === "clade") return unit.group ?? null;
  if (key === "depth") {
    const d = Number(unit.depth);
    return Number.isFinite(d) ? d : null;
  }
  if (NUM_KEYS.has(key)) {
    const v = unit[key];
    if (v === null || v === undefined || v === "" || v === "NA") return null;
    const d = Number(v);
    return Number.isFinite(d) ? d : null;
  }
  const v = unit[key];
  if (isNa(v)) return null;
  if (key === "s_phase") {
    const s = `${v}`.toUpperCase();
    return s === "TRUE" || s === "T" || s === "1" ? "S" : s === "FALSE" || s === "F" || s === "0" ? "non-S" : null;
  }
  if (key === "ecdna_call") return `${v}` === "none" ? "none" : "called";
  return `${v}`;
}

/** Strips that have at least one non-NA value among the units (others are not drawn). */
export function activeStrips(units) {
  return STRIPS.filter((s) => (units || []).some((u) => stripValue(u, s.key) != null));
}

/**
 * Color function per strip over a set of units: categorical palettes (time points in course order, S-phase red,
 * ecDNA-caller "called" purple), numeric strips as a grey ramp between the 5th and 95th percentile. Returns
 * Map key -> { color(v), legend: [[label, color]] }.
 */
export function stripScales(units, groupColor = () => "#999") {
  const out = new Map();
  STRIPS.forEach((s) => {
    const vals = (units || []).map((u) => stripValue(u, s.key)).filter((v) => v != null);
    if (s.kind === "group") {
      const lv = [...new Set(vals)];
      out.set(s.key, { color: (v) => (v == null ? NA_COLOR : groupColor(v)), legend: lv.map((v) => [v, groupColor(v)]) });
    } else if (s.kind === "num") {
      const sorted = vals.slice().sort((a, b) => a - b);
      const lo = sorted.length ? sorted[Math.floor(0.05 * (sorted.length - 1))] : 0;
      const hi = sorted.length ? sorted[Math.ceil(0.95 * (sorted.length - 1))] : 1;
      const color = (v) => {
        if (v == null) return NA_COLOR;
        const f = hi > lo ? Math.max(0, Math.min(1, (v - lo) / (hi - lo))) : 0.5;
        const g = Math.round(235 - f * 200);
        return `rgb(${g},${g},${g})`;
      };
      out.set(s.key, { color, legend: [[`${+lo.toPrecision(3)}`, color(lo)], [`${+hi.toPrecision(3)}`, color(hi)]], lo, hi });
    } else {
      let lv = [...new Set(vals)];
      if (s.key === "time_point") lv.sort((a, b) => (TIME_ORDER.indexOf(a) + 1 || 99) - (TIME_ORDER.indexOf(b) + 1 || 99));
      else lv.sort();
      const fixed = { "S": "#d62728", "non-S": "#dddddd", called: "#7b3294", none: "#eeeeee" };
      const map = new Map(lv.map((v, i) => [v, fixed[v] || CAT[i % CAT.length]]));
      out.set(s.key, { color: (v) => (v == null ? NA_COLOR : map.get(v) || NA_COLOR), legend: lv.map((v) => [v, map.get(v)]) });
    }
  });
  return out;
}

/** Genome-wide layout of the LOD bins across `width` px: [{ chrom, x0, x1, firstBin, lastBin }] in file order. */
export function lodLayout(lod, width) {
  if (!lod || !lod.bins?.length) return [];
  const chroms = [];
  lod.bins.forEach((b, i) => {
    const last = chroms[chroms.length - 1];
    if (!last || last.chrom !== b.chrom) chroms.push({ chrom: b.chrom, firstBin: i, lastBin: i, len: b.end - b.start + 1 });
    else {
      last.lastBin = i;
      last.len += b.end - b.start + 1;
    }
  });
  const total = chroms.reduce((s, c) => s + c.len, 0);
  let x = 0;
  return chroms.map((c) => {
    const w = (c.len / total) * width;
    const item = { ...c, x0: x, x1: x + w };
    x += w;
    return item;
  });
}

/**
 * Row layout of the heat map. mode "cells": one row per unit (rowPx each; compressed to fit maxH when there are many
 * cells, so 2,280 cells share the block's pixel rows). mode "pseudobulk" (clades): one band per clade (median CN,
 * bandPx), followed by its cells when the clade is expanded. Units are in display order (tree order, selected clades
 * first). Returns { rows: [{ kind: "band" | "cell", group, id?, members?, y, h }], height }.
 */
export function heatmapRows(units, mode = "pseudobulk", expanded = {}, rowPx = 3, { bandPx = 16, maxH = 480 } = {}) {
  const list = units || [];
  const rows = [];
  if (mode === "cells") {
    const h = list.length * rowPx > maxH ? maxH / Math.max(1, list.length) : rowPx;
    list.forEach((u, i) => rows.push({ kind: "cell", id: u.id, group: u.group ?? "no clone", y: i * h, h }));
    return { rows, height: Math.max(1, Math.ceil(list.length * h)) };
  }
  const order = [];
  const members = new Map();
  list.forEach((u) => {
    const g = u.group ?? "no clone";
    if (!members.has(g)) {
      members.set(g, []);
      order.push(g);
    }
    members.get(g).push(u.id);
  });
  const nExpanded = order.reduce((s, g) => s + (expanded[g] ? members.get(g).length : 0), 0);
  const room = Math.max(0, maxH - order.length * bandPx);
  const cellH = nExpanded * rowPx > room && nExpanded ? Math.max(room / nExpanded, 0.25) : rowPx;
  let y = 0;
  order.forEach((g) => {
    rows.push({ kind: "band", group: g, members: members.get(g), y, h: bandPx });
    y += bandPx;
    if (expanded[g]) {
      members.get(g).forEach((id) => {
        rows.push({ kind: "cell", id, group: g, y, h: cellH });
        y += cellH;
      });
    }
  });
  return { rows, height: Math.max(1, Math.ceil(y)) };
}

/** Index of the heat-map row covering pixel y (rows sorted by y), or -1. */
export function heatmapRowAt(rows, y) {
  let lo = 0;
  let hi = rows.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = rows[mid];
    if (y < r.y) hi = mid - 1;
    else if (y >= r.y + r.h) lo = mid + 1;
    else return mid;
  }
  return -1;
}

/** LOD bin under a genome-wide column (layout from lodLayout), or -1. */
export function lodBinAt(layout, x) {
  const c = (layout || []).find((it) => x >= it.x0 && x < it.x1);
  if (!c) return -1;
  const n = c.lastBin - c.firstBin + 1;
  return c.firstBin + Math.min(n - 1, Math.floor(((x - c.x0) / Math.max(1e-9, c.x1 - c.x0)) * n));
}
