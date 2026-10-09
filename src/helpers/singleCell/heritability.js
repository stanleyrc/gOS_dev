// Phylogenetic signal ("heritability") of per-cell values on the DNA tree:
// Moran's I with inverse patristic-distance weights between leaves. A state
// or gene that is heritable is similar in closely related cells (I > E[I]);
// a plastic one is not. Two tests:
//   - analytic z under randomisation (Cliff & Ord), fast enough for whole DE /
//     gene-set tables (O(n^2) per feature);
//   - a tree permutation test (values shuffled over the leaves), for single
//     features, with a seeded PRNG so results are stable between renders.
// Same weighting as the paper-figures panel (figures.js phyloSignal), so the
// two agree.

/** Patristic distance between every pair of leaves (n x n, row-major). */
export function leafDistances(layout) {
  const n = layout.leaves.length;
  const depth = new Float64Array(n);
  layout.nodes.forEach((node) => {
    if (node.isLeaf) depth[node.firstLeaf] = node.x;
  });
  const D = new Float64Array(n * n);
  layout.nodes.forEach((node) => {
    if (node.isLeaf || node.children.length < 2) return;
    const kids = node.children.map((c) => layout.nodes[c]);
    for (let a = 0; a < kids.length; a += 1) {
      for (let b = a + 1; b < kids.length; b += 1) {
        for (let i = kids[a].firstLeaf; i <= kids[a].lastLeaf; i += 1) {
          for (let j = kids[b].firstLeaf; j <= kids[b].lastLeaf; j += 1) {
            const d = depth[i] + depth[j] - 2 * node.x;
            D[i * n + j] = d;
            D[j * n + i] = d;
          }
        }
      }
    }
  });
  return D;
}

/**
 * Inverse-distance weights among the given leaf ids (those present in the
 * tree), with the constants of Moran's I. Zero-length pairs (identical
 * leaves) get the largest finite weight rather than infinity.
 */
export function treeWeights(layout, ids) {
  if (!layout?.leaves?.length) return null;
  const rowOf = new Map(layout.leaves.map((id, i) => [`${id}`, i]));
  const keep = ids.map((id) => `${id}`).filter((id) => rowOf.has(id));
  const n = keep.length;
  if (n < 4) return null;
  const full = leafDistances(layout);
  const N = layout.leaves.length;
  const rows = keep.map((id) => rowOf.get(id));
  const W = new Float64Array(n * n);
  let minPos = Infinity;
  for (let a = 0; a < n; a += 1)
    for (let b = 0; b < n; b += 1) {
      const d = full[rows[a] * N + rows[b]];
      if (a !== b && d > 0 && d < minPos) minPos = d;
    }
  const cap = Number.isFinite(minPos) ? 1 / minPos : 1;
  let S0 = 0;
  let S1 = 0;
  const rowSum = new Float64Array(n);
  for (let a = 0; a < n; a += 1)
    for (let b = 0; b < n; b += 1) {
      if (a === b) continue;
      const d = full[rows[a] * N + rows[b]];
      const w = d > 0 ? 1 / d : cap;
      W[a * n + b] = w;
      S0 += w;
      rowSum[a] += w;
    }
  for (let a = 0; a < n; a += 1)
    for (let b = 0; b < n; b += 1) if (a !== b) S1 += 0.5 * (W[a * n + b] + W[b * n + a]) ** 2;
  let S2 = 0;
  for (let a = 0; a < n; a += 1) {
    let col = 0;
    for (let b = 0; b < n; b += 1) col += W[b * n + a];
    S2 += (rowSum[a] + col) ** 2;
  }
  return { ids: keep, n, W, S0, S1, S2 };
}

function centred(values, n) {
  let m = 0;
  let k = 0;
  for (let i = 0; i < n; i += 1)
    if (Number.isFinite(values[i])) {
      m += values[i];
      k += 1;
    }
  m = k ? m / k : 0;
  // missing values take the mean: they carry no signal
  return Float64Array.from({ length: n }, (_, i) => (Number.isFinite(values[i]) ? values[i] - m : 0));
}

function moranOf(z, W, n, S0) {
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    den += z[i] * z[i];
    const zi = z[i];
    if (zi === 0) continue;
    const off = i * n;
    let s = 0;
    for (let j = 0; j < n; j += 1) s += W[off + j] * z[j];
    num += zi * s;
  }
  return den > 0 ? (n / S0) * (num / den) : NaN;
}

const erfc = (x) => {
  // Numerical Recipes erfc, |error| < 1.2e-7
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))
    );
  return x >= 0 ? r : 2 - r;
};
/** Upper-tail normal p-value. */
export const pUpper = (z) => (Number.isFinite(z) ? 0.5 * erfc(z / Math.SQRT2) : NaN);

/**
 * Moran's I of values (aligned with w.ids) with its expectation, variance
 * under randomisation, z and one-sided p (positive autocorrelation).
 */
export function moranI(values, w) {
  const { n, W, S0, S1, S2 } = w;
  const z = centred(values, n);
  const I = moranOf(z, W, n, S0);
  const EI = -1 / (n - 1);
  let m2 = 0;
  let m4 = 0;
  for (let i = 0; i < n; i += 1) {
    m2 += z[i] * z[i];
    m4 += z[i] ** 4;
  }
  const b2 = m2 > 0 ? (n * m4) / (m2 * m2) : NaN;
  const EI2 =
    (n * ((n * n - 3 * n + 3) * S1 - n * S2 + 3 * S0 * S0) - b2 * ((n * n - n) * S1 - 2 * n * S2 + 6 * S0 * S0)) /
    ((n - 1) * (n - 2) * (n - 3) * S0 * S0);
  const VI = EI2 - EI * EI;
  const zI = VI > 0 && Number.isFinite(I) ? (I - EI) / Math.sqrt(VI) : NaN;
  return { I, EI, VI, z: zI, p: pUpper(zI), n };
}

/** Deterministic PRNG (mulberry32). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tree permutation test: values shuffled over the leaves; p = (#{I_perm >= I} + 1) / (nPerm + 1). */
export function moranPermutation(values, w, { nPerm = 999, seed = 11 } = {}) {
  const { n, W, S0 } = w;
  const z = centred(values, n);
  const I = moranOf(z, W, n, S0);
  if (!Number.isFinite(I)) return { I, p: NaN, nPerm };
  const rand = rng(seed);
  const perm = Float64Array.from(z);
  let ge = 0;
  for (let k = 0; k < nPerm; k += 1) {
    for (let i = n - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      const t = perm[i];
      perm[i] = perm[j];
      perm[j] = t;
    }
    if (moranOf(perm, W, n, S0) >= I) ge += 1;
  }
  return { I, p: (ge + 1) / (nPerm + 1), nPerm };
}

/** Benjamini-Hochberg q-values (NaN stays NaN). */
export function bh(ps) {
  const idx = ps.map((p, i) => [p, i]).filter(([p]) => Number.isFinite(p)).sort((a, b) => a[0] - b[0]);
  const q = ps.map(() => NaN);
  let prev = 1;
  for (let k = idx.length - 1; k >= 0; k -= 1) {
    const v = Math.min(prev, (idx[k][0] * idx.length) / (k + 1));
    q[idx[k][1]] = v;
    prev = v;
  }
  return q;
}

/**
 * Signal for many features: features = [{ key, values: id -> number }].
 * Returns [{ key, I, z, p, q, n }] in input order (analytic test).
 */
export function signalTable(w, features) {
  if (!w) return [];
  const rows = features.map((f) => {
    const v = w.ids.map((id) => {
      const x = typeof f.values === "function" ? f.values(id) : f.values?.[id];
      return x == null ? NaN : +x;
    });
    const r = moranI(v, w);
    return { key: f.key, I: r.I, z: r.z, p: r.p, n: r.n };
  });
  const q = bh(rows.map((r) => r.p));
  return rows.map((r, i) => ({ ...r, q: q[i] }));
}

/** Label for a signal row: "heritable" (q < 0.05, I > 0), "weak" (p < 0.05), else "plastic / none". */
export function heritabilityLabel(r) {
  if (!r || !Number.isFinite(r.z)) return "n/a";
  if (r.q < 0.05 && r.I > 0) return "heritable";
  if (r.p < 0.05) return "weak";
  return "plastic / none";
}
