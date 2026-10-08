// Significance tests used after plots render: rank tests for groups,
// correlation p-values, Fisher's exact test, and the special functions they
// need. Dependency-free; all p-values are two-sided unless stated.

import { benjaminiHochberg, logGamma, twoSidedP } from "./rnaStats";

export { benjaminiHochberg };

/* ---- special functions (Numerical Recipes style) ---- */

/** Regularized lower incomplete gamma P(a, x). */
export function gammaP(a, x) {
  if (!(x > 0)) return 0;
  if (x < a + 1) {
    let sum = 1 / a;
    let term = sum;
    for (let n = 1; n < 500; n += 1) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-14) break;
    }
    return Math.min(1, sum * Math.exp(-x + a * Math.log(x) - logGamma(a)));
  }
  // continued fraction for Q, then P = 1 - Q
  let b = x + 1 - a;
  let c = 1 / 1e-300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i += 1) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

/** Upper tail of the chi-square distribution with df degrees of freedom. */
export const chiSquareUpper = (x, df) => (x <= 0 ? 1 : Math.max(0, 1 - gammaP(df / 2, x / 2)));

function betacf(a, b, x) {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < 1e-300) d = 1e-300;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a, b). */
export function betaInc(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** Two-sided p-value of a Student t statistic with df degrees of freedom. */
export const studentTwoSidedP = (t, df) => (!Number.isFinite(t) || !(df > 0) ? NaN : Math.min(1, betaInc(df / (df + t * t), df / 2, 0.5)));

/* ---- rank tests ---- */

/** Average ranks of pooled values; returns { ranks (per input index), tieTerm = Σ(t³ − t) }. */
function rankAll(values) {
  const order = values.map((v, i) => i).sort((i, j) => values[i] - values[j]);
  const ranks = new Array(values.length);
  let tieTerm = 0;
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && values[order[j + 1]] === values[order[i]]) j += 1;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) ranks[order[k]] = avg;
    const count = j - i + 1;
    if (count > 1) tieTerm += count ** 3 - count;
    i = j + 1;
  }
  return { ranks, tieTerm };
}

/** Mann–Whitney U (Wilcoxon rank-sum) with tie and continuity correction. */
export function mannWhitney(a, b) {
  const nA = a.length;
  const nB = b.length;
  if (nA < 1 || nB < 1) return { U: NaN, p: NaN, n: nA + nB };
  const { ranks, tieTerm } = rankAll([...a, ...b]);
  let rankA = 0;
  for (let i = 0; i < nA; i += 1) rankA += ranks[i];
  const N = nA + nB;
  const U = rankA - (nA * (nA + 1)) / 2;
  const mu = (nA * nB) / 2;
  const sigma = Math.sqrt(((nA * nB) / 12) * (N + 1 - tieTerm / (N * (N - 1))));
  if (!(sigma > 0)) return { U, p: 1, n: N };
  const d = U - mu;
  const z = (d - 0.5 * Math.sign(d)) / sigma;
  return { U, p: twoSidedP(z), n: N, medianDiff: median(a) - median(b) };
}

/** Kruskal–Wallis H test across groups (arrays of values), chi-square approximation. */
export function kruskalWallis(groups) {
  const filled = groups.filter((g) => g.length);
  if (filled.length < 2) return { H: NaN, p: NaN, df: 0 };
  const all = filled.flat();
  const N = all.length;
  const { ranks, tieTerm } = rankAll(all);
  let offset = 0;
  let sum = 0;
  filled.forEach((g) => {
    let r = 0;
    for (let i = 0; i < g.length; i += 1) r += ranks[offset + i];
    offset += g.length;
    sum += (r * r) / g.length;
  });
  let H = (12 / (N * (N + 1))) * sum - 3 * (N + 1);
  const correction = 1 - tieTerm / (N ** 3 - N);
  if (correction > 0) H /= correction;
  const df = filled.length - 1;
  return { H, df, p: chiSquareUpper(H, df) };
}

/** Pairwise Mann–Whitney between all groups, BH-corrected. groups: [{ key, values }]. */
export function pairwiseMannWhitney(groups) {
  const pairs = [];
  for (let i = 0; i < groups.length; i += 1) {
    for (let j = i + 1; j < groups.length; j += 1) {
      const r = mannWhitney(groups[i].values, groups[j].values);
      pairs.push({ a: groups[i].key, b: groups[j].key, p: r.p, U: r.U });
    }
  }
  const q = benjaminiHochberg(pairs.map((x) => (Number.isFinite(x.p) ? x.p : 1)));
  return pairs.map((x, k) => ({ ...x, q: q[k] }));
}

/** Compare groups of values: 2 groups → Mann–Whitney; more → Kruskal–Wallis + pairwise. */
export function compareGroups(groups) {
  const filled = groups.filter((g) => g.values.length >= 2);
  if (filled.length < 2) return null;
  if (filled.length === 2) {
    const r = mannWhitney(filled[0].values, filled[1].values);
    return { test: "mann-whitney", p: r.p, pairs: [] };
  }
  const kw = kruskalWallis(filled.map((g) => g.values));
  return { test: "kruskal-wallis", p: kw.p, H: kw.H, df: kw.df, pairs: pairwiseMannWhitney(filled) };
}

/* ---- correlation and contingency ---- */

/** Two-sided p-value of a Spearman/Pearson correlation via the t approximation. */
export function correlationP(rho, n) {
  if (!Number.isFinite(rho) || n < 4) return NaN;
  if (Math.abs(rho) >= 1) return 0;
  const t = rho * Math.sqrt((n - 2) / (1 - rho * rho));
  return studentTwoSidedP(t, n - 2);
}

const logChoose = (n, k) => logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);

/** Fisher's exact test (two-sided, sum of tables at most as probable) for [[a, b], [c, d]]. */
export function fisherExact(a, b, c, d) {
  const r1 = a + b;
  const r2 = c + d;
  const c1 = a + c;
  const n = r1 + r2;
  if (!n) return { p: NaN, oddsRatio: NaN };
  const pmf = (x) => Math.exp(logChoose(r1, x) + logChoose(r2, c1 - x) - logChoose(n, c1));
  const observed = pmf(a);
  let p = 0;
  const lo = Math.max(0, c1 - r2);
  const hi = Math.min(r1, c1);
  for (let x = lo; x <= hi; x += 1) {
    const v = pmf(x);
    if (v <= observed * (1 + 1e-7)) p += v;
  }
  const oddsRatio = b * c > 0 ? (a * d) / (b * c) : Infinity;
  return { p: Math.min(1, p), oddsRatio };
}

function median(v) {
  const s = v.filter(Number.isFinite).slice().sort((x, y) => x - y);
  if (!s.length) return NaN;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

/** "p = 0.012" / "p < 1e-4" style label. */
export function formatP(p) {
  if (!Number.isFinite(p)) return "";
  if (p < 1e-4) return "p < 1e-4";
  if (p < 0.001) return `p = ${p.toExponential(1)}`;
  return `p = ${p.toFixed(3)}`;
}
