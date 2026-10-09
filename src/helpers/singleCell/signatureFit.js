// Goodness of fit of an SBS signature fit, as the bulk Signatures tab shows
// it (observed vs reconstructed catalog, decomposed catalogs against their
// reference profiles with cosine similarity) plus SigProfilerAssignment's
// own statistics. Backend fits carry the exact SigProfiler input catalog,
// reconstruction and stats in signatures.json (skilift
// sc_add_signature_fit_quality); older files fall back to the browser's SBS96
// profile of the same site set and a reconstruction from the COSMIC file.

import { SBS96, cosine, decomposeFit } from "./signatures";

const CHANNEL_INDEX = new Map(SBS96.map((c, k) => [c, k]));
const sum = (v) => v.reduce((s, x) => s + x, 0);

/** Bulk tab thresholds (helpers/metadata cosineSimilarityClass): antd Tag colour of a cosine. */
export function fitClass(value) {
  if (value == null || Number.isNaN(value)) return "default";
  if (value >= 0.95) return "success";
  if (value >= 0.85) return "warning";
  return "error";
}

/**
 * Values given in `channels` order as a Float64Array(96) in SBS96 order.
 * Without channels the values are taken to be in SBS96 order already.
 */
export function toSbs96(values, channels) {
  const out = new Float64Array(96);
  if (!values) return out;
  if (!channels || !channels.length) {
    for (let i = 0; i < 96 && i < values.length; i += 1) out[i] = Number(values[i]) || 0;
    return out;
  }
  channels.forEach((ch, i) => {
    const k = CHANNEL_INDEX.get(ch);
    if (k != null) out[k] = Number(values[i]) || 0;
  });
  return out;
}

/** Reconstructed catalog sum_k activity_k * reference_k (signatures missing from the reference are skipped). */
export function reconstructionOf(reference, activities) {
  const out = new Float64Array(96);
  (activities || []).forEach((a) => {
    const j = reference.names.indexOf(a.signature);
    if (j < 0) return;
    const col = reference.columns[j];
    for (let i = 0; i < 96; i += 1) out[i] += col[i] * (Number(a.activity) || 0);
  });
  return out;
}

/**
 * SigProfilerAssignment's fit statistics of observed vs reconstructed:
 * cosine, L1 / L2 norm of the residual (and as % of the observed catalog's
 * L1 / L2 norm), KL divergence of the normalised catalogs and Pearson r.
 */
export function fitStats(counts, reconstruction) {
  const total = sum(counts);
  const fitted = sum(reconstruction);
  let l1 = 0;
  let l2 = 0;
  let norm2 = 0;
  let kl = 0;
  for (let i = 0; i < counts.length; i += 1) {
    const d = counts[i] - reconstruction[i];
    l1 += Math.abs(d);
    l2 += d * d;
    norm2 += counts[i] * counts[i];
    const p = total ? counts[i] / total : 0;
    const q = fitted ? reconstruction[i] / fitted : 0;
    if (p > 0) kl += p * Math.log(p / Math.max(q, 1e-12));
  }
  l2 = Math.sqrt(l2);
  const n = counts.length;
  const mo = total / n;
  const mr = fitted / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    sxy += (counts[i] - mo) * (reconstruction[i] - mr);
    sxx += (counts[i] - mo) ** 2;
    syy += (reconstruction[i] - mr) ** 2;
  }
  return {
    total,
    cosine: cosine(counts, reconstruction),
    l1,
    l1Pct: total ? (100 * l1) / total : 0,
    l2,
    l2Pct: norm2 ? (100 * l2) / Math.sqrt(norm2) : 0,
    kl,
    correlation: sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0,
  };
}

/** signatures.json stats (snake_case, as SigProfiler reports them) in fitStats' shape. */
export function exportedStats(stats, total) {
  if (!stats || stats.cosine == null) return null;
  return {
    total,
    cosine: Number(stats.cosine),
    l1: Number(stats.l1),
    l1Pct: Number(stats.l1_pct),
    l2: Number(stats.l2),
    l2Pct: Number(stats.l2_pct),
    kl: Number(stats.kl),
    correlation: Number(stats.correlation),
  };
}

/** Per-channel residuals (observed - fitted), largest first: [{ channel, observed, fitted, residual }]. */
export function residuals(counts, reconstruction) {
  return SBS96.map((channel, i) => ({ channel, observed: counts[i], fitted: reconstruction[i], residual: counts[i] - reconstruction[i] })).sort(
    (a, b) => Math.abs(b.residual) - Math.abs(a.residual)
  );
}

/**
 * Everything the fit-quality views need for one fit.
 * @param counts observed SBS96 (SBS96 order)
 * @param reconstruction fitted SBS96 (SBS96 order), or null to rebuild it from the reference
 * @param activities [{ signature, activity }] (activity in mutations)
 * @param reference COSMIC { names, columns }, or null (no decomposition then)
 * @param stats precomputed stats in fitStats' shape, or null to compute them
 */
export function evaluateFit({ counts, reconstruction = null, activities, reference = null, stats = null }) {
  const acts = (activities || []).map((a) => ({ signature: a.signature, activity: Number(a.activity) || 0 })).filter((a) => a.activity > 0);
  const recon = reconstruction || (reference ? reconstructionOf(reference, acts) : new Float64Array(96));
  const total = sum(counts);
  const decomposition = reference ? decomposeFit(counts, reference, acts).sort((a, b) => b.activity - a.activity) : [];
  const fittedTotal = sum(acts.map((a) => a.activity)) || 1;
  return {
    counts,
    reconstruction: recon,
    activities: acts,
    stats: stats || fitStats(counts, recon),
    statsSource: stats ? "sigprofiler" : "browser",
    residuals: residuals(counts, recon),
    decomposition: decomposition.map((d) => ({ ...d, share: d.activity / fittedTotal })),
    total,
  };
}

/**
 * Fit evaluation of a backend (signatures.json) set. Uses the exported
 * catalog / reconstruction / stats when present; otherwise the browser's
 * profile of the same sites (`profileCounts`, SBS96 order) and a
 * reconstruction from the COSMIC reference. Returns null without a catalog.
 * `countsSource` is "export" or "browser"; `nMismatch` is set when the
 * browser profile does not have the set's n sites.
 */
export function evaluateBackendSet(set, { channels = null, profileCounts = null, reference = null } = {}) {
  if (!set?.activities?.length) return null;
  const exported = Array.isArray(set.counts) && set.counts.length === 96;
  const counts = exported ? toSbs96(set.counts, channels) : profileCounts;
  if (!counts) return null;
  const total = sum(counts);
  const reconstruction = Array.isArray(set.reconstruction) && set.reconstruction.length === 96 ? toSbs96(set.reconstruction, channels) : null;
  if (!reconstruction && !reference) return null;
  const stats = exported ? exportedStats(set.stats, total) : null;
  const evaluation = evaluateFit({ counts, reconstruction, activities: set.activities, reference, stats });
  return {
    ...evaluation,
    name: set.name,
    n: set.n,
    countsSource: exported ? "export" : "browser",
    nMismatch: !exported && set.n != null && Math.round(total) !== Number(set.n),
  };
}

/**
 * SBS substitution-class colours for a theme: the COSMIC colours, except
 * that on the dark panel the near-black C>G becomes a mid grey and the pale
 * T>A a lighter grey, so both stay visible and distinct from each other.
 */
export function sbsClassColors(mode, base) {
  if (mode !== "dark") return { ...base };
  return { ...base, "C>G": "#8c8c8c", "T>A": "#d9d9d9" };
}
