// Expression of a driver's gene(s) in carriers vs comparison cells, and RNA allele counts at an SNV site.
// d3-free so it can be unit tested (components: drivers/driverGeneExpressionCard.js).
import { fisherExact, mannWhitney } from "./tests";

const finite = (v) => v.filter(Number.isFinite);

/** n, detection, mean and quartiles of a group's per-cell values (log-normalised; detected = > 0). */
export function groupStats(values) {
  const v = finite(Array.from(values));
  const n = v.length;
  if (!n) return { n: 0, detected: 0, pctDetected: NaN, mean: NaN, median: NaN, q1: NaN, q3: NaN, min: NaN, max: NaN };
  const s = v.slice().sort((a, b) => a - b);
  const q = (f) => {
    const x = (n - 1) * f;
    const lo = Math.floor(x);
    return s[lo] + (s[Math.min(lo + 1, n - 1)] - s[lo]) * (x - lo);
  };
  const detected = s.filter((x) => x > 0).length;
  return { n, detected, pctDetected: detected / n, mean: s.reduce((a, b) => a + b, 0) / n, median: q(0.5), q1: q(0.25), q3: q(0.75), min: s[0], max: s[n - 1] };
}

/** Carriers (a) vs comparison cells (b): group stats, Mann-Whitney p on values, Fisher p on detection, mean difference. */
export function expressionContrast(a, b, { minCells = 3 } = {}) {
  const A = groupStats(a);
  const B = groupStats(b);
  if (A.n < minCells || B.n < minCells) return { a: A, b: B, ok: false, reason: `too few RNA-linked cells (carriers ${A.n}, comparison ${B.n}; need ${minCells} in each)` };
  const mw = mannWhitney(finite(Array.from(a)), finite(Array.from(b)));
  const fi = fisherExact(A.detected, A.n - A.detected, B.detected, B.n - B.detected);
  return { a: A, b: B, ok: true, pMW: mw.p, pFisher: fi.p, meanDiff: A.mean - B.mean };
}

/** Matrix rows of the ids that have RNA (rowOfId: Map id -> row); ids keep their order. */
export function rnaRows(ids, rowOfId) {
  if (!rowOfId) return [];
  const out = [];
  (ids || []).forEach((id) => {
    const r = rowOfId.get(id);
    if (r != null) out.push({ id, r });
  });
  return out;
}

/** One-line summary for the drawer header, from per-gene contrasts [{ gene, contrast }]. */
export function expressionHeadline(items) {
  const parts = (items || []).map(({ gene, contrast: c }) => {
    if (!c) return `${gene}: gene not in the RNA matrix`;
    if (!c.ok) return `${gene}: not available (${c.reason})`;
    const p = Math.min(c.pMW, c.pFisher);
    return `${gene} ${c.a.mean.toFixed(2)} vs ${c.b.mean.toFixed(2)} (detected ${Math.round(100 * c.a.pctDetected)}% vs ${Math.round(100 * c.b.pctDetected)}%, p ${p < 1e-4 ? "< 1e-4" : p.toFixed(3)})`;
  });
  return parts.length ? `Expression, carriers vs others: ${parts.join("; ")}` : "";
}

/**
 * RNA reads at an SNV site per group, from the per-cell RNA counts of region_calls (rows from siteEvidence():
 * { id, rnaAlt, rnaDp }). Returns null when no cell has RNA depth data at all.
 */
export function rnaAlleleCounts(rows, groups) {
  if (!(rows || []).some((r) => r.rnaDp != null)) return null;
  const out = {};
  Object.entries(groups).forEach(([name, ids]) => {
    const set = new Set(ids);
    let alt = 0;
    let dp = 0;
    let cells = 0;
    let altCells = 0;
    rows.forEach((r) => {
      if (!set.has(r.id) || !(r.rnaDp > 0)) return;
      cells += 1;
      dp += r.rnaDp;
      alt += r.rnaAlt || 0;
      if (r.rnaAlt > 0) altCells += 1;
    });
    out[name] = { alt, ref: dp - alt, dp, cells, altCells, vaf: dp ? alt / dp : NaN };
  });
  return out;
}

/** Carrier vs other RNA alt share with Fisher p (alt/ref reads); null when either group has no RNA reads. */
export function aseVerdict(counts) {
  const c = counts?.carriers;
  const o = counts?.others;
  if (!c || !c.dp) return null;
  const p = o && o.dp ? fisherExact(c.alt, c.ref, o.alt, o.ref).p : NaN;
  return { carriers: c, others: o || null, p };
}
