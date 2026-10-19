// d3-free y-domain helpers for the cell tracks (Total CN, Coverage, Allelic CN).
// Modes: shared (one range for every window and track of the cell: the old behaviour), window (each genomic
// window its own range), track (one range per track, shared over its windows), custom (a given maximum).

export const Y_MODES = ["shared", "window", "track", "custom"];
export const Y_MODE_LABELS = { shared: "Auto (shared)", window: "Auto per window", track: "Auto per track", custom: "Custom" };
export const ROBUST_QUANTILE = 0.995;
export const HEADROOM = 1.15;

/** Quantile q (0..1) of the finite values (linear interpolation); NaN when there are none. */
export function quantile(values, q) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const pos = (v.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}

/** Robust upper end: 99.5th percentile with headroom, so a single spike does not flatten the rest; integer for CN. */
export function robustMax(values, { q = ROBUST_QUANTILE, headroom = HEADROOM, min = 4, integer = true } = {}) {
  const m = quantile(values, q);
  if (!Number.isFinite(m)) return min;
  const top = Math.max(min, m * headroom);
  return integer ? Math.ceil(top) : top;
}

/** Values of the points whose x falls in each [from, to] window. */
export function windowValues(xs, ys, windows) {
  const out = windows.map(() => []);
  const n = Math.min(xs?.length || 0, ys?.length || 0);
  for (let i = 0; i < n; i += 1) {
    const x = Number(xs[i]);
    for (let w = 0; w < windows.length; w += 1) {
      if (x >= windows[w][0] && x <= windows[w][1]) out[w].push(Number(ys[i]));
    }
  }
  return out;
}

/** Y values of the intervals overlapping each window (interval: startPlace, endPlace, y). */
export function intervalWindowValues(intervals = [], windows) {
  return windows.map((w) => intervals.filter((iv) => iv.startPlace <= w[1] && iv.endPlace >= w[0]).map((iv) => Number(iv.y)));
}

/**
 * Y ranges of one track from its per-window values. values: array (per window) of arrays.
 * Returns { ranges: [[0, max] per window], shared: [0, max] } for the mode; `custom` fixes every window.
 */
export function trackRanges(values, { mode = "shared", custom = null, integer = true } = {}) {
  const per = values.map((v) => robustMax(v, { integer }));
  const shared = [0, Math.max(...per, 4)];
  if (mode === "custom" && Number(custom) > 0) return { ranges: values.map(() => [0, Number(custom)]), shared: [0, Number(custom)] };
  if (mode === "window") return { ranges: per.map((m) => [0, m]), shared };
  return { ranges: values.map(() => shared), shared }; // shared / track: one range over the windows
}

/** Count of values above a custom maximum (values at the top are drawn clamped or clipped, never hidden silently). */
export const countAbove = (values, max) => values.reduce((t, v) => t + (Number.isFinite(v) && v > max ? 1 : 0), 0);

/** Parse ?yax= : window | shared | track | <number> -> { mode, custom }; null when absent / invalid. */
export function parseYAxis(text) {
  const s = `${text || ""}`.trim().toLowerCase();
  if (["window", "shared", "track"].includes(s)) return { mode: s, custom: null };
  const n = Number(s);
  return s && Number.isFinite(n) && n > 0 ? { mode: "custom", custom: n } : null;
}

/** Inverse of parseYAxis. */
export function formatYAxis({ mode, custom } = {}) {
  return mode === "custom" ? `${custom}` : mode || "";
}

/**
 * Y ranges of one cell's Total CN and Coverage tracks over the genomic windows for a mode (not "shared").
 * `window` / `custom`: both tracks share each window's range (so they line up); `track`: each track its own range.
 * Returns { total, coverage, above } (ranges per window; above = values over a custom max), or null for shared / bad input.
 */
export function cellTrackRanges({ intervals = null, covX = null, covY = null, hasFit = false, windows = [], mode = "shared", custom = null }) {
  if (mode === "shared" || !windows.length || (mode === "custom" && !(Number(custom) > 0))) return null;
  const totalVals = intervals ? intervalWindowValues(intervals, windows) : windows.map(() => []);
  const covVals = hasFit && covX ? windowValues(covX, covY, windows) : windows.map(() => []);
  const opts = { mode, custom };
  let total;
  let coverage;
  if (mode === "track") {
    total = trackRanges(totalVals, opts).ranges;
    coverage = trackRanges(covVals, opts).ranges;
  } else {
    total = trackRanges(totalVals.map((t, i) => t.concat(covVals[i])), opts).ranges;
    coverage = total;
  }
  const max = mode === "custom" ? Number(custom) : null;
  return { total, coverage, above: max ? countAbove(totalVals.flat(), max) + countAbove(covVals.flat(), max) : 0 };
}
