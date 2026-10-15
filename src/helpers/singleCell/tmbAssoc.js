// d3-free helpers for the cohort "TMB associations" card (_cohort/tmb_associations.json, srctools gos_sc_tmb_assoc.py).

export const MEASURES = [
  ["total", "Total"],
  ["subclonal", "Subclonal"],
  ["private", "Private (lower bound)"],
];
export const ADJUSTMENTS = [
  ["raw", "None"],
  ["qc", "Cell QC"],
  ["qc_region", "QC + region"],
  ["qc_clone", "QC + clone"],
  ["qc_clone_region", "QC + clone + region"],
  ["qc_sdna", "QC + DNA replication"],
];

export function fmtP(p) {
  if (p == null || !Number.isFinite(p)) return "n/a";
  if (p < 1e-3) return p.toExponential(1);
  return p.toFixed(3);
}

export function combinedOf(row, excludeNoisy) {
  return (excludeNoisy ? row?.combined_no_noisy : row?.combined) || null;
}

/** Forest rows: one per covariate for the measure / adjustment, sorted by |combined z|; per-patient dots with r. */
export function forestRows(doc, measure, adjust, excludeNoisy = false) {
  if (!doc?.numeric) return [];
  const noisy = new Set(Object.entries(doc.patients || {}).filter(([, v]) => v.noisy).map(([k]) => k));
  return doc.numeric
    .filter((r) => r.measure === measure && r.adjust === adjust)
    .map((r) => {
      const comb = combinedOf(r, excludeNoisy);
      const dots = Object.entries(r.per_patient || {})
        .filter(([p]) => !(excludeNoisy && noisy.has(p)))
        .map(([patient, t]) => ({ patient, r: t.r, p: t.p, n: t.n, noisy: noisy.has(patient) }));
      return { covariate: r.covariate, family: r.family, comb, dots };
    })
    .filter((r) => r.comb)
    .sort((a, b) => Math.abs(b.comb.z) - Math.abs(a.comb.z));
}

/** Scatter points of one covariate: { patient, x (covariate), y (TMB), state } over the DNA-RNA linked cells. */
export function scatterPoints(doc, covariate, measure, excludeNoisy = false) {
  const out = [];
  for (const [patient, cols] of Object.entries(doc?.cells || {})) {
    if (excludeNoisy && doc.patients?.[patient]?.noisy) continue;
    const xs = cols[covariate] || cols[`bin: ${covariate}`];
    const ys = cols[measure];
    if (!xs || !ys) continue;
    for (let i = 0; i < ys.length; i += 1) {
      const x = xs[i];
      const y = ys[i];
      if (typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y)) out.push({ patient, x, y, cell: cols.cell?.[i], state: cols.state?.[i] });
    }
  }
  return out;
}

export function geneTable(doc, measure, adjust, direction, excludeNoisy = false) {
  const g = doc?.genes?.[`${measure}|${adjust}`];
  if (!g) return null;
  const rows = (direction === "down" ? g.down : g.up) || [];
  return { meta: g, rows: excludeNoisy ? rows.filter((r) => r.z_no_noisy != null && Math.sign(r.z_no_noisy) === Math.sign(r.z)) : rows };
}

/** The MTORC1 module score vs subclonal / private TMB: per-patient direction for each adjustment. */
export function moduleSummary(doc, covariate = "Module: MTORC1 signalling (Hallmark)") {
  const out = [];
  for (const r of doc?.numeric || []) {
    if (r.covariate !== covariate || r.measure === "total") continue;
    out.push({
      measure: r.measure,
      adjust: r.adjust,
      combined: r.combined,
      combinedNoNoisy: r.combined_no_noisy,
      perPatient: Object.entries(r.per_patient || {}).map(([patient, t]) => ({ patient, r: t.r, p: t.p, dir: t.r > 0 ? "up" : t.r < 0 ? "down" : "flat" })),
    });
  }
  return out;
}

/** Unique covariate names in the numeric table, in order of first appearance. */
export function covariateNames(doc) {
  const seen = [];
  for (const r of doc?.numeric || []) if (!seen.includes(r.covariate)) seen.push(r.covariate);
  return seen;
}
