// `atac` track (spec v0.4): per-clade pool bigWigs (A-read fragments, CPM per 1 kb) + MACS3 peaks, and the
// existing per-cell 500 kb `atac.arrow`. `per_copy: true` divides the signal by the clade's median CN in the bin
// (fragments per copy). Index parsing, pool lookup, pixel columns and per-copy division. d3-free (jest).

export const ATAC_FORMAT = "gos-atac-index";
export const ATAC_URL = "{dataPath}{patient}/atac/index.json";
export const ATAC_CELL_URL = "{dataPath}{unit}/atac.arrow";

/** Validate and normalize atac/index.json: { ok, index: { unit, binSize, pools: [...], all, byGroup: Map } } or { ok: false, error }. */
export function parseAtacIndex(json) {
  if (!json || typeof json !== "object") return { ok: false, error: "index is not a JSON object" };
  if (json.format !== ATAC_FORMAT) return { ok: false, error: `unknown format ${json.format ?? "(none)"}` };
  if (Number(json.version) !== 1) return { ok: false, error: `unsupported version ${json.version}` };
  const norm = (p) => (p && p.id != null && p.bigwig
    ? { id: `${p.id}`, group: p.group != null ? `${p.group}` : null, n_cells: Number(p.n_cells) || null, fragments: Number(p.fragments) || null, bigwig: p.bigwig, peaks: p.peaks || null, cells: Array.isArray(p.cells) ? p.cells.map(String) : null }
    : null);
  const pools = (Array.isArray(json.pools) ? json.pools : []).map(norm).filter(Boolean);
  const all = norm(json.all ? { id: "all", ...json.all } : null);
  if (!pools.length && !all) return { ok: false, error: "no pools" };
  const byGroup = new Map();
  pools.forEach((p) => {
    if (p.group != null && !byGroup.has(p.group)) byGroup.set(p.group, p);
  });
  return { ok: true, index: { unit: json.unit || "cpm", binSize: Number(json.bin_size) || null, pools, all, byGroup } };
}

/** The pool drawn for a row: the clade's pool, a named pool (e.g. "tp_T0"), or the all-cells pool. */
export function poolFor(index, { group = null, id = null } = {}) {
  if (!index) return null;
  if (id != null) return index.pools.find((p) => p.id === id) || (id === "all" ? index.all : null);
  if (group != null) return index.byGroup.get(`${group}`) || null;
  return index.all;
}

/**
 * bigWig values (0-based half open { start, end, value }) to pixel columns of a laid-out window (1-based closed
 * window): overlap-weighted mean per column. Returns Float32Array(width) with NaN where no data.
 */
export function valueColumns(values, slot) {
  const cols = Math.max(1, Math.round(slot.width));
  const sum = new Float64Array(cols);
  const wt = new Float64Array(cols);
  const w = slot.window;
  const span = w.end - w.start + 1;
  const bpPerCol = span / cols;
  (values || []).forEach((v) => {
    if (!Number.isFinite(v.value)) return;
    const a = Math.max(v.start + 1, w.start);
    const b = Math.min(v.end, w.end);
    if (b < a) return;
    const c0 = Math.max(0, Math.floor((a - w.start) / bpPerCol));
    const c1 = Math.min(cols - 1, Math.floor((b - w.start) / bpPerCol));
    for (let c = c0; c <= c1; c += 1) {
      const lo = Math.max(a, w.start + c * bpPerCol);
      const hi = Math.min(b + 1, w.start + (c + 1) * bpPerCol);
      const ov = hi - lo;
      if (ov <= 0) continue;
      sum[c] += v.value * ov;
      wt[c] += ov;
    }
  });
  const out = new Float32Array(cols);
  for (let c = 0; c < cols; c += 1) out[c] = wt[c] > 0 ? sum[c] / wt[c] : NaN;
  return out;
}

/**
 * Fragments per copy: each value divided by the clade median CN of the heat-map bin holding its midpoint.
 * entry: the heat-map chromosome entry ({ starts, ends }, 1-based closed); median: Float32Array over its bins.
 * Values in bins with CN <= 0.05 or no CN become NaN (drawn as gaps, "not available" on hover).
 */
export function perCopyValues(values, entry, median) {
  if (!entry || !median) return (values || []).map((v) => ({ ...v, value: NaN }));
  const { starts, ends } = entry;
  let b = 0;
  return (values || []).map((v) => {
    const mid = (v.start + 1 + v.end) / 2;
    if (b >= ends.length || starts[b] > mid) b = 0;
    while (b < ends.length && ends[b] < mid) b += 1;
    const cn = b < ends.length && starts[b] <= mid ? median[b] : NaN;
    return { ...v, value: Number.isFinite(cn) && cn > 0.05 ? v.value / cn : NaN, cn };
  });
}

/** A robust y max for signal columns (99th percentile of finite values, at least `floor`). */
export function signalMax(columnsList, floor = 1e-6) {
  const v = [];
  (columnsList || []).forEach((cols) => cols && cols.forEach((x) => Number.isFinite(x) && v.push(x)));
  if (!v.length) return null;
  v.sort((a, b) => a - b);
  return Math.max(floor, v[Math.floor(0.99 * (v.length - 1))]);
}

/**
 * Pool per-cell 500 kb ATAC (atac.arrow: genome-wide x of the bin start, y = CPM) across the shown cells: mean per
 * bin over the cells that have the bin. cells: [{ x, y }]. Returns { x, y, n } sorted by x.
 */
export function poolCellArrays(cells) {
  const acc = new Map();
  (cells || []).forEach((c) => {
    if (!c || !c.x) return;
    for (let i = 0; i < c.x.length; i += 1) {
      const y = Number(c.y[i]);
      if (!Number.isFinite(y)) continue;
      const k = Number(c.x[i]);
      const a = acc.get(k);
      if (a) {
        a.s += y;
        a.n += 1;
      } else acc.set(k, { s: y, n: 1 });
    }
  });
  const xs = [...acc.keys()].sort((p, q) => p - q);
  return { x: Float64Array.from(xs), y: Float32Array.from(xs.map((k) => acc.get(k).s / acc.get(k).n)), n: (cells || []).filter((c) => c && c.x).length };
}
