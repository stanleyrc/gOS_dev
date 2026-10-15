// Copy number of one locus vs expression of genes, per patient and pooled
// (cohort "CN vs expression" view). d3-free so jest can test it.
import { spearman } from "./dosage";
import { correlationP } from "./tests";

/** Width-weighted mean total CN of a cell's genome-graph row over [gStart, gEnd] (global coords); null without overlap. */
export function locusCn(row, gStart, gEnd) {
  if (!row?.binIndex) return null;
  const { gStart: s, gEnd: e } = row.binIndex;
  let sum = 0;
  let width = 0;
  for (let b = 0; b < s.length; b += 1) {
    const a = Math.max(gStart, s[b]);
    const z = Math.min(gEnd, e[b]);
    const v = row.values[b];
    if (z > a && Number.isFinite(v)) {
      sum += (z - a) * v;
      width += z - a;
    }
  }
  return width > 0 ? sum / width : null;
}

/** Copy-number bins of the deck figure: 1-20, 21-40, ..., 181-200, 200+ (cells below 1 copy fall in the first). */
export function cnBins(step = 20, top = 200) {
  const bins = [];
  for (let lo = 0; lo < top; lo += step) bins.push({ lo, hi: lo + step, label: `${lo + 1}–${lo + step}` });
  bins.push({ lo: top, hi: Infinity, label: `${top}+` });
  return bins;
}
/** Integer-scale bins for own-locus CN of ordinary genes: 0, 1, 2, 3, 4, 5, 6-8, 9-15, 16-40, 41+ (use binOf on the rounded CN). */
export function intCnBins() {
  const edges = [[-1, 0, "0"], [0, 1, "1"], [1, 2, "2"], [2, 3, "3"], [3, 4, "4"], [4, 5, "5"], [5, 8, "6–8"], [8, 15, "9–15"], [15, 40, "16–40"], [40, Infinity, "41+"]];
  return edges.map(([lo, hi, label]) => ({ lo, hi, label }));
}
export const binOf = (bins, cn) => bins.findIndex((b) => cn <= b.hi && (cn > b.lo || b.lo === 0));
/** Bin index of a CN value; integer bins round to the nearest copy first. */
export const binOfCn = (bins, cn, integer) => binOf(bins, integer ? Math.round(cn) : cn);

/** Standard normal upper tail and its inverse (Acklam), for Stouffer's method. */
export function normalUpper(z) {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.5 * x);
  const y = t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  const erfc = z >= 0 ? y : 2 - y;
  return erfc / 2;
}
export function normalQuantile(p) {
  if (!(p > 0) || !(p < 1)) return p <= 0 ? -Infinity : Infinity;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) return -normalQuantile(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/**
 * Stouffer combination of per-patient Spearman tests (weights sqrt(n)):
 * z_i = sign(rho_i) * Phi^-1(1 - p_i / 2). Returns the combined two-sided p,
 * signed z and the n-weighted mean rho ("weighted rho" in the deck).
 */
export function stouffer(tests) {
  const ok = tests.filter((t) => Number.isFinite(t.rho) && Number.isFinite(t.p) && t.n > 3);
  if (!ok.length) return { z: NaN, p: NaN, rho: NaN, n: 0 };
  let num = 0;
  let den = 0;
  let rs = 0;
  let nn = 0;
  ok.forEach((t) => {
    const w = Math.sqrt(t.n);
    const z = -Math.sign(t.rho) * normalQuantile(Math.max(1e-300, Math.min(1, t.p)) / 2);
    num += w * (Number.isFinite(z) ? z : 0);
    den += w * w;
    rs += t.n * t.rho;
    nn += t.n;
  });
  const z = num / Math.sqrt(den);
  return { z, p: Math.min(1, 2 * normalUpper(Math.abs(z))), rho: rs / nn, n: nn };
}

/** Spearman rho, p and n for paired arrays (null below 8 pairs or with a constant side). */
export function spearmanTest(x, y) {
  if (x.length < 8) return null;
  const rho = spearman(x, y);
  if (!Number.isFinite(rho)) return null;
  return { rho, p: correlationP(rho, x.length), n: x.length };
}

/**
 * Per-cell records [{ patient, cn, expr: { gene: value }, state }] ->
 * per patient and pooled Spearman tests for each gene, plus Stouffer.
 * A record may carry cnBy: { gene: cn } (the gene's own locus CN, "all genes"
 * source); that value replaces r.cn for that gene's test.
 */
export const cnFor = (r, g) => (r.cnBy && g in r.cnBy ? r.cnBy[g] : r.cn);
export function cnExpressionStats(records, genes, patients) {
  const out = { perPatient: {}, pooled: {}, combined: {} };
  genes.forEach((g) => {
    const tests = [];
    patients.forEach((p) => {
      const rec = records.filter((r) => r.patient === p && Number.isFinite(r.expr[g]) && Number.isFinite(cnFor(r, g)));
      const t = spearmanTest(rec.map((r) => cnFor(r, g)), rec.map((r) => r.expr[g]));
      if (!out.perPatient[p]) out.perPatient[p] = {};
      out.perPatient[p][g] = t;
      if (t) tests.push(t);
    });
    const all = records.filter((r) => Number.isFinite(r.expr[g]) && Number.isFinite(cnFor(r, g)));
    out.pooled[g] = spearmanTest(all.map((r) => cnFor(r, g)), all.map((r) => r.expr[g]));
    out.combined[g] = stouffer(tests);
  });
  return out;
}

/** Min-max scale each gene to 0-1 across the given records (the deck's "normalized expression"). */
export function scaleExpression(records, genes) {
  const range = {};
  genes.forEach((g) => {
    let lo = Infinity;
    let hi = -Infinity;
    records.forEach((r) => {
      const v = r.expr[g];
      if (Number.isFinite(v)) {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    });
    range[g] = [lo, hi];
  });
  return records.map((r) => ({
    ...r,
    scaled: Object.fromEntries(genes.map((g) => {
      const [lo, hi] = range[g];
      const v = r.expr[g];
      return [g, Number.isFinite(v) && hi > lo ? (v - lo) / (hi - lo) : null];
    })),
  }));
}

/** Five-number summary for box plots. */
export function boxStats(values) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const q = (f) => {
    const i = (v.length - 1) * f;
    const lo = Math.floor(i);
    return v[lo] + (v[Math.min(v.length - 1, lo + 1)] - v[lo]) * (i - lo);
  };
  const q1 = q(0.25);
  const q3 = q(0.75);
  const iqr = q3 - q1;
  const lo = v.find((x) => x >= q1 - 1.5 * iqr);
  const hi = [...v].reverse().find((x) => x <= q3 + 1.5 * iqr);
  return { n: v.length, min: v[0], q1, median: q(0.5), q3, max: v[v.length - 1], whiskerLo: lo, whiskerHi: hi };
}
