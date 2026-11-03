// d3-free: display names for the BWH70 EGFR ecDNA walks. Data keys (walk labels in walks.json, covariate names,
// figureDefaults anchors, paperPalette lookups) stay "wEGFR" / "sEGFR"; only what the user reads is mapped.
const TOKEN = /(?<![A-Za-z0-9_])([ws])EGFR(?:_var(\d+))?(?![A-Za-z0-9])/g;

/** Replace every wEGFR / sEGFR token (and _varN) in a display string: wEGFR -> "long EGFR", wEGFR_var1 -> "long EGFR var1", sEGFR -> "short EGFR". Non-strings pass through. */
export function displayLabel(s) {
  if (typeof s !== "string" || !s.includes("EGFR")) return s;
  return s.replace(TOKEN, (_, k, v) => `${k === "w" ? "long" : "short"} EGFR${v ? ` var${v}` : ""}`);
}

const AUTO_LABEL = /\bw\d{4,}\b/;

/** True for pipeline-generated walk labels such as "EGFR,SEC61G w00038 (1 cells)". */
export const isAutoWalkLabel = (label) => typeof label === "string" && AUTO_LABEL.test(label);

/**
 * Name shown for a walk: its own label, except an auto-generated label that has a curated match (peel walks), which
 * reads as the curated walk ("wEGFR_var2" -> "long EGFR var2"). Data keys are never changed.
 */
export function walkName(w) {
  if (!w) return "";
  const cur = w.curated_match?.label;
  return displayLabel(isAutoWalkLabel(w.label) && cur ? cur : w.label);
}

/** Tooltip text: the display name, plus the auto id when the name came from the curated match. */
export function walkTip(w) {
  const name = walkName(w);
  return w && isAutoWalkLabel(w.label) && w.curated_match?.label ? `${name} (${w.label})` : name;
}
