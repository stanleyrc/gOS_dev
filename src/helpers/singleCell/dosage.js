// Copy number vs expression in the same cells: CN at a gene's locus from each
// cell's genome graph (the CN heatmap rows), expression from the RNA matrix.
import { binAt } from "./matrix";

/** A gene's position in genome (global) coordinates from the Genes store, or null. */
export function geneLocus(genesState, gene) {
  const { optionsList = [], genesStartPoint = [], genesEndPoint = [] } = genesState || {};
  const upper = `${gene || ""}`.toUpperCase();
  const option = optionsList.find((o) => `${o.label}`.toUpperCase() === upper);
  if (!option) return null;
  const start = Number(genesStartPoint[option.value]);
  const end = Number(genesEndPoint[option.value]);
  return Number.isFinite(start) && Number.isFinite(end) ? { gene: option.label, start, end, mid: (start + end) / 2 } : null;
}

/** Map cell id -> total CN at a global position, for cells with a genome graph. */
export function cnAtPosition(cn, position) {
  const out = new Map();
  if (!cn || position == null) return out;
  cn.cells.forEach((id, k) => {
    const row = cn.rows[k];
    if (!row) return;
    const b = binAt(row.binIndex, position);
    if (b >= 0 && Number.isFinite(row.values[b])) out.set(id, row.values[b]);
  });
  return out;
}

const ranks = (v) => {
  const order = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(v.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j += 1;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) r[order[k][1]] = avg;
    i = j + 1;
  }
  return r;
};

/** Pearson correlation; NaN when either side is constant. */
export function pearson(x, y) {
  const n = x.length;
  if (n < 3) return NaN;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i += 1) {
    mx += x[i];
    my += y[i];
  }
  mx /= n;
  my /= n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
}

export const spearman = (x, y) => pearson(ranks(x), ranks(y));

/** Least-squares slope of y on x (expression per copy). */
export function slope(x, y) {
  const n = x.length;
  if (n < 2) return NaN;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i += 1) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
  }
  return sxx ? sxy / sxx : NaN;
}

/**
 * Paired CN / expression for one gene: points {id, cn, expr} for cells with both,
 * plus Spearman rho and slope.
 */
export function dosagePoints({ cn, summary, matrix, rowOfId, locus, geneIndex }) {
  if (!cn || !summary || !matrix || !locus || geneIndex == null) return { points: [], rho: NaN, slope: NaN };
  const cnOf = cnAtPosition(cn, locus.mid);
  const a = matrix.indptr[geneIndex];
  const b = matrix.indptr[geneIndex + 1];
  const expr = new Float32Array(summary.cells.length);
  for (let k = a; k < b; k += 1) expr[matrix.indices[k]] = matrix.data[k];
  const points = [];
  cnOf.forEach((value, id) => {
    const r = rowOfId.get(id);
    if (r != null) points.push({ id, cn: value, expr: expr[r] });
  });
  const x = points.map((p) => p.cn);
  const y = points.map((p) => p.expr);
  return { points, rho: spearman(x, y), slope: slope(x, y) };
}

/**
 * Genome-wide dosage sensitivity: Spearman rho between CN at each gene's locus
 * and its expression across cells with both, for genes expressed in at least
 * minCells cells. Sorted by rho (most dosage-sensitive first).
 */
export async function dosageRanking({ cn, summary, matrix, rowOfId, genesState, minCells = 10, onProgress = null }) {
  const out = [];
  const lookup = new Map((genesState?.optionsList || []).map((o) => [`${o.label}`.toUpperCase(), o.value]));
  // pair each DNA cell with its RNA row once
  const pairs = [];
  cn.cells.forEach((id, k) => {
    const r = rowOfId.get(id);
    if (r != null && cn.rows[k]) pairs.push({ k, r });
  });
  if (pairs.length < 5) return out;
  const expr = new Float32Array(summary.cells.length);
  for (let g = 0; g < summary.genes.length; g += 1) {
    const i = lookup.get(`${summary.genes[g]}`.toUpperCase());
    if (i != null) {
      const a = matrix.indptr[g];
      const b = matrix.indptr[g + 1];
      if (b - a >= minCells) {
        const mid = (Number(genesState.genesStartPoint[i]) + Number(genesState.genesEndPoint[i])) / 2;
        expr.fill(0);
        for (let k = a; k < b; k += 1) expr[matrix.indices[k]] = matrix.data[k];
        const x = [];
        const y = [];
        pairs.forEach(({ k, r }) => {
          const row = cn.rows[k];
          const bin = binAt(row.binIndex, mid);
          if (bin >= 0 && Number.isFinite(row.values[bin])) {
            x.push(row.values[bin]);
            y.push(expr[r]);
          }
        });
        const rho = spearman(x, y);
        if (Number.isFinite(rho)) out.push({ gene: summary.genes[g], rho, slope: slope(x, y), n: x.length, meanCn: x.reduce((s, v) => s + v, 0) / x.length });
      }
    }
    if (onProgress && g % 2000 === 1999) {
      onProgress((g + 1) / summary.genes.length);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  if (onProgress) onProgress(1);
  return out.sort((p, q) => q.rho - p.rho);
}
