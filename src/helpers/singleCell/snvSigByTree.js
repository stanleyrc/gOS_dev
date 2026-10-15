// Per-site signature assignment using the fit of the site's own tree-site set
// (truncal / subclonal / private) when the patient has one, else the joint fit
// over all sites. Subclonal sites can carry signatures (e.g. SBS13) that the
// joint fit, dominated by truncal and private burden, does not include.
// d3-free so it can be tested on synthetic fixtures.

import { assignSignatures, channelPosteriors } from "./signatureAssign";

const TREE_SETS = ["truncal", "subclonal", "private"];

/**
 * @param variants SNV variants (category, context)
 * @param reference COSMIC { names, columns }
 * @param sets backend signature sets [{ name, activities: [{ signature, activity }] }]
 * @param joint the joint assignment { signature, prob } over all sites (fallback)
 * @returns { signature, prob, bySet } with the same shape as assignSignatures
 */
export function assignByTreeSet(variants, reference, sets, joint) {
  const signature = joint.signature.slice();
  const prob = Float32Array.from(joint.prob);
  const used = [];
  TREE_SETS.forEach((name) => {
    const set = (sets || []).find((s) => s.name === name);
    const activities = (set?.activities || []).map((a) => ({ signature: a.signature, activity: Number(a.activity) || 0 }));
    if (!activities.some((a) => a.activity > 0)) return;
    const post = channelPosteriors(reference, activities);
    const idx = variants.map((v, c) => (v.category === name ? c : -1)).filter((c) => c >= 0);
    if (!idx.length) return;
    const sub = assignSignatures(idx.map((c) => variants[c]), post);
    idx.forEach((c, k) => {
      if (sub.signature[k]) {
        signature[c] = sub.signature[k];
        prob[c] = sub.prob[k];
      }
    });
    used.push(name);
  });
  return { signature, prob, bySet: used };
}
