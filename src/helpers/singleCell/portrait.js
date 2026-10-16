// Patient portrait / "canonical GBM biology vs novel" (cohort view `portrait`, Summary tab section).
// Pure helpers over <dataPath>_cohort/portrait.json and <dataPath><P>/portrait.json (srctools gos_sc_portrait.py).

/** Verdict vocabulary: glyph, label, antd tag colour. not_applicable = the feature is absent in the patient (nothing to test). */
export const VERDICTS = {
  consistent: { glyph: "✓", label: "consistent", color: "green", order: 0 },
  inconsistent: { glyph: "✗", label: "inconsistent", color: "volcano", order: 1 },
  not_testable: { glyph: "?", label: "not testable here", color: "gold", order: 2 },
  not_applicable: { glyph: "–", label: "not applicable", color: "default", order: 3 },
};

export function verdictOf(v) {
  return VERDICTS[v] || VERDICTS.not_testable;
}

const STATUS_ORDER = { robust: 0, candidate: 1, exploratory: 2 };
export const STATUS_LABEL = { robust: "robust", candidate: "candidate", exploratory: "exploratory" };

/** Novel items, best-supported first (stable within a status). */
export function sortNovel(items = []) {
  return items
    .map((n, i) => [n, i])
    .sort((a, b) => (STATUS_ORDER[a[0].status] ?? 3) - (STATUS_ORDER[b[0].status] ?? 3) || a[1] - b[1])
    .map((x) => x[0]);
}

const CLEAR = ["scview", "report", "tab", "heatmap", "walk", "evsite", "evview", "evassoc", "evrank", "drvopen", "scsel", "umap"];

/**
 * URL for a portrait link. A link with `report` opens that patient's tab (report, tab, + heatmap / walk / evsite ...);
 * otherwise it opens the cohort view `scview` (+ evassoc / evrank ...). Everything else in the current URL (dataset, ...) is kept.
 */
export function portraitHref(link, base) {
  if (!link) return "#";
  const url = new URL(base || (typeof window !== "undefined" ? window.location.href : "http://localhost/"));
  CLEAR.forEach((k) => url.searchParams.delete(k));
  Object.entries(link).forEach(([k, v]) => {
    if (k === "label" || v == null || v === "") return;
    url.searchParams.set(k, `${v}`);
  });
  return url.toString();
}

/** Counts of each verdict for one matrix feature across patients, and a short text such as "6/9 consistent, 3 inconsistent". */
export function featureTally(matrix, key) {
  const counts = { consistent: 0, inconsistent: 0, not_testable: 0, not_applicable: 0 };
  (matrix?.patients || []).forEach((p) => {
    const v = matrix.cells?.[p]?.[key]?.verdict;
    if (counts[v] != null) counts[v] += 1;
  });
  const applicable = counts.consistent + counts.inconsistent + counts.not_testable;
  const parts = [];
  if (counts.consistent) parts.push(`${counts.consistent}/${applicable} consistent`);
  if (counts.inconsistent) parts.push(`${counts.inconsistent} inconsistent`);
  if (counts.not_testable) parts.push(`${counts.not_testable} not testable`);
  if (counts.not_applicable) parts.push(`${counts.not_applicable} n/a`);
  return { counts, applicable, text: parts.join(", ") || "not available" };
}

/**
 * Canonical features split into those that hold, mixed, do not hold, and open. For the genotype-state links the
 * cohort-level test decides (`links[key].verdict`); for the others the share of consistent among decidable patients
 * (consistent + inconsistent): >= 2/3 holds, <= 1/3 fails, between is mixed; no decidable patient is open.
 */
export function holdsOrNot(matrix, links = null) {
  const out = { holds: [], mixed: [], fails: [], open: [] };
  (matrix?.features || []).forEach((f) => {
    const tally = featureTally(matrix, f.key);
    const link = links?.[f.key];
    let cat;
    if (link) cat = link.verdict === "consistent" ? "holds" : link.verdict === "inconsistent" ? "fails" : "open";
    else {
      const decided = tally.counts.consistent + tally.counts.inconsistent;
      const share = decided ? tally.counts.consistent / decided : null;
      cat = share == null ? "open" : share >= 2 / 3 ? "holds" : share <= 1 / 3 ? "fails" : "mixed";
    }
    out[cat].push({ ...f, tally });
  });
  return out;
}

/** Section lines of a patient card; a missing portrait gives a reason instead of empty sections. */
export function portraitUnavailable(portrait, patient) {
  return portrait ? null : `not available (no portrait.json exported for ${patient || "this patient"}; run srctools gos_sc_portrait.py)`;
}

/** Cell-state colours, the same as the other single-cell views (helpers/singleCell/matrix.js KNOWN_LEVEL_COLORS). */
export const STATE_COLORS = { MES: "#eb2626", NPC: "#3b54a3", OPC: "#6cbd45", AC: "#f9a41b" };
export const STATE_ORDER = ["MES", "AC", "OPC", "NPC"];

/** Fraction text: 0.4567 -> "46%"; null -> "n/a". */
export function pctText(x) {
  return x == null || Number.isNaN(x) ? "n/a" : `${Math.round(100 * x)}%`;
}

/** Event line for the genotype table: "truncal" / "subclonal (t = 0.03)" / "not placed on one clade". */
export function placementText(e) {
  if (!e) return "";
  if (e.truncal) return "truncal";
  if (e.placed) return `subclonal, relative time ${e.t0 != null ? e.t0.toFixed(2) : "n/a"}`;
  return "subclonal, no single clade";
}
