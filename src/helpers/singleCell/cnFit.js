// Per-cell purity / ploidy fit view (d3-free). coverage.arrow's y is copy number at the cell's fitted
// ploidy (purity 1), so y / mean(y) is the normalised segment mean m (mean 1) that the bulk binPlot uses.
// A (ploidy, purity) solution maps it to copy number as CN = slope * m + intercept with
// intercept = -(2 / purity - 2) and slope = ploidy - intercept (mean CN = ploidy at mean m = 1).

export const FIT_TOLERANCE = 0.25;

/** Slope / intercept of the solution for a ploidy and purity. */
export function solutionOf(ploidy, purity = 1) {
  if (!(ploidy > 0) || !(purity > 0 && purity <= 1)) return null;
  const intercept = -(2 / purity - 2);
  return { ploidy, purity, intercept, slope: ploidy - intercept };
}

/** Segment-mean position of copy state k under a solution. */
export const stateMean = (sol, k) => (k - sol.intercept) / sol.slope;

/** Copy number at segment mean m. */
export const cnAt = (sol, m) => sol.slope * m + sol.intercept;

/** Normalised segment means (mean 1) from fitted copy-number bins; non-finite and non-positive bins are dropped. */
export function normalise(y) {
  const keep = [];
  let sum = 0;
  for (let i = 0; i < y.length; i += 1) {
    const v = y[i];
    if (Number.isFinite(v) && v > 0) {
      keep.push(v);
      sum += v;
    }
  }
  if (!keep.length) return { m: [], mean: null };
  const mean = sum / keep.length;
  return { m: keep.map((v) => v / mean), mean };
}

/** Median of consecutive blocks of k values (e.g. 10 x 10 kb bins = 100 kb); a short last block is dropped. */
export function blockMedian(values, k) {
  if (k <= 1) return Array.from(values);
  const out = [];
  for (let i = 0; i + k <= values.length; i += k) {
    const block = Array.prototype.slice.call(values, i, i + k).filter(Number.isFinite).sort((a, b) => a - b);
    if (block.length) out.push(block[block.length >> 1]);
  }
  return out;
}

/** Bin counts of values on [lo, hi). */
export function histogram(values, lo, hi, nbins) {
  const counts = new Array(nbins).fill(0);
  const w = (hi - lo) / nbins;
  values.forEach((v) => {
    if (v >= lo && v < hi) counts[Math.floor((v - lo) / w)] += 1;
  });
  return { lo, hi, nbins, width: w, counts };
}

/** Fraction of segment means within tol of an integer copy number under a solution (chance level is 2 * tol = 0.5). */
export function integerFit(m, sol, tol = FIT_TOLERANCE) {
  if (!m.length || !sol) return null;
  let n = 0;
  for (let i = 0; i < m.length; i += 1) {
    const cn = cnAt(sol, m[i]);
    if (cn > -tol && Math.abs(cn - Math.round(cn)) < tol) n += 1;
  }
  return n / m.length;
}

/** integerFit across a ploidy range (purity fixed): [{ ploidy, fit }]. */
export function fitCurve(m, purity, lo = 1, hi = 6, step = 0.05, tol = FIT_TOLERANCE) {
  const out = [];
  for (let p = lo; p <= hi + 1e-9; p += step) {
    const sol = solutionOf(p, purity);
    out.push({ ploidy: Math.round(p * 1e4) / 1e4, fit: integerFit(m, sol, tol) });
  }
  return out;
}

/**
 * Allelic support of a solution. blocks: hetblocks.json blocks (observed phase-agnostic MAF per allelic-CN segment);
 * cn(block) the solution's total copy number there. Observed MAF is compared with the nearest achievable
 * minor / total (minor = 0..floor(total / 2)); returns the length-weighted mean absolute gap, the weighted
 * fraction of blocks within 0.1, and the number of blocks used. Blocks below minSnps or without a MAF are skipped.
 */
export function allelicFit(blocks, cn, { minSnps = 50 } = {}) {
  let wsum = 0;
  let gap = 0;
  let within = 0;
  let used = 0;
  (blocks || []).forEach((b) => {
    if (b.maf == null || !Number.isFinite(b.maf) || (b.n_snps_d2 ?? b.n_snps ?? 0) < minSnps) return;
    const total = Math.round(cn(b));
    if (!(total >= 1)) return;
    let best = Infinity;
    for (let minor = 0; minor <= Math.floor(total / 2); minor += 1) best = Math.min(best, Math.abs(b.maf - minor / total));
    const w = Math.max(1, (b.x1 ?? b.end) - (b.x0 ?? b.start) + 1);
    wsum += w;
    gap += w * best;
    within += best <= 0.1 ? w : 0;
    used += 1;
  });
  return used ? { gap: gap / wsum, within: within / wsum, blocks: used } : null;
}

/** Length-weighted mean of the coverage bins (x sorted ascending, y copy number) falling in [x0, x1]. */
export function blockMeanCn(xs, ys, x0, x1) {
  let lo = 0;
  let hi = xs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] < x0) lo = mid + 1;
    else hi = mid;
  }
  let sum = 0;
  let n = 0;
  for (let i = lo; i < xs.length && xs[i] <= x1; i += 1) {
    if (Number.isFinite(ys[i])) {
      sum += ys[i];
      n += 1;
    }
  }
  return n ? sum / n : null;
}

/** JaBbA segments (complex.json intervals) as length-weighted segment means under the fitted solution. */
export function segmentMeans(intervals, fitSol) {
  return (intervals || [])
    .filter((i) => Number.isFinite(i.y))
    .map((i) => ({ m: (i.y - fitSol.intercept) / fitSol.slope, w: Math.max(1, i.endPoint - i.startPoint + 1) }));
}

/** Weighted histogram (fractions summing to 1) of {m, w} points. */
export function weightedHistogram(points, lo, hi, nbins) {
  const out = new Array(nbins).fill(0);
  const wd = (hi - lo) / nbins;
  let tot = 0;
  points.forEach(({ m, w }) => {
    tot += w;
    if (m >= lo && m < hi) out[Math.floor((m - lo) / wd)] += w;
  });
  return tot ? out.map((v) => v / tot) : out;
}

/** Element-wise mean of equally long normalised segment-mean arrays (one per cell); cells of another length are skipped. */
export function poolNormalised(arrays) {
  const usable = arrays.filter((a) => a && a.length);
  if (!usable.length) return { m: [], used: 0, skipped: arrays.length };
  const len = usable[0].length;
  const same = usable.filter((a) => a.length === len);
  const m = new Array(len).fill(0);
  same.forEach((a) => {
    for (let i = 0; i < len; i += 1) m[i] += a[i] / same.length;
  });
  return { m, used: same.length, skipped: arrays.length - same.length };
}

/**
 * Pools cells by genomic bin position: cells = [{ x, y }] with y copy number at bin position x (bins dropped as
 * non-finite differ between cells). A bin is kept when at least minFrac of the cells have it; its value is the mean of
 * the cells' normalised segment means. Returns { x, m } sorted by x, renormalised to mean 1, plus the cells used.
 */
export function poolByPosition(cells, minFrac = 0.6) {
  const acc = new Map();
  let used = 0;
  cells.forEach((c) => {
    const { m, mean } = normaliseKeep(c.y);
    if (mean == null) return;
    used += 1;
    for (let i = 0; i < c.x.length; i += 1) {
      if (m[i] == null) continue;
      const e = acc.get(c.x[i]);
      if (e) {
        e[0] += m[i];
        e[1] += 1;
      } else acc.set(c.x[i], [m[i], 1]);
    }
  });
  const x = [];
  const raw = [];
  [...acc.keys()].sort((a, b) => a - b).forEach((k) => {
    const [sum, n] = acc.get(k);
    if (n >= minFrac * used) {
      x.push(k);
      raw.push(sum / n);
    }
  });
  const mean = raw.length ? raw.reduce((a, b) => a + b, 0) / raw.length : null;
  return { x, m: mean ? raw.map((v) => v / mean) : [], used };
}

// normalised means aligned with the input (null where the bin is invalid)
function normaliseKeep(y) {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < y.length; i += 1) if (Number.isFinite(y[i]) && y[i] > 0) { sum += y[i]; n += 1; }
  if (!n) return { m: [], mean: null };
  const mean = sum / n;
  return { m: Array.from(y, (v) => (Number.isFinite(v) && v > 0 ? v / mean : null)), mean };
}

/** n ids spread evenly through a list (all of them when n >= length). */
export function evenSample(ids, n) {
  if (ids.length <= n) return [...ids];
  return Array.from({ length: n }, (_, i) => ids[Math.floor((i * ids.length) / n)]);
}

const quantile = (sorted, q) => {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (pos - lo);
};

/** Ploidy summary of a group of cells: n, median, quartiles, min, max and the fraction at or above hiCut. */
export function ploidySummary(cells, hiCut = 2.4) {
  const v = cells.map((c) => Number(c.ploidy)).filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return { n: 0, median: null, q1: null, q3: null, min: null, max: null, fracHigh: null };
  return {
    n: v.length,
    median: quantile(v, 0.5),
    q1: quantile(v, 0.25),
    q3: quantile(v, 0.75),
    min: v[0],
    max: v[v.length - 1],
    fracHigh: v.filter((x) => x >= hiCut).length / v.length,
  };
}

/**
 * Clades to offer in the fit view, highest median ploidy first. clades: clades.json clades ({ id, cells }),
 * cells: redux cells ({ cell_id, ploidy }). Trunk-sized clades (> maxFrac of the patient) and clades under minCells
 * are skipped. Each row also carries the ploidy summary of the rest of the patient.
 */
export function cladePloidyRows(clades, cells, { minCells = 5, maxFrac = 0.8 } = {}) {
  const byId = new Map(cells.map((c) => [c.cell_id, c]));
  return (clades || [])
    .map((cl) => {
      const members = (cl.cells || []).map((id) => byId.get(id)).filter(Boolean);
      const inSet = new Set(members.map((c) => c.cell_id));
      return {
        id: cl.id,
        cells: members.map((c) => c.cell_id),
        summary: ploidySummary(members),
        rest: ploidySummary(cells.filter((c) => !inSet.has(c.cell_id))),
      };
    })
    .filter((r) => r.cells.length >= minCells && r.cells.length <= maxFrac * cells.length && r.summary.median != null)
    .sort((a, b) => b.summary.median - a.summary.median);
}
