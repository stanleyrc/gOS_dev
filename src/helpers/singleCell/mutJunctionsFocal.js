// Focal mutations near junctions: SNV rate on the cis (fused) vs trans side of each junction breakend in
// 0-1 / 1-2 / 2-5 / 5-50 kb bins, per callable Mb, against a same-chromosome background. Data: the `focal`
// (diploid TMB territory) and `focal_nonN` (all autosomal non-N bases) blocks of data/<P>/mut_junctions.json and
// _cohort/mut_junctions.json (schemaVersion 2, srctools inst/gos_single_cell/mut_junctions.py). d3-free.

export const FOCAL_FILTERS = [
  { value: "all", label: "All tree sites" },
  { value: "qc", label: "Site QC" },
  { value: "qc_fit", label: "QC + tree fit" },
];
export const FOCAL_SUBSETS = [
  { value: "all", label: "All SNVs" },
  { value: "apobec", label: "APOBEC (TCW)" },
  { value: "other", label: "Other contexts" },
];
export const TERRITORIES = [
  { value: "focal", label: "All callable (CN-normalised)" },
  { value: "focal_diploid", label: "Diploid territory only" },
];
export const SIDES = ["cis", "trans"];

const num = (x) => (Number.isFinite(x) ? x : null);

/** The focal block of a patient or cohort file, or null when absent / not ok. */
export function focalBlock(data, territory = "focal") {
  const b = data?.[territory];
  if (!b) return null;
  if (b.status && b.status !== "ok") return null;
  if (!b.results) return null;
  return b;
}

/** Why there is no focal result, or null. */
export function focalUnavailable(data, territory = "focal") {
  if (!data) return "mut_junctions.json has not been exported";
  if (data.status && data.status !== "ok") return data.reason || "analysis did not run";
  const b = data[territory];
  if (!b) return "this mut_junctions.json predates the focal analysis (schemaVersion 2)";
  if (b.status && b.status !== "ok") return b.reason || "focal analysis did not run";
  return null;
}

/** Filters actually computed for this block (QC filters need snv_qc.json). */
export function availableFilters(block) {
  return FOCAL_FILTERS.filter((f) => block?.results?.[f.value]);
}

const sideRow = (s, cn = false) =>
  cn
    ? { k: s?.k ?? 0, L: s?.Lcn ?? 0, rate: num(s?.rate_cn), lo: num(s?.ci_cn?.[0]), hi: num(s?.ci_cn?.[1]), meanCn: num(s?.mean_cn) }
    : { k: s?.k ?? 0, L: s?.L ?? 0, rate: num(s?.rate), lo: num(s?.ci?.[0]), hi: num(s?.ci?.[1]), meanCn: num(s?.mean_cn) };
const rrRow = (r) => ({ rr: num(r?.rr), lo: num(r?.ci?.[0]), hi: num(r?.ci?.[1]), p: num(r?.p) });

/** One bin; cn = true reads the copy-number adjusted rates and ratios (schemaVersion 4) when present. */
function binRow(b, cn = false) {
  const useCn = cn && b.cis?.rate_cn !== undefined;
  return {
    label: b.label,
    lo: b.lo,
    hi: b.hi,
    cn: useCn,
    cis: sideRow(b.cis, useCn),
    trans: sideRow(b.trans, useCn),
    bg: num(useCn ? b.background?.rate_cn : b.background?.rate),
    expCis: num(useCn ? b.background?.exp_cis_cn : b.background?.exp_cis),
    expTrans: num(useCn ? b.background?.exp_trans_cn : b.background?.exp_trans),
    cisTrans: rrRow(useCn ? b.rr_cis_trans_cn : b.rr_cis_trans),
    cisTransRaw: rrRow(b.rr_cis_trans),
    cisTransCn: b.rr_cis_trans_cn ? rrRow(b.rr_cis_trans_cn) : null,
    cisBg: rrRow(useCn ? b.rr_cis_bg_cn : b.rr_cis_bg),
    transBg: rrRow(useCn ? b.rr_trans_bg_cn : b.rr_trans_bg),
  };
}

/** Chart rows (one per distance bin) for a filter x subset. */
export function focalSeries(block, filter = "all", subset = "all", cn = false) {
  const r = block?.results?.[filter]?.[subset];
  return (r?.bins || []).map((b) => binRow(b, cn));
}

/** The primary 0-5 kb window row, with the permutation results. */
export function focalPrimary(block, filter = "all", subset = "all", cn = false) {
  const r = block?.results?.[filter]?.[subset];
  if (!r?.primary) return null;
  return { ...binRow(r.primary, cn), perm: r.perm || null };
}

/** "1.23 (0.45-3.10)" for a rate ratio row; open-ended CIs show as "inf". */
export function fmtRr(r) {
  if (!r) return "n/a";
  const f = (x) => (x == null ? "inf" : x >= 10 ? x.toFixed(0) : x.toFixed(2));
  if (r.rr == null) return r.lo == null && r.hi == null ? "n/a" : `inf (${f(r.lo)}-${f(r.hi)})`;
  return `${f(r.rr)} (${f(r.lo)}-${f(r.hi)})`;
}

export const fmtRate = (x) => (x == null ? "n/a" : x >= 10 ? x.toFixed(0) : x.toFixed(1));

const fmtPv = (p) => (p == null ? "n/a" : p >= 0.01 ? p.toFixed(2) : p.toExponential(1));

/** One-sentence summary of the 0-5 kb window. */
export function focalHeadline(block, filter = "all", subset = "all", cn = false) {
  const p = focalPrimary(block, filter, subset, cn);
  if (!p) return "Not available (no focal result for this filter).";
  const { cis, trans } = p;
  const unit = p.cn ? "diploid-equivalent kb" : "callable kb";
  const parts = [
    `Within 5 kb: ${cis.k} SNVs on the cis side (${fmtRate(cis.rate)}/Mb over ${(cis.L / 1e3).toFixed(0)} ${unit}${cis.meanCn != null ? `, mean CN ${cis.meanCn.toFixed(2)}` : ""}) vs ${trans.k} on the trans side (${fmtRate(trans.rate)}/Mb over ${(trans.L / 1e3).toFixed(0)} ${unit}${trans.meanCn != null ? `, CN ${trans.meanCn.toFixed(2)}` : ""})`,
    `cis/trans rate ratio ${p.cisTransCn ? `raw ${fmtRr(p.cisTransRaw)}, CN-adjusted ${fmtRr(p.cisTransCn)}` : fmtRr(p.cisTrans)}`,
    p.bg != null ? `background ${fmtRate(p.bg)}/Mb; cis/background ${fmtRr(p.cisBg)}, trans/background ${fmtRr(p.transBg)}` : null,
  ];
  const sh = p.perm?.shift;
  const fl = p.perm?.flip;
  const flc = p.perm?.flip_cn;
  if (sh || fl) parts.push(`permutation p (two-sided): ${sh ? `junction shift ${fmtPv(sh.p_two_sided)}, ` : ""}orientation flip ${fmtPv(fl?.p_two_sided)}${flc ? ` (CN-adjusted ${fmtPv(flc.p_two_sided)})` : ""}`);
  if (cis.k + trans.k < 10) parts.push("few SNVs, so the interval is wide");
  return `${parts.filter(Boolean).join("; ")}.`;
}

/** Whether an SNV x breakend pair passes a filter and subset. */
export function pairPasses(p, filter = "all", subset = "all") {
  if (filter === "qc" && !p.qc) return false;
  if (filter === "qc_fit" && !(p.qc && p.fit != null && p.fit >= 0.5)) return false;
  if (subset === "apobec" && !p.apobec) return false;
  if (subset === "other" && p.apobec) return false;
  return true;
}

/** SNV x breakend pairs in a bin (label of a FOCAL bin, or "0-5 kb"), optionally one side, counted SNVs only. */
export function pairsInBin(block, { bin = null, side = null, filter = "all", subset = "all", countedOnly = true } = {}) {
  const lim = bin === "0-5 kb" ? { lo: 0, hi: 5000 } : (block?.bins || []).find((b) => b.label === bin) || null;
  return (block?.pairs || []).filter(
    (p) =>
      pairPasses(p, filter, subset) &&
      (!countedOnly || p.in_territory) &&
      (!side || p.side === side) &&
      (!lim || (p.dist >= lim.lo && p.dist < lim.hi)),
  );
}

/** Unique SNV ids of a list of pairs (for isolating them on the SNV heatmap). */
export const pairSnvIds = (pairs) => [...new Set(pairs.map((p) => p.snv))];

/**
 * Upper end of the y axis (SNVs per Mb): rates and background with head room. CI tops are not included (with a
 * handful of SNVs per bin they are an order of magnitude above the rates); whiskers above the axis are drawn clipped.
 */
export function rateTop(series) {
  const v = series.flatMap((s) => [s.cis.rate, s.trans.rate, s.bg]).filter((x) => Number.isFinite(x));
  return Math.max(1, ...v) * 1.35;
}

/** Forest rows: per patient cis/trans rate ratio in the 0-5 kb window, plus the Mantel-Haenszel pooled row. */
export function forestRows(cohortBlock, filter = "all", subset = "all", cn = false) {
  const pick = (r, k) => (cn && r[`${k}_cn`] ? r[`${k}_cn`] : r[k]);
  const rows = (cohortBlock?.forest?.[filter]?.[subset] || []).map((r) => ({
    id: r.patient,
    nBreakends: r.n_breakends,
    kc: r.cis?.k ?? 0,
    kt: r.trans?.k ?? 0,
    cisRate: num(r.cis?.rate),
    transRate: num(r.trans?.rate),
    ...rrRow(pick(r, "rr_cis_trans")),
    cisBg: rrRow(pick(r, "rr_cis_bg")),
    transBg: rrRow(pick(r, "rr_trans_bg")),
    pooled: false,
  }));
  const prim = cohortBlock?.results?.[filter]?.[subset]?.primary;
  if (prim) {
    rows.push({
      id: "Pooled (MH)",
      kc: prim.cis?.k ?? 0,
      kt: prim.trans?.k ?? 0,
      cisRate: num(prim.cis?.rate),
      transRate: num(prim.trans?.rate),
      ...rrRow(pick(prim, "rr_cis_trans")),
      cisBg: rrRow(pick(prim, "rr_cis_bg")),
      transBg: rrRow(pick(prim, "rr_trans_bg")),
      pooled: true,
    });
  }
  return rows;
}

/** Position on a log axis clamped to [min, max]; returns { x, clipped }. */
export function logPos(v, { min = 0.05, max = 50, x0 = 0, x1 = 1 } = {}) {
  if (v == null || !(v > 0)) return { x: v === 0 ? x0 : x1, clipped: true };
  const c = Math.min(max, Math.max(min, v));
  const t = (Math.log(c) - Math.log(min)) / (Math.log(max) - Math.log(min));
  return { x: x0 + t * (x1 - x0), clipped: c !== v };
}

/** Strata rows (junction class, clonality, fused side) for the 0-5 kb window. */
export function strataRows(block, filter = "all", cn = false) {
  const st = block?.strata?.[filter] || {};
  const label = { cls: "Junction class", clonality: "Clonality", fused_side: "Fused side" };
  return Object.entries(st).flatMap(([key, groups]) =>
    Object.entries(groups || {}).map(([g, b]) => ({
      key: `${key}:${g}`,
      stratum: label[key] || key,
      group: g,
      nBreakends: b.n_breakends,
      ...binRow({ ...b, label: g }, cn),
    })),
  );
}

/** Carrier-sharing rows: F1 of SNV vs junction carrier cells per bin and side, with the random-junction reference. */
export function carrierRows(block, filter = "all") {
  const rows = block?.carriers?.[filter] || [];
  return rows.map((r) => ({
    label: r.label,
    cis: r.cis,
    trans: r.trans,
    random: r.random_junction,
    mw: r.mannwhitney_cis_vs_trans || null,
  }));
}
