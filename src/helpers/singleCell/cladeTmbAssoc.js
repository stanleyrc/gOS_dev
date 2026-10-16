// Clade-level TMB and its covariate associations (d3-free). Reads _cohort/tmb_clade_assoc.json
// (srctools gos_sc_tmb_clade.py); the statistics mirror that script's run_stats so the default settings reproduce
// its exported default_stats. Unit = tree clade (branch) or single-cell branch, never the cell's own TMB.

export const VARIANT_SETS = [
  ["all", "All mapped SNVs"],
  ["conf", "Confidently mapped only"],
  ["multi", "SNVs seen in >= 2 cells"],
  ["confmulti", "Confident and seen in >= 2 cells"],
];
export const CLADE_MEASURES = [
  ["branch", "Branch TMB"],
  ["cumulative", "Cumulative (root-to-clade)"],
  ["rate", "Per branch length"],
];
export const MEASURE_AXIS = {
  branch: "Branch TMB (SNVs / Mb callable)",
  cumulative: "Cumulative TMB, root to clade (SNVs / Mb callable)",
  rate: "Branch TMB per CellPhy branch length (SNVs / Mb / subst. per site)",
};
export const MIN_N = 5;
export const PERM_BELOW = 20;
export const N_PERM = 2000;

const finite = (v) => typeof v === "number" && Number.isFinite(v);

/** seeded generator (mulberry32) so permutation p-values are reproducible */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** two-sided normal tail 2*sf(|z|) via erfc (Numerical Recipes Chebyshev fit, rel. error < 1.2e-7) */
export function normalTwoSided(z) {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.5 * x);
  const ans = t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return Math.min(1, ans);
}

export function ranks(values) {
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

const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const norm = (a) => Math.sqrt(dot(a, a));

/** residual of v after projecting out the (already orthonormal) basis vectors */
function residualise(v, basis) {
  let out = v.slice();
  basis.forEach((q) => {
    const c = dot(out, q);
    out = out.map((x, i) => x - c * q[i]);
  });
  return out;
}

/**
 * Partial Spearman of x and y given rank(size). Returns { r, z, p, n, p_perm? } or null (n < MIN_N, < 3 distinct values,
 * or degenerate). z = atanh(r) * sqrt(n - k - 2) with k basis columns (intercept + size); permutation p when n < PERM_BELOW.
 */
export function partialSpearman(xs, ys, sizes, { seed = 1, nPerm = N_PERM } = {}) {
  const keep = xs.map((_, i) => i).filter((i) => finite(xs[i]) && finite(ys[i]) && finite(sizes[i]));
  const n = keep.length;
  if (n < MIN_N) return null;
  const x = keep.map((i) => xs[i]);
  const y = keep.map((i) => ys[i]);
  if (new Set(x).size < 3 || new Set(y).size < 3) return null;
  const rx = ranks(x);
  const ry = ranks(y);
  const rs = ranks(keep.map((i) => sizes[i]));
  const basis = [new Array(n).fill(1 / Math.sqrt(n))];
  const rsm = rs.map((v) => v - rs.reduce((s, q) => s + q, 0) / n);
  if (norm(rsm) > 1e-9) basis.push(residualise(rsm, basis).map((v, _i, arr) => v / norm(arr)));
  const ex = residualise(rx, basis);
  const ey = residualise(ry, basis);
  const nx = norm(ex);
  const ny = norm(ey);
  if (nx < 1e-9 || ny < 1e-9) return null;
  const r = dot(ex, ey) / (nx * ny);
  const k = basis.length;
  if (n - k - 1 < 3) return null;
  const z = Math.atanh(Math.max(-0.999999, Math.min(0.999999, r))) * Math.sqrt(Math.max(n - k - 2, 1));
  const out = { r, z, p: normalTwoSided(z), n };
  if (n < PERM_BELOW) {
    const rand = rng(seed);
    const perm = ey.slice();
    let ge = 0;
    for (let b = 0; b < nPerm; b += 1) {
      for (let i = n - 1; i > 0; i -= 1) {
        const j = Math.floor(rand() * (i + 1));
        const t = perm[i];
        perm[i] = perm[j];
        perm[j] = t;
      }
      if (Math.abs(dot(ex, perm) / (nx * ny)) >= Math.abs(r) - 1e-12) ge += 1;
    }
    out.p_perm = (1 + ge) / (nPerm + 1);
  }
  return out;
}

/** Stouffer combination, weights sqrt(n); null with no finite unit */
export function stouffer(units) {
  const u = units.filter((t) => t && finite(t.z));
  if (!u.length) return null;
  const w = u.map((t) => Math.sqrt(t.n));
  const zc = u.reduce((s, t, i) => s + w[i] * t.z, 0) / Math.sqrt(w.reduce((s, v) => s + v * v, 0));
  const sg = Math.sign(zc);
  return {
    z: zc, p: normalTwoSided(zc), n_patients: u.length, n: u.reduce((s, t) => s + t.n, 0),
    mean_r: u.reduce((s, t, i) => s + w[i] * t.r, 0) / w.reduce((s, v) => s + v, 0),
    n_concordant: u.filter((t) => Math.sign(t.z) === sg && t.z !== 0).length,
  };
}

const tmbOf = (row, vs) => (row.callable_mb && row.power ? row.snv[vs] / row.callable_mb / row.power : NaN);

/**
 * Rows with the chosen TMB measure attached. Cumulative TMB follows the listed-parent chain over ALL rows (before any
 * filtering), so removing singletons or small clades does not change a clade's cumulative burden.
 * opts: { variantSet, measure }
 */
export function withMeasure(rows, { variantSet = "all", measure = "branch" } = {}) {
  const byId = new Map(rows.map((r) => [`${r.patient}|${r.id}`, r]));
  const branch = new Map(rows.map((r) => [r, tmbOf(r, variantSet)]));
  const cum = (r) => {
    let s = 0;
    let node = r;
    const seen = new Set();
    while (node && !seen.has(node)) {
      seen.add(node);
      s += branch.get(node);
      node = node.parent ? byId.get(`${r.patient}|${node.parent}`) : null;
    }
    return s;
  };
  return rows.map((r) => {
    let y;
    if (measure === "cumulative") y = cum(r);
    else if (measure === "rate") {
      const bl = r.cov.branch_length;
      y = bl > 0 ? branch.get(r) / bl : NaN;
    } else y = branch.get(r);
    return { ...r, y: finite(y) ? y : NaN };
  });
}

/** which rows enter a plot / test: min clade size, singleton toggle, terminal-only (tests), trunk clades never */
export function selectRows(rows, { minCells = 5, dropSingletons = true, terminalOnly = false, includeTrunk = false } = {}) {
  return rows.filter((r) => r.n_cells >= minCells && (!dropSingletons || r.kind !== "singleton") && (!terminalOnly || r.terminal) && (includeTrunk || !r.is_trunk));
}

/** one table row per covariate: per patient partial Spearman + Stouffer, sorted by combined p */
export function associationTable(data, opts = {}) {
  if (!data?.clades) return [];
  const { variantSet = "all", measure = "branch", minCells = 5, dropSingletons = true, terminalOnly = true } = opts;
  const rows = selectRows(withMeasure(data.clades, { variantSet, measure }), { minCells, dropSingletons, terminalOnly });
  const patients = Object.keys(data.patients || {});
  const out = [];
  (data.covariates || []).forEach((cv) => {
    const per = {};
    const units = [];
    patients.forEach((pn) => {
      const rr = rows.filter((r) => r.patient === pn);
      const t = partialSpearman(rr.map((r) => (finite(r.cov[cv.key]) ? r.cov[cv.key] : NaN)), rr.map((r) => r.y), rr.map((r) => r.n_cells));
      if (t) {
        per[pn] = t;
        units.push(t);
      }
    });
    if (Object.keys(per).length) out.push({ covariate: cv.key, label: cv.label, group: cv.group, unit: cv.unit, per_patient: per, combined: stouffer(units) });
  });
  return out.sort((a, b) => (a.combined ? a.combined.p : 2) - (b.combined ? b.combined.p : 2));
}

/** points of one covariate: every clade passing the size / singleton filters (terminal flagged, not filtered) */
export function scatterPoints(data, key, opts = {}) {
  if (!data?.clades) return [];
  const { variantSet = "all", measure = "branch", minCells = 5, dropSingletons = true } = opts;
  return selectRows(withMeasure(data.clades, { variantSet, measure }), { minCells, dropSingletons, terminalOnly: false })
    .filter((r) => finite(r.cov[key]) && finite(r.y))
    .map((r) => ({ patient: r.patient, id: r.id, kind: r.kind, clone: r.clone, n_cells: r.n_cells, terminal: r.terminal, x: r.cov[key], y: r.y, snv: r.snv[variantSet], parent: r.parent }));
}

export function maxCladeSize(data) {
  return Math.max(1, ...(data?.clades || []).filter((r) => r.kind === "clade").map((r) => r.n_cells));
}

export function fmtP(p) {
  if (!finite(p)) return "n/a";
  if (p < 1e-4) return p.toExponential(1);
  return p < 0.01 ? p.toFixed(4) : p.toFixed(3);
}

/** best available per-patient p: permutation when computed (small n), else the normal approximation */
export const bestP = (t) => (finite(t?.p_perm) ? t.p_perm : t?.p);
