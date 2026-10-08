// One joint signature fit for the patient, then each mutation assigned to
// the signature most likely to have produced its SBS96 channel:
// P(sig | channel) ∝ activity_sig × P(channel | sig). Burdens per cell or
// clade are then counts of unique assigned mutations.

import { SBS96 } from "./signatures";

const CHANNEL_INDEX = new Map(SBS96.map((c, k) => [c, k]));

/**
 * @param reference { names, columns } (COSMIC)
 * @param activities [{ signature, activity }] of the joint fit (activity = mutations)
 * @returns { perChannel: [{ signature, prob }] x 96, signatures: ordered names }
 */
export function channelPosteriors(reference, activities) {
  const used = activities.filter((a) => a.activity > 0 && reference.names.includes(a.signature));
  const perChannel = SBS96.map((_, i) => {
    const scores = used.map((a) => ({ signature: a.signature, w: a.activity * reference.columns[reference.names.indexOf(a.signature)][i] }));
    const total = scores.reduce((s, x) => s + x.w, 0);
    if (!total) return [];
    return scores.map((x) => ({ signature: x.signature, prob: x.w / total })).sort((a, b) => b.prob - a.prob);
  });
  return { perChannel, signatures: used.map((a) => a.signature) };
}

/**
 * Assign every variant with a context to its most probable signature.
 * @returns Int16Array-like arrays: { signature: string|null per variant, prob: number per variant }
 */
export function assignSignatures(variants, posteriors) {
  const signature = new Array(variants.length).fill(null);
  const prob = new Float32Array(variants.length);
  variants.forEach((v, c) => {
    const k = CHANNEL_INDEX.get(v.context);
    if (k == null) return;
    const best = posteriors.perChannel[k][0];
    if (best) {
      signature[c] = best.signature;
      prob[c] = best.prob;
    }
  });
  return { signature, prob };
}

/** Counts of unique assigned mutations per signature over a set of variant indices. */
export function signatureBurden(columns, assignment) {
  const counts = {};
  let assigned = 0;
  columns.forEach((c) => {
    const s = assignment.signature[c];
    if (!s) return;
    counts[s] = (counts[s] || 0) + 1;
    assigned += 1;
  });
  return { counts, assigned, total: columns.length };
}
