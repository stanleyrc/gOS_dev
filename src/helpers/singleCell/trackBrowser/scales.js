// Vertical scales of the stacked rows (CN shared across units so rows compare directly). d3-free (jest).

/** Fraction of the row height (0 bottom .. 1 top) for a CN, linear or log (log1p) up to cnMax; clipped to [0, 1]. */
export function cnFrac(cn, cnMax, scale = "linear") {
  if (!Number.isFinite(cn) || !(cnMax > 0)) return 0;
  const v = Math.max(0, cn);
  const f = scale === "log" ? Math.log1p(v) / Math.log1p(cnMax) : v / cnMax;
  return Math.min(1, f);
}

const LOG_STEPS = [0, 1, 2, 3, 5, 10, 20, 50, 100, 200, 500, 1000];
/** CN tick values for a row: nice linear ticks, or log steps, at most `count` + 1 of them, all <= cnMax. */
export function cnTicks(cnMax, scale = "linear", count = 3) {
  if (!(cnMax > 0)) return [0];
  if (scale === "log") {
    const steps = LOG_STEPS.filter((v) => v <= cnMax);
    if (steps.length <= count + 1) return steps;
    const keep = [steps[0]];
    const stride = (steps.length - 1) / count;
    for (let k = 1; k <= count; k += 1) keep.push(steps[Math.round(k * stride)]);
    return [...new Set(keep)];
  }
  const raw = cnMax / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) || 10 * pow;
  const out = [];
  for (let v = 0; v <= cnMax + 1e-9; v += step) out.push(Number(v.toPrecision(6)));
  return out;
}

/** Auto y max: a high quantile of the per-unit maxima, rounded up to a readable value, at least `floor`. */
export function autoCnMax(unitMaxima, q = 0.9, floor = 4) {
  const v = (unitMaxima || []).filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (!v.length) return floor;
  const top = v[Math.min(v.length - 1, Math.floor(q * (v.length - 1)))];
  const pow = 10 ** Math.floor(Math.log10(top));
  const nice = [1, 1.5, 2, 3, 5, 7.5, 10].map((m) => m * pow).find((s) => s >= top) || 10 * pow;
  return Math.max(floor, nice);
}

/** Visible row range of a virtualized stack: [first, last] (inclusive) with `pad` extra rows each side. */
export function visibleRows(scrollTop, viewHeight, rowHeight, nRows, pad = 0) {
  if (!nRows || rowHeight <= 0) return [0, -1];
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - pad);
  const last = Math.min(nRows - 1, Math.ceil((scrollTop + viewHeight) / rowHeight) + pad);
  return [first, last];
}
