// Dropout-aware clonality exported on read-evidence driver rows (hotspot rescue, pooled driver scan, called-SNV rows) by
// skilift clonality.py: detection of the variant vs the patient's truncal SNVs at the same read depth plus a clade-restriction
// permutation. For these rows cell_fraction (carriers / covered cells) is a lower bound under allelic dropout, so the front end
// must not threshold it; it uses the exported call when present and falls back to the fraction rule otherwise. d3-free.

export const DROPOUT_METHOD = "dropout-aware";
const STATES = ["clonal", "subclonal", "indeterminate"];

/** "clonal" | "subclonal" | "indeterminate" from the exported fields, else null (no dropout-aware call on this row). */
export function exportedClonality(e) {
  if (!e || e.clonality_method !== DROPOUT_METHOD) return null;
  return STATES.includes(e.clonality) ? e.clonality : null;
}

/** subclonal flag: exported call when present (indeterminate counts as not subclonal), else fallback(). */
export function subclonalFlag(e, fallback) {
  const c = exportedClonality(e);
  return c == null ? Boolean(typeof fallback === "function" ? fallback() : fallback) : c === "subclonal";
}

/** clonal / subclonal / rare bucket for tables: exported call (indeterminate -> `indeterminateAs`), else the fraction rule. */
export function clonalityBucket(e, fraction, { clonal = 0.85, rare = 0.1, indeterminateAs = "unassessed" } = {}) {
  const c = exportedClonality(e);
  if (c === "indeterminate") return indeterminateAs;
  if (c) return c;
  if (!Number.isFinite(fraction)) return null;
  return fraction >= clonal ? "clonal" : fraction >= rare ? "subclonal" : "rare";
}

/** One-line explanation of the exported call (tooltips), or null. */
export function exportedClonalityText(e) {
  const c = exportedClonality(e);
  if (!c) return null;
  const s = e.clonality_stats || {};
  const pc = (x) => (x == null || !Number.isFinite(Number(x)) ? "n/a" : `${Math.round(100 * Number(x))}%`);
  const head = `${c} (dropout-aware)`;
  if (s.expected_detection == null) return s.reason ? `${head}: ${s.reason}` : head;
  return `${head}: alt reads in ${pc(s.observed_detection)} of ${s.n_covered} covered cells vs ${pc(s.expected_detection)} expected for truncal SNVs at the same depth${s.p_clade_restriction != null ? `; clade restriction P = ${Number(s.p_clade_restriction).toPrecision(2)}` : ""}`;
}
