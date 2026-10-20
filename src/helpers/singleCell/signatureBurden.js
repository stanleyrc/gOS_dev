// Signature burden: mutations attributed to each signature (exposure fraction x the
// SNVs in the set) next to the exposure percentage. Used by every single-cell view of
// signature refits (joint / legacy sets, clades, cohort, the Signature track).
// Counts come from the exported totals only: a set without an SNV total shows "n/a".
// d3-free so it can be tested on synthetic fixtures.

export const BURDEN_COUNT = "count";
export const BURDEN_PERCENT = "percent";

/** Bar scale of the signature views: "count" (default, bar length = burden) or "percent" (every bar full width). */
export const burdenMode = (layout) => (layout?.sigScale === BURDEN_PERCENT ? BURDEN_PERCENT : BURDEN_COUNT);

const num = (v) => (v == null || v === "" || v === "NA" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** Mutations attributed to a signature: fraction x SNVs in the set; null when either is missing. */
export const attributedCount = (fraction, n) => {
  const f = num(fraction);
  const total = num(n);
  return f == null || total == null ? null : f * total;
};

/**
 * Exposure rows of one fit: [{ signature, fraction, count, lo, hi, countLo, countHi }] largest first.
 * activities = [{ signature, activity, fraction?, lo?, hi? }]; n = SNVs in the set (exported total).
 * The fraction is the exported one when present (joint refit), else activity / sum of activities
 * (legacy fits, whose activities already sum to the set's SNVs). count = fraction x n; when n is
 * missing the count is null ("n/a") rather than the raw NNLS activity.
 */
export function burdenRows(activities, n) {
  const acts = (activities || []).filter((a) => a && a.signature);
  const sum = acts.reduce((s, a) => s + (num(a.activity) || 0), 0);
  return acts
    .map((a) => {
      const fraction = num(a.fraction) ?? (sum > 0 ? (num(a.activity) || 0) / sum : null);
      const lo = num(a.lo);
      const hi = num(a.hi);
      return {
        signature: a.signature,
        fraction,
        count: attributedCount(fraction, n),
        lo,
        hi,
        countLo: attributedCount(lo, n),
        countHi: attributedCount(hi, n),
        candidate: Boolean(a.candidate),
      };
    })
    .filter((r) => r.fraction != null)
    .sort((a, b) => b.fraction - a.fraction);
}

/** Rows of a named set of a signatures.json / signatures_joint.json file (null when the set is absent). */
export function setBurden(file, setName) {
  const set = (file?.sets || []).find((s) => s.name === setName);
  if (!set) return null;
  return { name: set.name, n: num(set.n), rows: burdenRows(set.activities, set.n) };
}

/** "1,234" or "n/a" */
export const fmtCount = (c) => (c == null || !Number.isFinite(c) ? "n/a" : Math.round(c).toLocaleString("en-US"));
/** "31%" or "n/a" */
export const fmtPct = (f, digits = 0) => (f == null || !Number.isFinite(f) ? "n/a" : `${(100 * f).toFixed(digits)}%`);
/** "1,234 (31%)": burden first, percentage second. */
export const fmtBurden = (count, fraction) => `${fmtCount(count)} (${fmtPct(fraction)})`;
/** Short in-bar label: count mode "1,234 · 31%", percent mode "31% · 1,234". */
export const burdenLabel = (count, fraction, mode = BURDEN_COUNT) =>
  mode === BURDEN_PERCENT ? `${fmtPct(fraction)} · ${fmtCount(count)}` : `${fmtCount(count)} · ${fmtPct(fraction)}`;

/**
 * Bar length of each row in a group of stacked bars: percent mode = full width; count mode =
 * width x n / max n over the rows (rows without n keep full width so they are never hidden).
 * rows = [{ n }] -> [px]
 */
export function barLengths(rows, width, mode = BURDEN_COUNT) {
  if (mode === BURDEN_PERCENT) return rows.map(() => width);
  const ns = rows.map((r) => num(r?.n));
  const max = Math.max(0, ...ns.filter((v) => v != null));
  return ns.map((v) => (v == null || max <= 0 ? width : (width * v) / max));
}

/** Count difference between two sets of a contrast row: frac_a x n_a and frac_b x n_b. */
export const contrastCounts = (row, nA, nB) => ({ countA: attributedCount(row?.frac_a, nA), countB: attributedCount(row?.frac_b, nB) });
