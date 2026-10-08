// SBS signature fitting in the browser: count a set of SNVs into the 96
// trinucleotide channels (variant.context, e.g. "A[C>T]G", written by skilift)
// and fit COSMIC reference signatures by non-negative least squares
// (Lawson-Hanson), as SigProfilerAssignment's backend fit does in spirit.

const BASES = ["A", "C", "G", "T"];
const SUBSTITUTIONS = ["C>A", "C>G", "C>T", "T>A", "T>C", "T>G"];

/** The 96 SBS channels in COSMIC order: substitution, then 5' base, then 3' base. */
export const SBS96 = SUBSTITUTIONS.flatMap((s) => BASES.flatMap((five) => BASES.map((three) => `${five}[${s}]${three}`)));
const CHANNEL_INDEX = new Map(SBS96.map((c, k) => [c, k]));
export const SBS_COLORS = {
  "C>A": "#1ebff0",
  "C>G": "#050708",
  "C>T": "#e62725",
  "T>A": "#cbcacb",
  "T>C": "#a1cf64",
  "T>G": "#edc8c5",
};

/** Parse a COSMIC reference matrix (tab-separated: Type, then one column per signature). */
export function parseCosmic(text) {
  const lines = `${text || ""}`.split(/\r?\n/).filter(Boolean);
  const header = lines[0].split("\t");
  const names = header.slice(1);
  const columns = names.map(() => new Float64Array(96));
  lines.slice(1).forEach((line) => {
    const f = line.split("\t");
    const k = CHANNEL_INDEX.get(f[0]);
    if (k == null) return;
    names.forEach((_, j) => {
      columns[j][k] = Number(f[j + 1]) || 0;
    });
  });
  return { names, columns };
}

/** Counts per SBS96 channel; contexts not in the 96 (or missing) are skipped. */
export function sbs96Counts(contexts) {
  const counts = new Float64Array(96);
  let used = 0;
  contexts.forEach((c) => {
    const k = CHANNEL_INDEX.get(c);
    if (k == null) return;
    counts[k] += 1;
    used += 1;
  });
  return { counts, used };
}

/**
 * Non-negative least squares, min ||A x - b|| subject to x >= 0, by
 * Lawson-Hanson. A is given as columns (array of Float64Array(m)).
 */
export function nnls(columns, b, { maxIterations = 500, tolerance = 1e-10 } = {}) {
  const n = columns.length;
  const m = b.length;
  const x = new Float64Array(n);
  const passive = new Array(n).fill(false);
  const dot = (u, v) => {
    let s = 0;
    for (let i = 0; i < m; i += 1) s += u[i] * v[i];
    return s;
  };
  const residual = () => {
    const r = Float64Array.from(b);
    for (let j = 0; j < n; j += 1) {
      if (x[j] === 0) continue;
      const col = columns[j];
      for (let i = 0; i < m; i += 1) r[i] -= col[i] * x[j];
    }
    return r;
  };
  // Least squares on the passive set via the normal equations (small: <= 96 columns).
  const solvePassive = (set) => {
    const k = set.length;
    const G = set.map((p) => set.map((q) => dot(columns[p], columns[q])));
    const h = set.map((p) => dot(columns[p], b));
    // Cholesky with a tiny ridge for stability.
    const L = Array.from({ length: k }, () => new Float64Array(k));
    for (let i = 0; i < k; i += 1) {
      for (let j = 0; j <= i; j += 1) {
        let s = G[i][j] + (i === j ? 1e-12 : 0);
        for (let t = 0; t < j; t += 1) s -= L[i][t] * L[j][t];
        L[i][j] = i === j ? Math.sqrt(Math.max(s, 1e-300)) : s / L[j][j];
      }
    }
    const y = new Float64Array(k);
    for (let i = 0; i < k; i += 1) {
      let s = h[i];
      for (let t = 0; t < i; t += 1) s -= L[i][t] * y[t];
      y[i] = s / L[i][i];
    }
    const z = new Float64Array(k);
    for (let i = k - 1; i >= 0; i -= 1) {
      let s = y[i];
      for (let t = i + 1; t < k; t += 1) s -= L[t][i] * z[t];
      z[i] = s / L[i][i];
    }
    return z;
  };
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const r = residual();
    const w = columns.map((col) => dot(col, r));
    let best = -1;
    let bestW = tolerance;
    for (let j = 0; j < n; j += 1) {
      if (!passive[j] && w[j] > bestW) {
        bestW = w[j];
        best = j;
      }
    }
    if (best < 0) break;
    passive[best] = true;
    for (let inner = 0; inner < maxIterations; inner += 1) {
      const set = [];
      passive.forEach((p, j) => p && set.push(j));
      const z = solvePassive(set);
      if (z.every((v) => v > 0)) {
        set.forEach((j, k) => (x[j] = z[k]));
        break;
      }
      // Step back to the boundary and drop the variables that hit zero.
      let alpha = Infinity;
      set.forEach((j, k) => {
        if (z[k] <= 0) alpha = Math.min(alpha, x[j] / (x[j] - z[k]));
      });
      set.forEach((j, k) => {
        x[j] += alpha * (z[k] - x[j]);
        if (x[j] <= tolerance) {
          x[j] = 0;
          passive[j] = false;
        }
      });
    }
  }
  return x;
}

export function cosine(u, v) {
  let uv = 0;
  let uu = 0;
  let vv = 0;
  for (let i = 0; i < u.length; i += 1) {
    uv += u[i] * v[i];
    uu += u[i] * u[i];
    vv += v[i] * v[i];
  }
  return uu && vv ? uv / Math.sqrt(uu * vv) : 0;
}

const reconstruct = (reference, keep, x) => {
  const out = new Float64Array(96);
  keep.forEach((j, k) => {
    const col = reference.columns[j];
    for (let i = 0; i < 96; i += 1) out[i] += col[i] * x[k];
  });
  return out;
};

/**
 * Fit reference signatures to SBS96 counts. Like SigProfilerAssignment's
 * cosmic_fit, the set of signatures is chosen stepwise: start from the NNLS
 * fit of every signature, then repeatedly drop the signature whose removal
 * costs least cosine similarity while that cost is below removePenalty, and
 * add any signature that improves the cosine by more than addPenalty.
 * Activities are in mutations (they sum to about the number of mutations).
 */
export function fitSignatures(counts, reference, { addPenalty = 0.05, removePenalty = 0.01, maxRounds = 100 } = {}) {
  const total = counts.reduce((s, v) => s + v, 0);
  if (!total) return { activities: [], cosine: 0, reconstruction: new Float64Array(96), total: 0 };
  const fitOf = (keep) => {
    const x = nnls(keep.map((j) => reference.columns[j]), counts);
    return { keep, x, cos: cosine(counts, reconstruct(reference, keep, x)) };
  };
  let current = fitOf(reference.names.map((_, j) => j));
  // drop signatures with no weight first
  current = fitOf(current.keep.filter((_, k) => current.x[k] > 0));
  for (let round = 0; round < maxRounds; round += 1) {
    let changed = false;
    // backward: remove the cheapest signature while the cosine barely moves
    while (current.keep.length > 1) {
      const keep = current.keep;
      let best = null;
      keep.forEach((j) => {
        const trial = fitOf(keep.filter((q) => q !== j));
        if (!best || trial.cos > best.cos) best = trial;
      });
      if (current.cos - best.cos >= removePenalty) break;
      current = best;
      changed = true;
    }
    // forward: add the single best signature if it helps enough
    let bestAdd = null;
    const kept = current.keep;
    reference.names.forEach((_, j) => {
      if (kept.includes(j)) return;
      const trial = fitOf([...kept, j]);
      if (!bestAdd || trial.cos > bestAdd.cos) bestAdd = trial;
    });
    if (bestAdd && bestAdd.cos - current.cos > addPenalty) {
      current = bestAdd;
      changed = true;
    }
    if (!changed) break;
  }
  const reconstruction = reconstruct(reference, current.keep, current.x);
  const activities = current.keep
    .map((j, k) => ({ signature: reference.names[j], activity: current.x[k] }))
    .filter((a) => a.activity > 0)
    .sort((a, b) => b.activity - a.activity);
  return { activities, cosine: cosine(counts, reconstruction), reconstruction, total };
}

/**
 * Per-signature share of each channel's mutations (as the bulk Signatures
 * tab's decomposed catalogs): mutations_k(i) = counts(i) * ref_k(i) a_k /
 * sum_j ref_j(i) a_j, with the signature's reference profile scaled to its
 * activity and the cosine between the two.
 */
export function decomposeFit(counts, reference, activities) {
  const cols = activities.map((a) => reference.columns[reference.names.indexOf(a.signature)]);
  const recon = new Float64Array(96);
  activities.forEach((a, k) => cols[k] && cols[k].forEach((p, i) => (recon[i] += p * a.activity)));
  return activities
    .map((a, k) => {
      const col = cols[k];
      if (!col) return null;
      const decomposed = SBS96.map((_, i) => (recon[i] > 0 ? (counts[i] * col[i] * a.activity) / recon[i] : 0));
      const expected = SBS96.map((_, i) => col[i] * a.activity);
      return { signature: a.signature, activity: a.activity, decomposed, expected, cosine: cosine(decomposed, expected) };
    })
    .filter(Boolean);
}

/**
 * Bootstrap 95% intervals of signature shares: resample the SBS96 contexts
 * with replacement `rounds` times and refit (NNLS) the given signatures.
 * Returns { [signature]: { lo, hi } } as shares of the fitted total.
 */
export function bootstrapShares(contexts, reference, signatureNames, rounds = 100, seed = 1) {
  const idx = signatureNames.map((n) => reference.names.indexOf(n)).filter((j) => j >= 0);
  const names = idx.map((j) => reference.names[j]);
  const cols = idx.map((j) => reference.columns[j]);
  const valid = contexts.filter((c) => CHANNEL_INDEX.has(c));
  if (!valid.length || !cols.length) return {};
  // small deterministic PRNG (mulberry32)
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const shares = names.map(() => []);
  for (let r = 0; r < rounds; r += 1) {
    const counts = new Float64Array(96);
    for (let i = 0; i < valid.length; i += 1) counts[CHANNEL_INDEX.get(valid[Math.floor(rand() * valid.length)])] += 1;
    const x = nnls(cols, counts);
    const total = x.reduce((a, b) => a + b, 0) || 1;
    names.forEach((_, k) => shares[k].push(x[k] / total));
  }
  const out = {};
  names.forEach((n, k) => {
    const sorted = shares[k].sort((a, b) => a - b);
    out[n] = { lo: sorted[Math.floor(0.025 * (sorted.length - 1))], hi: sorted[Math.ceil(0.975 * (sorted.length - 1))] };
  });
  return out;
}
