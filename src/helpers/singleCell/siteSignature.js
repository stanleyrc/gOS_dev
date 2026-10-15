// Per-site mutational signature posterior, context only:
//   P(sig | SBS96 context) ∝ exposure(sig) x P(context | sig)
// with the exposures of the fit the app already shows (the site's own tree-site
// set - truncal / subclonal / private - when that set has a fit, else the joint
// "all" fit) and the COSMIC v3.4 SBS96 profiles. d3-free; reuses channelPosteriors.

import { SBS96 } from "./signatures";
import { channelPosteriors } from "./signatureAssign";

const CHANNEL_INDEX = new Map(SBS96.map((c, k) => [c, k]));
const TREE_SETS = ["truncal", "subclonal", "private"];

const positive = (activities) => (activities || []).map((a) => ({ signature: a.signature, activity: Number(a.activity) || 0 })).filter((a) => a.activity > 0);

/**
 * @param reference COSMIC { names, columns }
 * @param sets backend signature sets [{ name, activities: [{ signature, activity }] }]
 * @param jointActivities exposures of the "all" / joint fit used when a site's own set has none
 * @param fitName label of the fit ("joint" | "independent (legacy)" | ...)
 * @returns { forVariant(variant) -> { ranked: [{ signature, prob }], set, fit } | { ranked: [], reason } }
 */
export function siteSignatureModel({ reference, sets = [], jointActivities = [], fitName = "joint" } = {}) {
  const cache = new Map();
  const posteriorsFor = (name, activities) => {
    if (!cache.has(name)) cache.set(name, channelPosteriors(reference, activities));
    return cache.get(name);
  };
  const joint = positive(jointActivities);
  return {
    forVariant(variant) {
      if (!reference) return { ranked: [], reason: "COSMIC profiles not loaded" };
      const k = CHANNEL_INDEX.get(variant?.context);
      if (k == null) return { ranked: [], reason: "no SBS96 context (indel or missing)" };
      const own = TREE_SETS.includes(variant.category) ? positive((sets || []).find((s) => s.name === variant.category)?.activities) : [];
      const set = own.length ? variant.category : "all";
      const activities = own.length ? own : joint;
      if (!activities.length) return { ranked: [], reason: "no signature fit for this patient" };
      const ranked = posteriorsFor(set, activities).perChannel[k] || [];
      return ranked.length ? { ranked, set, fit: fitName } : { ranked: [], reason: "context has no probability in the fitted signatures" };
    },
  };
}

/** Short aetiology tag for a signature from its COSMIC description text ("" when none applies). */
export function aetiologyTag(text) {
  const s = `${text || ""}`;
  const rules = [
    [/APOBEC/i, "APOBEC"],
    [/clock-like|spontaneous deamination/i, "clock-like"],
    [/reactive oxygen/i, "ROS"],
    [/platinum/i, "platinum"],
    [/temozolomide/i, "TMZ"],
    [/mismatch repair|MMR/i, "MMR"],
    [/homologous recombination/i, "HRD"],
    [/tobacco/i, "tobacco"],
    [/ultraviolet|UV light/i, "UV"],
    [/POLE|polymerase epsilon/i, "POLE"],
  ];
  const hit = rules.find(([re]) => re.test(s));
  return hit ? hit[1] : "";
}

/**
 * "SBS13 (APOBEC) 0.72 · SBS2 0.20 · …, set: subclonal, fit: joint".
 * tagOf(signature) -> short aetiology tag; shows signatures with p >= minProb, at most `top`.
 */
export function formatSiteSignature(result, { tagOf = () => "", top = 4, minProb = 0.05 } = {}) {
  if (!result || !result.ranked?.length) return `not available (${result?.reason || "no signature"})`;
  const shown = result.ranked.filter((r, i) => i === 0 || r.prob >= minProb).slice(0, top);
  const parts = shown.map((r) => {
    const tag = tagOf(r.signature);
    return `${r.signature}${tag ? ` (${tag})` : ""} ${r.prob.toFixed(2)}`;
  });
  const more = result.ranked.length - shown.length;
  return `${parts.join(" · ")}${more > 0 ? " · …" : ""}, set: ${result.set}, fit: ${result.fit}`;
}

export const SIGNATURE_METHOD_HINT = (fit) =>
  `Signature per SNV: context-only assignment, P(signature | trinucleotide context) proportional to exposure x COSMIC v3.4 profile, exposures from the ${fit || "patient"} fit of the site's own tree-site set when it has one, else the all-sites fit. It does not use read-level or cell-level evidence.`;
