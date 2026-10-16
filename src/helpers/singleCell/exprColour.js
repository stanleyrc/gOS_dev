// Colouring of cells by log-normalised gene expression (zero-inflated).
// Zero cells get a neutral grey and are drawn first; expressing cells use a
// sequential ramp, are capped at the 99th percentile of the non-zero values
// and are drawn in ascending order so high cells stay on top. d3-free.

/** Neutral fill / alpha / radius factor for cells with no detected expression. */
export const ZERO_STYLE = {
  light: { color: "#c4c4c4", alpha: 0.7, radius: 0.75 },
  dark: { color: "#4a4a52", alpha: 0.6, radius: 0.75 },
};

// Light panel: pale gold -> orange -> red -> dark plum (all clearly off the grey).
// Dark panel: dark crimson -> orange -> bright yellow (brightness rises with value).
const RAMPS = {
  light: [[253, 224, 120], [253, 160, 60], [220, 40, 40], [140, 10, 70], [55, 0, 70]],
  dark: [[150, 20, 90], [215, 50, 60], [250, 120, 40], [253, 190, 60], [255, 245, 150]],
};

/** Any non-light app theme (dark, cyberpunk) uses the dark-panel variants. */
export const themeKey = (mode) => (mode === "light" || mode == null ? "light" : "dark");

export function rampColor(t, mode = "light") {
  const stops = RAMPS[themeKey(mode)];
  const x = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0)) * (stops.length - 1);
  const k = Math.min(stops.length - 2, Math.floor(x));
  const f = x - k;
  return `rgb(${stops[k].map((v, i) => Math.round(v + (stops[k + 1][i] - v) * f)).join(",")})`;
}

/** CSS gradient of the ramp for the legend bar. */
export function rampGradient(mode = "light", n = 6) {
  return `linear-gradient(to right, ${Array.from({ length: n }, (_, i) => rampColor(i / (n - 1), mode)).join(",")})`;
}

/** Linear-interpolated quantile of an ascending-sorted array. */
export function quantileSorted(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Summarise expression values (array or object keyed by cell id).
 * scale: "p99" caps at the 99th percentile of non-zero values, "max" at the maximum.
 */
export function expressionModel(values, { scale = "p99" } = {}) {
  const list = Array.isArray(values) ? values : Object.values(values || {});
  const finite = list.filter(Number.isFinite);
  const nonzero = finite.filter((v) => v > 0).sort((a, b) => a - b);
  const max = nonzero.length ? nonzero[nonzero.length - 1] : 0;
  const cap = nonzero.length ? (scale === "max" ? max : quantileSorted(nonzero, 0.99)) : 0;
  return {
    nTotal: finite.length,
    nZero: finite.length - nonzero.length,
    nDetected: nonzero.length,
    pctDetected: finite.length ? (100 * nonzero.length) / finite.length : 0,
    min: nonzero.length ? nonzero[0] : 0,
    max,
    cap,
    capped: cap < max,
  };
}

/** Colour of one value; zero / missing -> the zero grey. */
export function exprColor(v, model, mode = "light") {
  if (!Number.isFinite(v) || v <= 0 || !(model.cap > 0)) return ZERO_STYLE[themeKey(mode)].color;
  return rampColor(Math.min(1, v / model.cap), mode);
}

/** Draw order: zero / missing cells first, then expressing cells ascending (stable). Returns a new array. */
export function exprDrawOrder(items, valueOf) {
  const rank = (it) => {
    const v = valueOf(it);
    return Number.isFinite(v) && v > 0 ? v : -1;
  };
  return items.map((it, i) => ({ it, i, r: rank(it) })).sort((a, b) => a.r - b.r || a.i - b.i).map((o) => o.it);
}
