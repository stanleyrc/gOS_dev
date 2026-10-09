// In-browser RNA statistics on a patient's static rna/ matrix (gene-major
// sparse, see staticRna.js): two-group differential expression matching
// Seurat FindMarkers' defaults, over-representation enrichment, and kernel
// densities for violin plots. Hundreds of cells x ~25k genes run in about a
// second, so no analysis service is needed for these.

/* ----------------------------------------------------------------------- */
/* Distributions                                                            */
/* ----------------------------------------------------------------------- */

/** Complementary error function (W. J. Cody's rational approximations via erfcx-free form). */
export function erfc(x) {
  // Numerical Recipes erfcc: fractional error < 1.2e-7 everywhere.
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t * (1.00002368 +
          t * (0.37409196 +
            t * (0.09678418 +
              t * (-0.18628806 +
                t * (0.27886807 +
                  t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))
    );
  return x >= 0 ? r : 2 - r;
}

/** Two-sided normal p-value for a z score. */
export const twoSidedP = (z) => Math.min(1, erfc(Math.abs(z) / Math.SQRT2));

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
];
export function logGamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  const y = x - 1;
  let a = LANCZOS[0];
  const t = y + 7.5;
  for (let i = 1; i < 9; i += 1) a += LANCZOS[i] / (y + i);
  return 0.5 * Math.log(2 * Math.PI) + (y + 0.5) * Math.log(t) - t + Math.log(a);
}
const logChoose = (n, k) => logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);

/** P(X >= k) for X ~ Hypergeometric(population N, successes K, draws n). */
export function hypergeomUpper(k, N, K, n) {
  if (k <= 0) return 1;
  const hi = Math.min(K, n);
  if (k > hi) return 0;
  const denom = logChoose(N, n);
  let p = 0;
  for (let i = k; i <= hi; i += 1) p += Math.exp(logChoose(K, i) + logChoose(N - K, n - i) - denom);
  return Math.min(1, p);
}

/** Benjamini-Hochberg q-values, in input order. */
export function benjaminiHochberg(pvals) {
  const n = pvals.length;
  const order = pvals.map((p, i) => i).sort((a, b) => pvals[b] - pvals[a]);
  const q = new Array(n);
  let running = 1;
  order.forEach((i, rank) => {
    running = Math.min(running, (pvals[i] * n) / (n - rank));
    q[i] = running;
  });
  return q;
}

/* ----------------------------------------------------------------------- */
/* Differential expression                                                  */
/* ----------------------------------------------------------------------- */

/**
 * Wilcoxon rank-sum statistic for one gene from its non-zero values.
 * aVals/bVals: non-zero values in each group; nA/nB: group sizes (zeros are
 * implied). Normal approximation with tie and continuity correction, as R's
 * wilcox.test(exact = FALSE) that Seurat uses.
 */
export function wilcoxonFromNonzero(aVals, bVals, nA, nB) {
  const N = nA + nB;
  const zeros = N - aVals.length - bVals.length;
  const merged = [];
  aVals.forEach((v) => merged.push([v, 1]));
  bVals.forEach((v) => merged.push([v, 0]));
  merged.sort((x, y) => x[0] - y[0]);
  let rankA = (nA - aVals.length) * ((zeros + 1) / 2);
  let ties = zeros > 1 ? zeros ** 3 - zeros : 0;
  let i = 0;
  while (i < merged.length) {
    let j = i;
    while (j + 1 < merged.length && merged[j + 1][0] === merged[i][0]) j += 1;
    const avg = zeros + (i + j) / 2 + 1;
    const count = j - i + 1;
    for (let k = i; k <= j; k += 1) if (merged[k][1]) rankA += avg;
    if (count > 1) ties += count ** 3 - count;
    i = j + 1;
  }
  const U = rankA - (nA * (nA + 1)) / 2;
  const mu = (nA * nB) / 2;
  const sigma = Math.sqrt(((nA * nB) / 12) * (N + 1 - ties / (N * (N - 1))));
  if (!(sigma > 0)) return { U, p: 1, z: 0 };
  const d = U - mu;
  const z = (d - 0.5 * Math.sign(d)) / sigma;
  return { U, p: twoSidedP(z), z };
}

export const yieldToBrowser = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Two-group DE over every gene (Seurat FindMarkers defaults): Wilcoxon test,
 * avg_log2FC = log2((sum(expm1(A)) + 1) / nA) - log2((sum(expm1(B)) + 1) / nB)
 * (Seurat v5: the pseudocount is added to the sum, before dividing),
 * genes kept when either group has >= minPct cells expressing them.
 * p_val_adj is Bonferroni over all genes (as Seurat); q_val is BH over tested.
 * idxA / idxB: matrix row (RNA cell) indices.
 */
export async function differentialExpression(matrix, genes, nCells, idxA, idxB, options = {}) {
  const { minPct = 0.01, onProgress = null, chunk = 1500 } = options;
  const group = new Int8Array(nCells);
  idxA.forEach((i) => (group[i] = 1));
  idxB.forEach((i) => (group[i] = 2));
  const nA = idxA.length;
  const nB = idxB.length;
  const rows = [];
  for (let g = 0; g < genes.length; g += 1) {
    const aVals = [];
    const bVals = [];
    let sumA = 0;
    let sumB = 0;
    for (let k = matrix.indptr[g]; k < matrix.indptr[g + 1]; k += 1) {
      const which = group[matrix.indices[k]];
      const v = matrix.data[k];
      if (which === 1) {
        aVals.push(v);
        sumA += Math.expm1(v);
      } else if (which === 2) {
        bVals.push(v);
        sumB += Math.expm1(v);
      }
    }
    const pct1 = aVals.length / nA;
    const pct2 = bVals.length / nB;
    if (Math.max(pct1, pct2) >= minPct) {
      const { p } = wilcoxonFromNonzero(aVals, bVals, nA, nB);
      rows.push({
        gene: genes[g],
        avg_log2FC: Math.log2((sumA + 1) / nA) - Math.log2((sumB + 1) / nB),
        pct_1: pct1,
        pct_2: pct2,
        p_val: p,
      });
    }
    if (g % chunk === chunk - 1) {
      if (onProgress) onProgress((g + 1) / genes.length);
      await yieldToBrowser();
    }
  }
  const q = benjaminiHochberg(rows.map((r) => r.p_val));
  rows.forEach((r, k) => {
    r.p_val_adj = Math.min(1, r.p_val * genes.length);
    r.q_val = q[k];
  });
  rows.sort((a, b) => a.p_val - b.p_val || Math.abs(b.avg_log2FC) - Math.abs(a.avg_log2FC));
  if (onProgress) onProgress(1);
  return rows;
}

/* ----------------------------------------------------------------------- */
/* Gene sets                                                                */
/* ----------------------------------------------------------------------- */

/** GMT text -> [{ term, genes }] */
export function parseGmt(text) {
  return `${text || ""}`
    .split(/\r?\n/)
    .map((line) => line.split("\t"))
    .filter((f) => f.length > 2 && f[0])
    .map((f) => ({ term: f[0], genes: [...new Set(f.slice(2).filter(Boolean))] }));
}

/**
 * Over-representation of `selected` genes within `universe` for each set:
 * hypergeometric upper tail, BH across sets tested (>= minSize genes in the
 * universe), sorted by p.
 */
export function overRepresentation(selected, universe, sets, { minSize = 5, maxSize = 1000 } = {}) {
  const uni = new Set(universe);
  const sel = new Set(selected.filter((g) => uni.has(g)));
  const N = uni.size;
  const n = sel.size;
  const rows = [];
  sets.forEach(({ term, genes }) => {
    const inUni = genes.filter((g) => uni.has(g));
    if (inUni.length < minSize || inUni.length > maxSize) return;
    const hits = inUni.filter((g) => sel.has(g));
    rows.push({
      term,
      size: inUni.length,
      overlap: hits.length,
      expected: (n * inUni.length) / N,
      p_val: hypergeomUpper(hits.length, N, inUni.length, n),
      genes: hits,
    });
  });
  const q = benjaminiHochberg(rows.map((r) => r.p_val));
  rows.forEach((r, k) => (r.q_val = q[k]));
  return rows.sort((a, b) => a.p_val - b.p_val);
}

/* ----------------------------------------------------------------------- */
/* Violin densities                                                         */
/* ----------------------------------------------------------------------- */

/** Gaussian KDE evaluated on `points`, Silverman bandwidth (floored). */
export function kernelDensity(values, points, minBandwidth = 0.05) {
  const n = values.length;
  if (!n) return points.map(() => 0);
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, n - 1));
  const sorted = [...values].sort((a, b) => a - b);
  const q = (f) => sorted[Math.min(n - 1, Math.floor(f * (n - 1)))];
  const iqr = q(0.75) - q(0.25);
  const spread = Math.min(sd || Infinity, iqr > 0 ? iqr / 1.34 : Infinity);
  const h = Math.max(minBandwidth, 0.9 * (Number.isFinite(spread) ? spread : sd || 1) * n ** -0.2);
  const norm = 1 / (n * h * Math.sqrt(2 * Math.PI));
  return points.map((x) => {
    let s = 0;
    for (let i = 0; i < n; i += 1) {
      const u = (x - values[i]) / h;
      s += Math.exp(-0.5 * u * u);
    }
    return s * norm;
  });
}

/** Median and quartiles of a numeric array. */
export function quartiles(values) {
  const s = [...values].sort((a, b) => a - b);
  const at = (f) => {
    if (!s.length) return NaN;
    const pos = (s.length - 1) * f;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return s[lo] + (s[hi] - s[lo]) * (pos - lo);
  };
  return { q1: at(0.25), median: at(0.5), q3: at(0.75) };
}

/* ----------------------------------------------------------------------- */
/* Quick clustering: PCA on scaled genes, k-means on PC scores              */
/* ----------------------------------------------------------------------- */

/** Cells x genes matrix of z-scored (clipped at ±10) log-normalized values. */
export function scaledExpression(matrix, geneIdx, nCells) {
  const X = new Float32Array(nCells * geneIdx.length);
  geneIdx.forEach((g, j) => {
    const col = new Float32Array(nCells);
    for (let k = matrix.indptr[g]; k < matrix.indptr[g + 1]; k += 1) col[matrix.indices[k]] = matrix.data[k];
    let mean = 0;
    col.forEach((v) => (mean += v));
    mean /= nCells;
    let sd = 0;
    col.forEach((v) => (sd += (v - mean) ** 2));
    sd = Math.sqrt(sd / Math.max(1, nCells - 1)) || 1;
    for (let i = 0; i < nCells; i += 1) X[i * geneIdx.length + j] = Math.max(-10, Math.min(10, (col[i] - mean) / sd));
  });
  return X;
}

/**
 * Top principal components of a cells x genes matrix via the cells x cells
 * Gram matrix and power iteration (fast when cells << genes).
 * Returns { scores: [Float64Array(nCells)] per PC, values: eigenvalues }.
 */
export function pca(X, nCells, nGenes, nPcs = 10, iterations = 120) {
  const K = new Float64Array(nCells * nCells);
  for (let a = 0; a < nCells; a += 1) {
    for (let b = a; b < nCells; b += 1) {
      let s = 0;
      const oa = a * nGenes;
      const ob = b * nGenes;
      for (let j = 0; j < nGenes; j += 1) s += X[oa + j] * X[ob + j];
      K[a * nCells + b] = s;
      K[b * nCells + a] = s;
    }
  }
  // Double-centre the Gram matrix (genes are centred already; this is safe).
  const vectors = [];
  const values = [];
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
  for (let p = 0; p < Math.min(nPcs, nCells - 1); p += 1) {
    let v = Float64Array.from({ length: nCells }, rand);
    let lambda = 0;
    for (let it = 0; it < iterations; it += 1) {
      const w = new Float64Array(nCells);
      for (let a = 0; a < nCells; a += 1) {
        let s = 0;
        const o = a * nCells;
        for (let b = 0; b < nCells; b += 1) s += K[o + b] * v[b];
        w[a] = s;
      }
      vectors.forEach((u) => {
        let d = 0;
        for (let a = 0; a < nCells; a += 1) d += w[a] * u[a];
        for (let a = 0; a < nCells; a += 1) w[a] -= d * u[a];
      });
      let norm = 0;
      w.forEach((x) => (norm += x * x));
      norm = Math.sqrt(norm) || 1;
      lambda = norm;
      v = w.map((x) => x / norm);
    }
    vectors.push(v);
    values.push(lambda);
  }
  const scores = vectors.map((u, p) => u.map((x) => x * Math.sqrt(values[p])));
  return { scores, values };
}

/** k-means (k-means++ init, deterministic) on points = [dims][n]; returns labels 0..k-1. */
export function kmeans(points, k, iterations = 60) {
  const dims = points.length;
  const n = points[0]?.length || 0;
  if (!n || k < 1) return new Int32Array(n);
  let seed = 11;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const dist = (i, c) => {
    let s = 0;
    for (let d = 0; d < dims; d += 1) s += (points[d][i] - c[d]) ** 2;
    return s;
  };
  const centres = [Array.from({ length: dims }, (_, d) => points[d][Math.floor(rand() * n)])];
  while (centres.length < k) {
    const d2 = Array.from({ length: n }, (_, i) => Math.min(...centres.map((c) => dist(i, c))));
    const total = d2.reduce((s, x) => s + x, 0);
    let r = rand() * total;
    let pick = 0;
    for (; pick < n - 1 && r > d2[pick]; pick += 1) r -= d2[pick];
    centres.push(Array.from({ length: dims }, (_, d) => points[d][pick]));
  }
  const labels = new Int32Array(n);
  for (let it = 0; it < iterations; it += 1) {
    let moved = false;
    for (let i = 0; i < n; i += 1) {
      let best = 0;
      let bestD = Infinity;
      centres.forEach((c, j) => {
        const d = dist(i, c);
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      });
      if (labels[i] !== best) moved = true;
      labels[i] = best;
    }
    centres.forEach((c, j) => {
      const members = [];
      for (let i = 0; i < n; i += 1) if (labels[i] === j) members.push(i);
      if (!members.length) return;
      for (let d = 0; d < dims; d += 1) c[d] = members.reduce((s, i) => s + points[d][i], 0) / members.length;
    });
    if (!moved && it > 0) break;
  }
  // Relabel by size, largest first, so cluster 1 is the biggest.
  const sizes = Array.from({ length: k }, (_, j) => [j, labels.filter((l) => l === j).length]).sort((a, b) => b[1] - a[1]);
  const rank = new Map(sizes.map(([j], r) => [j, r]));
  return labels.map((l) => rank.get(l));
}

/**
 * Order genes so co-expressed genes sit together: angle of each gene's
 * loading on the first two PCs of the cells (computed on those genes).
 */
export function clusteredGeneOrder(X, nCells, nGenes) {
  if (nGenes < 3) return Array.from({ length: nGenes }, (_, j) => j);
  const { scores } = pca(X, nCells, nGenes, 2, 80);
  const load = (p, j) => {
    let s = 0;
    for (let i = 0; i < nCells; i += 1) s += X[i * nGenes + j] * scores[p][i];
    return s;
  };
  const angle = Array.from({ length: nGenes }, (_, j) => Math.atan2(load(1, j), load(0, j)));
  return angle.map((a, j) => [a, j]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
}

/**
 * `pca` that yields to the browser between blocks of the Gram matrix and
 * between components, with progress in [0, 1], so a 1,000-cell PCA does not
 * freeze the page. Same result as `pca`.
 */
export async function pcaAsync(X, nCells, nGenes, nPcs = 10, iterations = 120, onProgress = null) {
  const breathe = () => new Promise((resolve) => setTimeout(resolve, 0));
  const K = new Float64Array(nCells * nCells);
  const block = Math.max(1, Math.floor(4e7 / Math.max(1, nCells * nGenes)));
  for (let a0 = 0; a0 < nCells; a0 += block) {
    const a1 = Math.min(nCells, a0 + block);
    for (let a = a0; a < a1; a += 1) {
      const oa = a * nGenes;
      for (let b = a; b < nCells; b += 1) {
        let s = 0;
        const ob = b * nGenes;
        for (let j = 0; j < nGenes; j += 1) s += X[oa + j] * X[ob + j];
        K[a * nCells + b] = s;
        K[b * nCells + a] = s;
      }
    }
    if (onProgress) onProgress((0.7 * a1) / nCells);
    await breathe();
  }
  const vectors = [];
  const values = [];
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
  const nComp = Math.min(nPcs, nCells - 1);
  for (let p = 0; p < nComp; p += 1) {
    let v = Float64Array.from({ length: nCells }, rand);
    let lambda = 0;
    for (let it = 0; it < iterations; it += 1) {
      const w = new Float64Array(nCells);
      for (let a = 0; a < nCells; a += 1) {
        let s = 0;
        const o = a * nCells;
        for (let b = 0; b < nCells; b += 1) s += K[o + b] * v[b];
        w[a] = s;
      }
      vectors.forEach((u) => {
        let d = 0;
        for (let a = 0; a < nCells; a += 1) d += w[a] * u[a];
        for (let a = 0; a < nCells; a += 1) w[a] -= d * u[a];
      });
      let norm = 0;
      w.forEach((x) => (norm += x * x));
      norm = Math.sqrt(norm) || 1;
      lambda = norm;
      v = w.map((x) => x / norm);
    }
    vectors.push(v);
    values.push(lambda);
    if (onProgress) onProgress(0.7 + (0.3 * (p + 1)) / nComp);
    await breathe();
  }
  const scores = vectors.map((u, p) => u.map((x) => x * Math.sqrt(values[p])));
  return { scores, values };
}
