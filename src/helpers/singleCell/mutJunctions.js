// Mutations near SV junctions (data/<P>/mut_junctions.json and _cohort/mut_junctions.json, written by
// srctools inst/gos_single_cell/mut_junctions.py). d3-free helpers for the Signatures-tab card and the
// cohort view. Every number shown comes from those files; a missing input is reported as "not available".

export const DEFINITIONS = [
  { key: "tcw", label: "TCW motif (C>T / C>G)" },
  { key: "sbs", label: "SBS2 / SBS13 assignment" },
];

export const fmtP = (p) => {
  if (!Number.isFinite(p)) return "n/a";
  if (p >= 0.01) return p.toFixed(2);
  return p.toExponential(1).replace("e-", "e-").replace("e+", "e");
};

export const fmtPct = (f, digits = 1) => (Number.isFinite(f) ? `${(100 * f).toFixed(digits)}%` : "n/a");

export const fmtOr = (o) => {
  if (!o || !Number.isFinite(o.or ?? o.or_)) return "n/a";
  const v = o.or ?? o.or_;
  const ci = o.ci || [];
  const f = (x) => (Number.isFinite(x) ? (x >= 10 ? x.toFixed(0) : x.toFixed(2)) : "?");
  return `${f(v)} (${f(ci[0])}-${f(ci[1])})`;
};

export const fmtDist = (d) => {
  if (!Number.isFinite(d)) return "n/a";
  if (d >= 1e6) return `${(d / 1e6).toFixed(2)} Mb`;
  if (d >= 1e3) return `${(d / 1e3).toFixed(d >= 1e4 ? 0 : 1)} kb`;
  return `${d} bp`;
};

/** Why a patient file has no result, or null when it does. */
export function unavailableReason(data) {
  if (!data) return "mut_junctions.json has not been exported for this patient";
  if (data.status !== "ok") return data.reason || "analysis did not run";
  return null;
}

/** Rows for the distance-bin chart: observed fraction with CI against the callable-site background. */
export function binSeries(data, def = "tcw") {
  return (data?.bins || []).map((b) => {
    const o = b[def] || {};
    const bg = def === "tcw" ? b.background : null;
    return {
      label: b.label,
      n: b.n,
      k: o.k ?? 0,
      frac: o.frac,
      lo: o.ci?.[0],
      hi: o.ci?.[1],
      bgFrac: bg?.frac ?? null,
      bgN: bg?.n ?? null,
      bgLo: bg?.ci?.[0] ?? null,
      bgHi: bg?.ci?.[1] ?? null,
      obsOverBg: def === "tcw" ? b.tcw_obs_over_bg ?? null : null,
      binomP: def === "tcw" ? b.tcw_binom_p ?? null : null,
    };
  });
}

export const NEAR_OPTIONS = [
  { value: 1e5, label: "<= 100 kb" },
  { value: 1e6, label: "<= 1 Mb" },
];

/** The near-vs-far test block of a patient for a near radius (1e5 or 1e6), or null. */
export const testsFor = (data, near = 1e6) => (near >= 1e6 ? data?.tests_1mb : data?.tests) || null;
export const cooccurrenceFor = (data, near = 1e6) => (near >= 1e6 ? data?.cooccurrence_1mb : data?.cooccurrence) || null;

const fmtNear = (near) => (near >= 1e6 ? `${near / 1e6} Mb` : `${Math.round(near / 1000)} kb`);

/** One-sentence headline of the near-vs-far test for a patient. */
export function headline(data, def = "tcw", near = 1e6) {
  const reason = unavailableReason(data);
  if (reason) return `Not available (${reason}).`;
  const tests = testsFor(data, near);
  const t = tests?.[def];
  if (!t) return "Not available (test not computed).";
  const km = () => fmtNear(near);
  if (!data.snv_source?.apobec_signature_in_fit && def === "sbs") {
    return `No SBS2 or SBS13 in this patient's joint signature fit (${(data.snv_source?.signatures_in_joint_fit || []).join(", ")}), so no site is assigned to APOBEC; the TCW motif result is the model-free readout.`;
  }
  const perm = t.perm?.shift || t.perm?.callable || t.perm?.uniform;
  const parts = [
    `Within ${km()} of a junction ${fmtPct(t.near.frac)} of ${t.near.n} sites are ${def === "tcw" ? "TCW C>T/G" : "SBS2/13"} vs ${fmtPct(t.far.frac)} of ${t.far.n} far sites`,
    `OR ${fmtOr(t.fisher)}, Fisher p=${fmtP(t.fisher?.p)}`,
  ];
  const cs = t.chrom_stratified;
  if (cs) parts.push(`chromosome-stratified OR ${fmtOr(cs)}, p=${fmtP(cs.p)}`);
  if (perm) parts.push(`junction-shift permutation p=${fmtP(perm.p_one_sided)}`);
  return `${parts.join("; ")}.`;
}

/** Junction-adjacent APOBEC SNVs: filtered by definition and distance, sorted by distance or co-occurrence. */
export function adjacentRows(data, { def = "tcw", maxDist = 1e5, sort = "dist" } = {}) {
  const rows = (data?.adjacent_snvs || []).filter((r) => r[def] && r.dist <= maxDist);
  const key = sort === "f1" ? (a, b) => b.f1 - a.f1 || a.dist - b.dist : (a, b) => a.dist - b.dist || b.f1 - a.f1;
  return [...rows].sort(key);
}

/** Cells carrying a site in the redux SNV matrix ({ cells, status, variants[].id }). */
export function siteCarriers(snv, siteId) {
  if (!snv?.variants || !snv.status) return [];
  const c = snv.variants.findIndex((v) => v.id === siteId);
  if (c < 0) return [];
  return snv.cells.filter((_, p) => snv.status[p]?.[c] === 1);
}

/** Kataegis clusters of one criterion set ("strict" | "relaxed"). */
export function kataegisRows(data, mode = "strict") {
  const k = data?.kataegis?.[mode];
  if (!k) return { params: null, clusters: [] };
  return {
    singleBranch: k.n_single_branch ?? (k.clusters || []).filter((c) => c.single_branch).length,
    params: { minN: k.min_n, maxGap: k.max_gap, nullMean: k.null_mean, p: k.p, n: k.n_clusters },
    clusters: [...(k.clusters || [])].sort((a, b) => (a.nearest_junction_dist ?? Infinity) - (b.nearest_junction_dist ?? Infinity)),
  };
}

/** Locus string for IGV from a kataegis cluster (a little padding). */
export function clusterLocus(c, pad = 500) {
  return { chromosome: c.chrom.replace(/^chr/, ""), position: Math.round((c.start + c.end) / 2), start: Math.max(1, c.start - pad), end: c.end + pad };
}

const ratio = (x) => (x ? `${x.k}/${x.n}` : "n/a");

/** Co-occurrence summary text for the card. */
export function cooccurrenceText(data, near = 1e6) {
  const c = cooccurrenceFor(data, near);
  if (!c) return "Not available (no co-occurrence result).";
  const m = (x) => (x && Number.isFinite(x.median) ? `${x.median.toFixed(2)} (n=${x.n})` : "n/a");
  const mw = c.mannwhitney_near_tcw_vs_near_other;
  const mw2 = c.mannwhitney_near_tcw_vs_far_tcw;
  return [
    `Carrier-cell F1 between each near-junction TCW site and its junction: median ${m(c.f1_near_tcw)}; other near sites ${m(c.f1_near_other)}; far TCW sites vs a random junction ${m(c.f1_far_tcw_random_junction)}.`,
    mw ? `Near TCW vs near other: Mann-Whitney p=${fmtP(mw.p)}.` : null,
    mw2 ? `Near TCW vs far TCW: p=${fmtP(mw2.p)}.` : null,
    `F1 >= 0.5 (same branch): ${ratio(c["frac_near_tcw_f1_ge_0.5"])} near vs ${ratio(c["frac_far_tcw_f1_ge_0.5"])} far.`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Cohort table rows: one per patient (ok or not available) plus the available meta rows. */
export function cohortRows(cohort, def = "tcw", near = 1e6) {
  if (!cohort) return { patients: [], meta: [] };
  const key = near >= 1e6 ? "near_1000000" : "near_100000";
  const patients = Object.entries(cohort.patients || {}).map(([id, p]) => {
    const b = p[key] || {};
    return {
      id,
      nSites: p.n_sites,
      nJunctions: p.n_junctions,
      nNear: b.n_near,
      near: b[def]?.near,
      far: b[def]?.far,
      or: b[def]?.fisher,
      perm: b.tcw?.perm?.shift || b.tcw?.perm?.callable || b.tcw?.perm?.uniform || null,
      chromOr: b[def]?.chrom_stratified || null,
      apobecInFit: p.apobec_signature_in_fit,
      kataegisStrict: p.kataegis_strict,
      kataegisStrictSingle: p.kataegis_strict_single_branch,
      kataegisRelaxed: p.kataegis_relaxed,
      f1: b.f1_near_tcw,
      f1Other: b.f1_near_other,
      available: true,
    };
  });
  Object.entries(cohort.notAvailable || {}).forEach(([id, reason]) => patients.push({ id, available: false, reason }));
  const m = cohort.meta?.[near >= 1e6 ? "1000000" : "100000"]?.[def] || {};
  const meta = [];
  if (m.fixed) meta.push({ key: "fixed", label: "Fixed effect (inverse variance)", ...m.fixed });
  if (m.random) meta.push({ key: "random", label: "Random effects (DerSimonian-Laird)", ...m.random });
  if (m.mantel_haenszel && m.mantel_haenszel.or_ != null) meta.push({ key: "mh", label: "Mantel-Haenszel (patient strata)", ...m.mantel_haenszel });
  if (m.stouffer_perm_shift) meta.push({ key: "stouffer", label: "Stouffer (junction-shift permutation z per patient)", z: m.stouffer_perm_shift.z, p: m.stouffer_perm_shift.p_one_sided });
  return { patients, meta, heterogeneity: m.heterogeneity || null, nPatients: m.n_patients ?? 0 };
}
