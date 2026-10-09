// Non-tumour cells as internal controls: the noise floor of per-cell metrics
// in diploid normal cells (e.g. fraction of the genome called altered in a
// normal cell = false-positive copy-number rate), and tumour cells whose
// expression looks like the non-malignant cells (infiltrating tumour cells
// that would be missed by RNA alone). d3-free.
import { binAt } from "./matrix";

const median = (v) => {
  const s = v.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return NaN;
  const k = s.length >> 1;
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
};

/** Fraction of the autosomal genome (1 Mb grid) whose CN differs from the cell's baseline by >= 1: Map cellId -> fraction. */
export function alteredFraction(cn, chromoBins, { step = 1e6 } = {}) {
  const out = new Map();
  if (!cn?.cells) return out;
  const grid = [];
  Object.keys(chromoBins)
    .filter((c) => /^(chr)?[0-9]{1,2}$/.test(c))
    .forEach((c) => {
      for (let g = chromoBins[c].startPlace + step / 2; g < chromoBins[c].endPlace; g += step) grid.push(g);
    });
  cn.cells.forEach((id, k) => {
    const row = cn.rows[k];
    if (!row) return;
    const v = grid.map((g) => {
      const b = binAt(row.binIndex, g);
      return b >= 0 ? row.values[b] : NaN;
    });
    const base = Math.round(median(v));
    const ok = v.filter(Number.isFinite);
    if (!ok.length) return;
    out.set(`${id}`, ok.filter((x) => Math.abs(x - base) >= 1).length / ok.length);
  });
  return out;
}

/** Median of each metric in normal and tumour cells: [{ key, normal, tumour, nNormal, nTumour }]. */
export function noiseFloor(cells, metrics, isNormal) {
  return metrics.map(({ key, label, get }) => {
    const val = get || ((c) => c[key]);
    const nv = cells.filter(isNormal).map(val).filter((x) => x != null && Number.isFinite(+x)).map(Number);
    const tv = cells.filter((c) => !isNormal(c)).map(val).filter((x) => x != null && Number.isFinite(+x)).map(Number);
    return { key, label: label || key, normal: median(nv), tumour: median(tv), nNormal: nv.length, nTumour: tv.length };
  });
}

const pearson = (a, b) => {
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i += 1) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let s = 0;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < n; i += 1) {
    s += (a[i] - ma) * (b[i] - mb);
    sa += (a[i] - ma) ** 2;
    sb += (b[i] - mb) ** 2;
  }
  return sa && sb ? s / Math.sqrt(sa * sb) : NaN;
};

/**
 * Normal-likeness of query cells: Pearson r of each cell's expression profile
 * (rows of X, nGenes columns) with the centroid of the reference normal rows
 * and of the malignant rows (the cell itself left out of its own centroid).
 * Returns [{ row, rNormal, rTumour, score: rNormal - rTumour }].
 */
export function normalLikeness(X, nGenes, normalRows, tumourRows, queryRows) {
  const centroid = (rows, skip = -1) => {
    const c = new Float64Array(nGenes);
    let k = 0;
    rows.forEach((r) => {
      if (r === skip) return;
      for (let j = 0; j < nGenes; j += 1) c[j] += X[r * nGenes + j];
      k += 1;
    });
    for (let j = 0; j < nGenes; j += 1) c[j] /= Math.max(1, k);
    return c;
  };
  const cn = centroid(normalRows);
  const ct = centroid(tumourRows);
  const tumourSet = new Set(tumourRows);
  return queryRows.map((r) => {
    const x = X.subarray(r * nGenes, (r + 1) * nGenes);
    const t = tumourSet.has(r) ? centroid(tumourRows, r) : ct;
    const rNormal = pearson(x, cn);
    const rTumour = pearson(x, t);
    return { row: r, rNormal, rTumour, score: rNormal - rTumour };
  });
}

/**
 * Normal-neighbourhood fraction: for each query row, the share of its k nearest
 * reference rows (P = [dims][nCells], e.g. expression PCs; the cell itself
 * excluded) that are normal. Robust where centroid correlations of sparse
 * single-cell profiles are near zero for everyone.
 */
export function normalNeighbourFraction(P, normalRows, tumourRows, queryRows, k = 15) {
  const normal = new Set(normalRows);
  const ref = [...normalRows, ...tumourRows];
  const d2 = (a, b) => {
    let s = 0;
    for (let d = 0; d < P.length; d += 1) s += (P[d][a] - P[d][b]) ** 2;
    return s;
  };
  return queryRows.map((q) => {
    const near = ref
      .filter((r) => r !== q)
      .map((r) => [d2(q, r), r])
      .sort((x, y) => x[0] - y[0])
      .slice(0, k);
    const nNormal = near.filter(([, r]) => normal.has(r)).length;
    return { row: q, fraction: near.length ? nNormal / near.length : NaN, k: near.length };
  });
}
