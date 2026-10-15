// Continuous TMB-vs-y views (d3-free): z-scoring, running-median trend with band, quantile bins with 95% CI,
// Spearman rho, and the per-patient / pooled panels for the TMB associations card.

const finite = (v) => typeof v === "number" && Number.isFinite(v);
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

export function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** z-scores of the finite values (population sd); a constant vector gives zeros. */
export function zscore(values) {
  const v = values.filter(finite);
  if (!v.length) return values.map(() => NaN);
  const m = mean(v);
  const sd = Math.sqrt(mean(v.map((x) => (x - m) ** 2)));
  return values.map((x) => (!finite(x) ? NaN : sd > 0 ? (x - m) / sd : 0));
}

function ranks(values) {
  const idx = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const out = new Array(values.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j += 1;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) out[idx[k][1]] = r;
    i = j + 1;
  }
  return out;
}

/** Spearman rho of paired values (NaN when fewer than 4 pairs or a constant vector). */
export function spearman(x, y) {
  const keep = x.map((_, i) => i).filter((i) => finite(x[i]) && finite(y[i]));
  if (keep.length < 4) return NaN;
  const rx = ranks(keep.map((i) => x[i]));
  const ry = ranks(keep.map((i) => y[i]));
  const mx = mean(rx);
  const my = mean(ry);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  rx.forEach((a, i) => {
    sxy += (a - mx) * (ry[i] - my);
    sxx += (a - mx) ** 2;
    syy += (ry[i] - my) ** 2;
  });
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
}

/**
 * Running median of y over x-ordered points: for each of `grid` x positions the median (and 25-75% band) of the
 * `span` fraction of points nearest in x rank. Returns [] with fewer than 8 points.
 */
export function runningMedian(points, { span = 0.4, grid = 24 } = {}) {
  const pts = points.filter((p) => finite(p.x) && finite(p.y)).sort((a, b) => a.x - b.x);
  const n = pts.length;
  if (n < 8) return [];
  const k = Math.max(5, Math.round(span * n));
  const out = [];
  for (let g = 0; g < grid; g += 1) {
    const center = Math.round((g / (grid - 1)) * (n - 1));
    const lo = Math.max(0, Math.min(n - k, center - Math.floor(k / 2)));
    const win = pts.slice(lo, lo + k);
    const ys = win.map((p) => p.y).sort((a, b) => a - b);
    out.push({ x: pts[center].x, y: quantile(ys, 0.5), lo: quantile(ys, 0.25), hi: quantile(ys, 0.75) });
  }
  return out;
}

/** Equal-count quantile bins of x (`k` of them, fewer when n is small): mean x, mean y and a 95% CI (1.96 se) of y. */
export function quantileBins(points, k = 5) {
  const pts = points.filter((p) => finite(p.x) && finite(p.y)).sort((a, b) => a.x - b.x);
  const n = pts.length;
  const bins = Math.max(0, Math.min(k, Math.floor(n / 3)));
  const out = [];
  for (let b = 0; b < bins; b += 1) {
    const win = pts.slice(Math.floor((b * n) / bins), Math.floor(((b + 1) * n) / bins));
    const ys = win.map((p) => p.y);
    const m = mean(ys);
    const sd = ys.length > 1 ? Math.sqrt(ys.reduce((s, v) => s + (v - m) ** 2, 0) / (ys.length - 1)) : 0;
    const ci = (1.96 * sd) / Math.sqrt(ys.length);
    out.push({ bin: b + 1, n: ys.length, x: mean(win.map((p) => p.x)), y: m, lo: m - ci, hi: m + ci });
  }
  return out;
}

/**
 * Panels for "y against TMB": one per patient plus a pooled panel in which both axes are z-scored within patient.
 * `doc` is tmb_associations.json; `yByPatient` is { patient: { cellId: value } } (gene expression) or null to read the
 * covariate column `covariate` from doc.cells. Cells without a finite x or y are dropped.
 */
export function curvePanels(doc, measure, { covariate = null, yByPatient = null, excludeNoisy = false, bins = 5 } = {}) {
  const panels = [];
  const pooled = [];
  for (const [patient, cols] of Object.entries(doc?.cells || {})) {
    if (excludeNoisy && doc.patients?.[patient]?.noisy) continue;
    const xs = cols[measure];
    if (!xs) continue;
    const ys = yByPatient ? (cols.cell || []).map((c) => yByPatient[patient]?.[c]) : cols[covariate] || cols[`bin: ${covariate}`];
    if (!ys) continue;
    const pts = [];
    xs.forEach((x, i) => finite(x) && finite(ys[i]) && pts.push({ patient, cell: cols.cell?.[i], state: cols.state?.[i], x, y: ys[i] }));
    if (!pts.length) continue;
    const zx = zscore(pts.map((p) => p.x));
    const zy = zscore(pts.map((p) => p.y));
    const z = pts.map((p, i) => ({ ...p, x: zx[i], y: zy[i], rawX: p.x, rawY: p.y }));
    panels.push({ patient, points: pts, n: pts.length, rho: spearman(pts.map((p) => p.x), pts.map((p) => p.y)), trend: runningMedian(pts), bins: quantileBins(pts, bins) });
    pooled.push(z);
  }
  const all = pooled.flat();
  const pooledPanel = all.length
    ? { patient: "Pooled (z within patient)", pooled: true, points: all, n: all.length, rho: spearman(all.map((p) => p.x), all.map((p) => p.y)), trend: runningMedian(all), bins: [], byPatient: pooled.map((z) => ({ patient: z[0].patient, bins: quantileBins(z, bins) })) }
    : null;
  return { panels, pooled: pooledPanel };
}

/** Per-patient partial rho of a gene (from the exported gene table rows) or of a covariate (forest row dots), for the panel labels. */
export function partialRhoLookup(doc, { gene = null, covariate = null, measure, adjust }) {
  if (gene) {
    const g = doc?.genes?.[`${measure}|${adjust}`];
    const row = [...(g?.up || []), ...(g?.down || [])].find((r) => r.gene === gene);
    return row ? { per: row.per || {}, combined: { mean_r: row.mean_r, p: row.p, q: row.q } } : null;
  }
  const row = (doc?.numeric || []).find((r) => r.covariate === covariate && r.measure === measure && r.adjust === adjust);
  if (!row) return null;
  return { per: Object.fromEntries(Object.entries(row.per_patient || {}).map(([p, t]) => [p, t.r])), combined: row.combined };
}
