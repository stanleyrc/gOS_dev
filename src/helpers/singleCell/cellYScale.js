// Per-cell y-scale for the cell tracks (d3-free). In "per cell" mode every copy-number track of one
// cell (JaBbA total CN, allelic CN, coverage) shares one y-range in CN units, [0, top], so the same
// CN sits at the same height on all of them. The top follows the cell's own amplitude: the larger of
// the JaBbA graph maximum in view and a high quantile of the coverage in view, plus padding.
//
// Units: coverage.arrow's `y` column is the exporter's `foregroundabs` (skilift sc_*), the binned
// coverage already in copy-number units (checked against complex.json: both medians are 2, and every
// cell's cov_slope / cov_intercept is 1 / 0). It is therefore plotted as is; slope and intercept are
// NOT applied on top of it. coverageToCn() exists for arrows that really hold raw counts.

export const COVERAGE_QUANTILE = 0.99; // robust to single outlier bins
export const RANGE_PAD = 0.1; // headroom above the tallest value
export const MIN_TOP = 2; // a flat diploid cell still shows 0-2 plus headroom

const finite = (v) => typeof v === "number" && Number.isFinite(v);

/** Coverage y to CN. inCn (the foregroundabs case) returns the values unchanged. */
export function coverageToCn(values, slope, intercept, inCn = true) {
  if (inCn) return Array.from(values);
  if (!finite(slope) || !finite(intercept)) return null; // no fit: counts are not CN
  return Array.from(values, (v) => v * slope + intercept);
}

/** Linear-interpolated quantile of the finite values (null when there are none). */
export function quantile(values, q) {
  const v = Array.from(values).filter(finite).sort((a, b) => a - b);
  if (!v.length) return null;
  const pos = Math.min(1, Math.max(0, q)) * (v.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}

const inView = (place, domains) => !domains || !domains.length || domains.some((d) => place >= d[0] && place <= d[1]);

/** Largest y of the graph intervals (startPlace / endPlace set) overlapping the view. */
export function graphMaxInView(intervals, domains) {
  let max = null;
  (intervals || []).forEach((it) => {
    if (!finite(it.y)) return;
    const hit = !domains || !domains.length || domains.some((d) => it.startPlace <= d[1] && it.endPlace >= d[0]);
    if (hit && (max === null || it.y > max)) max = it.y;
  });
  return max;
}

/** Coverage values (CN) whose genome place x lies in the view. */
export function coverageInView(x, y, domains) {
  const out = [];
  for (let i = 0; i < y.length; i += 1) if (inView(x[i], domains)) out.push(y[i]);
  return out;
}

/** The shared [0, top] CN range from the graph maximum and the coverage in view (null when neither exists). */
export function cellCnRange({ graphMax = null, coverage = null, quantileAt = COVERAGE_QUANTILE, pad = RANGE_PAD, minTop = MIN_TOP }) {
  const cov = coverage && coverage.length ? quantile(coverage, quantileAt) : null;
  const tops = [graphMax, cov].filter(finite);
  if (!tops.length) return null;
  return [0, Math.max(minTop, Math.max(...tops) * (1 + pad))];
}

/** A manual y-max wins over the auto range; non-positive or non-numeric overrides are ignored. */
export function effectiveRange(auto, override) {
  const top = Number(override);
  return Number.isFinite(top) && top > 0 ? [0, top] : auto;
}

/** ?ymax=<cell>:<max>,<cell>:<max> <-> { cell: max } */
export function parseYMax(value) {
  const out = {};
  String(value || "")
    .split(",")
    .forEach((pair) => {
      const at = pair.lastIndexOf(":");
      const top = Number(pair.slice(at + 1));
      if (at > 0 && Number.isFinite(top) && top > 0) out[pair.slice(0, at)] = top;
    });
  return out;
}
export const formatYMax = (map) =>
  Object.entries(map || {})
    .filter(([, top]) => Number.isFinite(top) && top > 0)
    .map(([cell, top]) => `${cell}:${Math.round(top * 100) / 100}`)
    .join(",");
