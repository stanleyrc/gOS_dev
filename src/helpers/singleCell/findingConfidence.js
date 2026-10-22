// Confidence tiers of findings, with a "show less confident findings" level kept in the URL. Written for the splicing calls
// (skilift gos_sc_splice_confidence.py: confidence / confidence_reason / confidence_detail on clusters, findings and events
// of rna/splicing.json, from the cell-level re-test) but generic: any list whose items carry `confidence` (a tier name)
// can use it with its own URL parameter. d3-free.
//
// Tiers, most confident first: consistent, suggestive, low. The level is the least confident tier shown: "consistent"
// (default) shows consistent only, "suggestive" adds suggestive, "low" shows everything. Items without a tier (files
// written before the tiering) are always shown, so older data is never hidden.

export const CONFIDENCE_TIERS = ["consistent", "suggestive", "low"];
export const DEFAULT_CONFIDENCE_LEVEL = "consistent";
export const SPLICE_CONFIDENCE_PARAM = "spliceconf";

const RANK = Object.fromEntries(CONFIDENCE_TIERS.map((t, i) => [t, i]));

export const CONFIDENCE_LABEL = { consistent: "consistent", suggestive: "suggestive", low: "low confidence", unrated: "not rated" };
export const CONFIDENCE_COLOR = { consistent: "green", suggestive: "gold", low: "default", unrated: "default" };
export const CONFIDENCE_HELP = {
  consistent: "Same direction within at least 3 patients (malignant vs non-malignant cells, or one malignant state vs the other malignant cells), explained by a DNA variant in cis, or a known GBM splice variant.",
  suggestive: "Survives the cell-level and library-batch tests but has no consistent within-patient contrast (tumour-to-tumour difference, one patient only, or batch-sensitive).",
  low: "Dropped by the cell-level re-test (not significant per cell, explained by library batch, differs between the BWH75 batches, paralog / repeat gene) or not re-tested.",
};

/** A valid tier name, or null. */
export const tierOf = (v) => (CONFIDENCE_TIERS.includes(v) ? v : null);

/** A valid level (least confident tier shown); anything else gives the default. */
export const levelOf = (v) => tierOf(v) || DEFAULT_CONFIDENCE_LEVEL;

/** { confidence, confidenceReason, confidenceDetail } of a raw exported row (snake_case fields), nulls when untiered. */
export function readConfidence(raw) {
  return {
    confidence: tierOf(raw?.confidence),
    confidenceReason: raw?.confidence_reason ? `${raw.confidence_reason}` : null,
    confidenceDetail: raw?.confidence_detail && typeof raw.confidence_detail === "object" ? raw.confidence_detail : null,
  };
}

/** Whether an item is shown at `level`. `get` reads the tier (default item.confidence); untiered items always pass. */
export function passesConfidence(item, level = DEFAULT_CONFIDENCE_LEVEL, get = (x) => x?.confidence) {
  const tier = tierOf(get(item));
  if (!tier) return true;
  return RANK[tier] <= RANK[levelOf(level)];
}

/** The items shown at `level`. */
export const filterByConfidence = (items, level, get) => (Array.isArray(items) ? items.filter((x) => passesConfidence(x, level, get)) : []);

/** { consistent, suggestive, low, unrated, total } of a list. */
export function confidenceCounts(items, get = (x) => x?.confidence) {
  const out = { consistent: 0, suggestive: 0, low: 0, unrated: 0, total: 0 };
  (Array.isArray(items) ? items : []).forEach((x) => {
    out[tierOf(get(x)) || "unrated"] += 1;
    out.total += 1;
  });
  return out;
}

/** Whether any item of the list carries a tier (the toggle is only offered for tiered files). */
export const hasConfidence = (items, get = (x) => x?.confidence) => (Array.isArray(items) ? items.some((x) => tierOf(get(x))) : false);

/** Items hidden at `level` (tiered, below the level). */
export const hiddenCount = (items, level, get) => (Array.isArray(items) ? items.length - filterByConfidence(items, level, get).length : 0);

/** Level from a URL query string (param absent or invalid: the default). */
export function confidenceFromSearch(search, param = SPLICE_CONFIDENCE_PARAM) {
  const p = new URLSearchParams(`${search ?? ""}`);
  return levelOf(p.get(param));
}

/** The query string with the level set (the default level removes the parameter). */
export function withConfidence(search, level, param = SPLICE_CONFIDENCE_PARAM) {
  const p = new URLSearchParams(`${search ?? ""}`);
  const l = levelOf(level);
  if (l === DEFAULT_CONFIDENCE_LEVEL) p.delete(param);
  else p.set(param, l);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Tiers shown at a level, most confident first. */
export const tiersShown = (level) => CONFIDENCE_TIERS.slice(0, RANK[levelOf(level)] + 1);

/** "10 consistent shown; 190 suggestive, 181 low confidence hidden" — one line for the toggle. */
export function confidenceSummary(counts, level) {
  if (!counts) return "";
  const shown = tiersShown(level);
  const part = (t) => `${counts[t] || 0} ${CONFIDENCE_LABEL[t]}`;
  const hidden = CONFIDENCE_TIERS.filter((t) => !shown.includes(t) && counts[t]);
  const s = `${shown.map(part).join(" + ")} shown`;
  return hidden.length ? `${s}; ${hidden.map(part).join(", ")} hidden` : s;
}

/** Hover text of a tier badge: tier, its reason and the consequence / contrast of the detail when present. */
export function confidenceTooltip(item) {
  const tier = tierOf(item?.confidence);
  if (!tier) return "Not rated: this file was written before the confidence tiers.";
  const d = item.confidenceDetail || item.confidence_detail || {};
  const reason = item.confidenceReason || item.confidence_reason || "";
  const bits = [`${CONFIDENCE_LABEL[tier]}: ${reason || CONFIDENCE_HELP[tier]}`];
  if (d.consequence) bits.push(`Consequence: ${d.consequence}${d.frame ? ` (${d.frame})` : ""}`);
  if (d.first_intron) bits.push("First intron: alternative promoter / first exon (follows cell type and coverage).");
  return bits.join(" · ");
}
