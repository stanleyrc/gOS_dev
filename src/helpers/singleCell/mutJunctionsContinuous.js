// Continuous (unbinned) view of SNVs around junction breakends: signed distance per SNV (cis +, trans -), kernel-smoothed
// or freely rebinned rates per callable kb (raw and copy-number adjusted) against the CN-matched background, and the
// signature split of the near-junction SNVs (per-SNV posteriors, SBS96 spectra, refit, inter-mutation distances).
// Data: the `focal` / `focal_diploid` blocks of data/<P>/mut_junctions.json and _cohort/mut_junctions.json
// (schemaVersion 4: profile = callable bases per 100 bp tile and side, background_detail, pairs with sig_post). d3-free.

import { SBS96, fitSignatures, sbs96Counts } from "./signatures";

export const CANDIDATE_SIGNATURES = [
  { signature: "SBS1", note: "clock-like (5mC deamination)" },
  { signature: "SBS5", note: "clock-like, flat" },
  { signature: "SBS40", note: "flat, unknown (SBS40a/b/c)" },
  { signature: "SBS8", note: "unknown; late-replicating / HR-deficient" },
  { signature: "SBS18", note: "ROS (8-oxoG, C>A)" },
  { signature: "SBS2", note: "APOBEC (C>T at TCW)" },
  { signature: "SBS13", note: "APOBEC (C>G at TCW)" },
];
export const BIN_SIZES = [100, 200, 500, 1000, 2000, 5000, 10000];
export const ZOOMS = [1000, 5000, 10000, 50000];
export const SHAPES = ["circle", "square", "triangle", "diamond", "cross", "star", "circle-open", "square-open"];
const NEAR_EXCLUDE_BP = 500;

const sum = (a) => a.reduce((s, v) => s + v, 0);
const zeros = (n) => new Array(n).fill(0);

/** Unified view of a patient or cohort focal block: { patients: {P: {profile, bg, siteFit}}, pairs, cosmic }. */
export function continuousData(block, patientId = null) {
  if (!block || block.status === "not available" || !block.results) return null;
  if (block.patient_data) {
    const patients = {};
    Object.entries(block.patient_data).forEach(([p, d]) => {
      if (d?.profile?.cis_Lcn) patients[p] = { profile: d.profile, bg: d.background_detail || {}, siteFit: d.site_fit };
    });
    if (!Object.keys(patients).length) return null;
    return { patients, pairs: block.pairs || [], cosmic: block.cosmic || null };
  }
  if (!block.profile?.cis_Lcn) return null;
  const id = patientId || "patient";
  return {
    patients: { [id]: { profile: block.profile, bg: block.background_detail || {}, siteFit: block.site_fit } },
    pairs: (block.pairs || []).map((p) => ({ ...p, patient: p.patient || id })),
    cosmic: block.cosmic || null,
  };
}

/** Pair filters: site filter, context subset, distance exclusion, patient exclusion, counted (callable) only. */
export function selectPairs(pairs, { filter = "all", subset = "all", excludeNear = false, excludePatients = [], countedOnly = true, signature = null } = {}) {
  return (pairs || []).filter((p) => {
    if (countedOnly && !p.in_territory) return false;
    if (excludePatients.includes(p.patient)) return false;
    if (excludeNear && p.dist < NEAR_EXCLUDE_BP) return false;
    if (filter === "qc" && !p.qc) return false;
    if (filter === "qc_fit" && !(p.qc && p.fit != null && p.fit >= 0.5)) return false;
    if (subset === "apobec" && !p.apobec) return false;
    if (subset === "other" && p.apobec) return false;
    if (signature && p.sig !== signature) return false;
    return true;
  });
}

/** Included patient ids. */
export const includedPatients = (cd, excludePatients = []) => Object.keys(cd?.patients || {}).filter((p) => !excludePatients.includes(p));

const subsetKey = (subset) => (subset === "apobec" || subset === "other" ? subset : "all");

/**
 * Per-tile callable bases (raw and CN-weighted) and expected SNVs under the CN-matched background, summed over the
 * included patients: { step, n, cis: {L, Lcn, E, Ecn}, trans: {...} }. Tiles closer than 500 bp are zeroed when excludeNear.
 */
export function profileSums(cd, { patients, filter = "all", subset = "all", excludeNear = false } = {}) {
  const ids = patients || Object.keys(cd?.patients || {});
  const first = cd?.patients?.[ids[0]]?.profile;
  if (!first) return null;
  const n = first.cis_L.length;
  const step = first.step;
  const out = { step, n, cis: { L: zeros(n), Lcn: zeros(n), E: zeros(n), Ecn: zeros(n) }, trans: { L: zeros(n), Lcn: zeros(n), E: zeros(n), Ecn: zeros(n) } };
  ids.forEach((p) => {
    const { profile, bg } = cd.patients[p];
    const b = bg?.[filter] || bg?.all;
    const classes = b?.classes?.[subsetKey(subset)] || {};
    const kAll = sum(Object.values(classes).map((c) => c.k || 0));
    const lcnAll = sum(Object.values(classes).map((c) => c.Lcn || 0));
    const rpc = lcnAll > 0 ? kAll / lcnAll : 0;
    ["cis", "trans"].forEach((side) => {
      const L = profile[`${side}_L`];
      const Lcn = profile[`${side}_Lcn`];
      const byCn = profile[`${side}_L_by_cn`] || {};
      for (let t = 0; t < n; t += 1) {
        if (excludeNear && (t + 1) * step <= NEAR_EXCLUDE_BP) continue;
        out[side].L[t] += L[t] || 0;
        out[side].Lcn[t] += Lcn[t] || 0;
        out[side].Ecn[t] += (Lcn[t] || 0) * rpc;
        Object.entries(byCn).forEach(([cl, arr]) => {
          const r = (classes[cl]?.rate ?? 0) / 1e6;
          out[side].E[t] += (arr[t] || 0) * r;
        });
      }
    });
  });
  return out;
}

/** SNV counts per tile and side from pairs. */
export function tileCounts(pairs, step, n) {
  const cis = zeros(n);
  const trans = zeros(n);
  pairs.forEach((p) => {
    const t = Math.floor(p.dist / step);
    if (t < 0 || t >= n) return;
    (p.side === "cis" ? cis : trans)[t] += 1;
  });
  return { cis, trans };
}

/** Byar's approximation to the exact Poisson 95% interval of a count. */
export function poissonCi(k) {
  const z = 1.959964;
  const lo = k === 0 ? 0 : k * (1 - 1 / (9 * k) - z / (3 * Math.sqrt(k))) ** 3;
  const k1 = k + 1;
  const hi = k1 * (1 - 1 / (9 * k1) + z / (3 * Math.sqrt(k1))) ** 3;
  return [Math.max(0, lo), hi];
}

const rateRow = (k, L, per = 1e3) => {
  if (!(L > 0)) return { k, L, rate: null, lo: null, hi: null };
  const [lo, hi] = poissonCi(k);
  return { k, L, rate: (k / L) * per, lo: (lo / L) * per, hi: (hi / L) * per };
};

/** Rate ratio a/b of two Poisson rates with the conditional (Wald on log) 95% CI; null when undefined. */
export function rateRatio(k1, L1, k2, L2) {
  if (!(L1 > 0 && L2 > 0) || k1 + k2 === 0) return { rr: null, lo: null, hi: null };
  const rr = k2 > 0 ? k1 / L1 / (k2 / L2) : null;
  const se = Math.sqrt(1 / (k1 + 0.5) + 1 / (k2 + 0.5));
  const c = Math.log((k1 + 0.5) / L1 / ((k2 + 0.5) / L2));
  return { rr, lo: Math.exp(c - 1.96 * se), hi: Math.exp(c + 1.96 * se) };
}

/**
 * Bins of `size` bp (multiple of the tile step) out to maxD on each side: SNVs, callable, rates per callable kb
 * (raw and CN-adjusted), background (CN-matched expected rate) and cis/trans ratios.
 */
export function binnedSeries(prof, counts, { size = 1000, maxD = 50000 } = {}) {
  if (!prof) return [];
  const per = Math.max(1, Math.round(size / prof.step));
  const nb = Math.ceil(Math.min(maxD, prof.n * prof.step) / (per * prof.step));
  const rows = [];
  for (let b = 0; b < nb; b += 1) {
    const t0 = b * per;
    const t1 = Math.min(prof.n, t0 + per);
    const s = (arr) => sum(arr.slice(t0, t1));
    const side = (sd) => {
      const k = s(counts[sd]);
      const L = s(prof[sd].L);
      const Lcn = s(prof[sd].Lcn);
      return { ...rateRow(k, L), cn: rateRow(k, Lcn), E: s(prof[sd].E), Ecn: s(prof[sd].Ecn), meanCn: L > 0 ? (2 * Lcn) / L : null };
    };
    const cis = side("cis");
    const trans = side("trans");
    const Lb = cis.L + trans.L;
    const Lcnb = cis.cn.L + trans.cn.L;
    rows.push({
      lo: t0 * prof.step,
      hi: t1 * prof.step,
      cis,
      trans,
      bg: Lb > 0 ? ((cis.E + trans.E) / Lb) * 1e3 : null,
      bgCn: Lcnb > 0 ? ((cis.Ecn + trans.Ecn) / Lcnb) * 1e3 : null,
      rr: rateRatio(cis.k, cis.L, trans.k, trans.L),
      rrCn: rateRatio(cis.k, cis.cn.L, trans.k, trans.cn.L),
    });
  }
  return rows;
}

/** Window totals (0..maxD) with raw and CN-adjusted cis/trans and vs-background ratios. */
export function windowSummary(prof, counts, maxD = 5000) {
  if (!prof) return null;
  const n = Math.min(prof.n, Math.round(maxD / prof.step));
  const s = (a) => sum(a.slice(0, n));
  const side = (sd) => ({ k: s(counts[sd]), L: s(prof[sd].L), Lcn: s(prof[sd].Lcn), E: s(prof[sd].E), Ecn: s(prof[sd].Ecn) });
  const c = side("cis");
  const t = side("trans");
  const oe = (k, E) => {
    if (!(E > 0)) return { rr: null, lo: null, hi: null };
    const [lo, hi] = poissonCi(k);
    return { rr: k / E, lo: lo / E, hi: hi / E };
  };
  return {
    maxD,
    cis: c,
    trans: t,
    rr: rateRatio(c.k, c.L, t.k, t.L),
    rrCn: rateRatio(c.k, c.Lcn, t.k, t.Lcn),
    cisBg: oe(c.k, c.E),
    transBg: oe(t.k, t.E),
    cisBgCn: oe(c.k, c.Ecn),
    transBgCn: oe(t.k, t.Ecn),
  };
}

/**
 * Gaussian-kernel smoothed rate per callable kb at each tile: sum K*k / sum K*L, on each side separately (the kernel
 * does not cross the breakpoint). bandwidth = kernel SD in bp. Returns { x: tile mid distances, cis, trans, bg }.
 */
export function smoothRate(prof, counts, { bandwidth = 1000, cn = false, maxD = 50000 } = {}) {
  if (!prof) return null;
  const n = Math.min(prof.n, Math.round(maxD / prof.step));
  const h = Math.max(prof.step, bandwidth) / prof.step;
  const w = Math.ceil(3 * h);
  const kern = Array.from({ length: 2 * w + 1 }, (_, i) => Math.exp(-0.5 * ((i - w) / h) ** 2));
  const sm = (num, den) =>
    Array.from({ length: n }, (_, t) => {
      let a = 0;
      let b = 0;
      for (let j = -w; j <= w; j += 1) {
        const u = t + j;
        if (u < 0 || u >= n) continue;
        a += kern[j + w] * num[u];
        b += kern[j + w] * den[u];
      }
      return b > 0 ? (a / b) * 1e3 : null;
    });
  const den = (sd) => (cn ? prof[sd].Lcn : prof[sd].L);
  const exp = (sd) => (cn ? prof[sd].Ecn : prof[sd].E);
  return {
    x: Array.from({ length: n }, (_, t) => (t + 0.5) * prof.step),
    cis: sm(counts.cis, den("cis")),
    trans: sm(counts.trans, den("trans")),
    bgCis: sm(exp("cis"), den("cis")),
    bgTrans: sm(exp("trans"), den("trans")),
  };
}

/** Genome-wide background rate per callable kb over the included patients (raw and per diploid-equivalent kb) with CI. */
export function backgroundRate(cd, { patients, filter = "all", subset = "all" } = {}) {
  let k = 0;
  let L = 0;
  let Lcn = 0;
  (patients || []).forEach((p) => {
    const b = cd.patients[p]?.bg?.[filter] || cd.patients[p]?.bg?.all;
    Object.values(b?.classes?.[subsetKey(subset)] || {}).forEach((c) => {
      k += c.k || 0;
      L += c.L || 0;
      Lcn += c.Lcn || 0;
    });
  });
  return { k, raw: rateRow(k, L), cn: rateRow(k, Lcn) };
}

/** Signed-distance points for the strip plot: x > 0 cis, x < 0 trans. */
export const scatterPoints = (pairs) => pairs.map((p) => ({ ...p, x: p.side === "cis" ? p.dist : -p.dist }));

/** Symmetric log transform for the distance axis: sign(x) * log10(1 + |x| / 100). */
export const symlog = (x) => Math.sign(x) * Math.log10(1 + Math.abs(x) / 100);

/** COSMIC reference ({ names, columns: Float64Array(96) in SBS96 order }) from the exported profiles. */
export function cosmicReference(cosmic, names = null) {
  if (!cosmic?.profiles || !cosmic.channels) return null;
  const idx = cosmic.channels.map((c) => SBS96.indexOf(c));
  const use = (names || Object.keys(cosmic.profiles)).filter((s) => cosmic.profiles[s]);
  return {
    names: use,
    columns: use.map((s) => {
      const col = new Float64Array(96);
      cosmic.profiles[s].forEach((v, i) => {
        if (idx[i] >= 0) col[idx[i]] = v;
      });
      return col;
    }),
  };
}

/** SBS96 proportions of the cis pairs, trans pairs and the background windows (sum of included patients). */
export function spectra(cd, pairs, { patients, filter = "all" } = {}) {
  const uniq = (arr) => [...new Map(arr.map((p) => [`${p.patient}|${p.snv}`, p])).values()];
  const cis = sbs96Counts(uniq(pairs.filter((p) => p.side === "cis")).map((p) => p.context)).counts;
  const trans = sbs96Counts(uniq(pairs.filter((p) => p.side === "trans")).map((p) => p.context)).counts;
  const bg = new Float64Array(96);
  (patients || []).forEach((p) => {
    const s = (cd.patients[p]?.bg?.[filter] || cd.patients[p]?.bg?.all)?.spectrum || {};
    Object.entries(s).forEach(([ch, v]) => {
      const i = SBS96.indexOf(ch);
      if (i >= 0) bg[i] += v;
    });
  });
  const norm = (a) => {
    const t = sum(Array.from(a));
    return { counts: Array.from(a), n: t, frac: Array.from(a).map((v) => (t ? v / t : 0)) };
  };
  return { cis: norm(cis), trans: norm(trans), background: norm(bg) };
}

/**
 * Per-signature expected counts among the selected pairs (sum of per-SNV posteriors) vs the background expectation
 * (n near SNVs of each patient x that patient's background posterior share), with an approximate Poisson CI.
 */
export function signatureEnrichment(cd, pairs, { patients, filter = "all" } = {}) {
  const uniq = [...new Map(pairs.map((p) => [`${p.patient}|${p.snv}`, p])).values()];
  const obs = {};
  const nByP = {};
  uniq.forEach((p) => {
    nByP[p.patient] = (nByP[p.patient] || 0) + 1;
    Object.entries(p.sig_post || {}).forEach(([s, v]) => (obs[s] = (obs[s] || 0) + v));
  });
  const exp = {};
  (patients || []).forEach((p) => {
    const b = cd.patients[p]?.bg?.[filter] || cd.patients[p]?.bg?.all;
    if (!b?.k || !nByP[p]) return;
    Object.entries(b.sig_post || {}).forEach(([s, v]) => (exp[s] = (exp[s] || 0) + (nByP[p] * v) / b.k));
  });
  const names = [...new Set([...Object.keys(obs), ...Object.keys(exp)])];
  return names
    .map((s) => {
      const o = obs[s] || 0;
      const e = exp[s] || 0;
      const [lo, hi] = poissonCi(o);
      return { signature: s, observed: o, expected: e, ratio: e > 0 ? o / e : null, lo: e > 0 ? lo / e : null, hi: e > 0 ? hi / e : null };
    })
    .sort((a, b) => b.observed - a.observed);
}

/** Refit (SigProfilerAssignment-style stepwise NNLS) of the selected SNVs' spectrum on the patients' fitted signatures. */
export function refitNear(reference, pairs, { minSnvs = 20 } = {}) {
  const uniq = [...new Map(pairs.map((p) => [`${p.patient}|${p.snv}`, p])).values()];
  const { counts, used } = sbs96Counts(uniq.map((p) => p.context));
  if (!reference) return { status: "na", reason: "COSMIC profiles not in the export", n: used };
  if (used < minSnvs) return { status: "na", reason: `${used} SNVs; a refit needs at least ${minSnvs}`, n: used };
  const fit = fitSignatures(counts, reference);
  return { status: "ok", n: used, cosine: fit.cosine, activities: fit.activities.map((a) => ({ ...a, share: a.activity / fit.total })) };
}

/** Inter-mutation distance: for each selected SNV, the distance to the nearest other selected SNV (same patient, chromosome). */
export function interMutationDistances(pairs) {
  const uniq = [...new Map(pairs.map((p) => [`${p.patient}|${p.snv}`, p])).values()];
  const by = {};
  uniq.forEach((p) => (by[`${p.patient}|${p.chrom}`] = by[`${p.patient}|${p.chrom}`] || []).push(p));
  const out = [];
  Object.values(by).forEach((arr) => {
    arr.sort((a, b) => a.pos - b.pos);
    arr.forEach((p, i) => {
      const d = Math.min(i > 0 ? p.pos - arr[i - 1].pos : Infinity, i < arr.length - 1 ? arr[i + 1].pos - p.pos : Infinity);
      out.push({ ...p, imd: Number.isFinite(d) ? d : null });
    });
  });
  const f = out.map((p) => p.imd).filter((d) => d != null);
  return {
    rows: out.sort((a, b) => (a.imd ?? Infinity) - (b.imd ?? Infinity)),
    n: out.length,
    under1kb: f.filter((d) => d < 1000).length,
    under10kb: f.filter((d) => d < 10000).length,
    median: f.length ? [...f].sort((a, b) => a - b)[Math.floor(f.length / 2)] : null,
  };
}

/** Candidate signature rows: present in the fits or not, with the enrichment row when present. */
export function candidateRows(enrich) {
  return CANDIDATE_SIGNATURES.map((c) => {
    const rows = enrich.filter((e) => e.signature === c.signature || (c.signature === "SBS40" && /^SBS40/.test(e.signature)));
    const o = sum(rows.map((r) => r.observed));
    const e = sum(rows.map((r) => r.expected));
    const [lo, hi] = poissonCi(o);
    return { ...c, inFit: rows.length > 0, observed: o, expected: e, ratio: e > 0 ? o / e : null, lo: e > 0 ? lo / e : null, hi: e > 0 ? hi / e : null };
  });
}

const SIG_PALETTE = {
  SBS1: "#4e79a7",
  SBS5: "#f28e2b",
  SBS40a: "#59a14f",
  SBS40b: "#8cd17d",
  SBS40c: "#3b7a3a",
  SBS8: "#e15759",
  SBS37: "#b07aa1",
  SBS2: "#ff9da7",
  SBS13: "#d4687a",
  SBS18: "#9c755f",
  SBS46: "#76b7b2",
};
const EXTRA = ["#edc948", "#bab0ac", "#86bcb6", "#d37295", "#a0cbe8", "#ffbe7d"];

/** Stable colour for a signature name (grey when unassigned). */
export function sigColor(sig) {
  if (!sig) return "#9e9e9e";
  if (SIG_PALETTE[sig]) return SIG_PALETTE[sig];
  let h = 0;
  for (let i = 0; i < sig.length; i += 1) h = (h * 31 + sig.charCodeAt(i)) % EXTRA.length;
  return EXTRA[h];
}
