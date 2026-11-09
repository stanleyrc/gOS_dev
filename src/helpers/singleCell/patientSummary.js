// d3-free: the patient summary strip at the top of a single-cell patient report, and the cohort quantile
// classes that drive the header's quantile legend. Sources: _cohort/tmb.json (srctools gos_sc_tmb.R),
// precompute/qc.json, the cell manifest and the tree provenance. Missing input -> null ("not available").

export const QUANTILE_LABELS = ["lower 25%", "mid 50%", "top 25%"];

const finite = (v) => v != null && v !== "" && Number.isFinite(+v);

export function median(values) {
  const v = (values || []).filter(finite).map(Number).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** Linear-interpolated quantile of a numeric array, null when empty. */
export function quantile(values, p) {
  const v = (values || []).filter(finite).map(Number).sort((a, b) => a - b);
  if (!v.length) return null;
  const pos = (v.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}

/** 0 (below the lower quartile), 1 (middle half), 2 (above the upper quartile); null when no cohort cut. */
export function quantileClass(value, cohortValues, minN = 4) {
  const vals = (cohortValues || []).filter(finite);
  if (!finite(value) || vals.length < minN) return null;
  const q1 = quantile(vals, 0.25);
  const q3 = quantile(vals, 0.75);
  return +value < q1 ? 0 : +value > q3 ? 2 : 1;
}

export const TMB_LABEL = "SNVs/Mb (our calls)";

/**
 * SNVs per Mb for one patient from _cohort/patient_summary_261109.json (srctools gos_sc_patient_summary.py; the
 * Figure 1 version A counts): truncal per Mb, and the median over tumor cells of the shared subclonal calls per
 * callable Mb and per cell, each with its quartile class among the cohort's patients.
 */
export function summarizeTmb(doc, patient) {
  const all = doc?.patients;
  const p = all && typeof all === "object" ? all[patient] : null;
  if (!p) return null;
  const col = (k) => Object.values(all).map((x) => x?.[k]);
  return {
    truncalPerMb: finite(p.truncal_per_mb) ? +p.truncal_per_mb : null,
    truncalSites: p.truncal_n ?? null,
    truncalCorrected: Boolean(p.truncal_corrected),
    truncalClass: quantileClass(p.truncal_per_mb, col("truncal_per_mb")),
    subclonalPerMb: finite(p.subclonal_per_mb_median) ? +p.subclonal_per_mb_median : null,
    subclonalClass: quantileClass(p.subclonal_per_mb_median, col("subclonal_per_mb_median")),
    subclonalPerCell: finite(p.subclonal_per_cell_median) ? +p.subclonal_per_cell_median : null,
    nCohort: Object.keys(all).length,
  };
}

/** The tree the page is drawn with: the label the Compare Trees dropdown gives it (trees/index.json entry "gos"), else a description. */
export function currentTreeLabel(altTrees, method, record) {
  const list = altTrees?.status === "ok" && Array.isArray(altTrees.data) ? altTrees.data : [];
  const cur = list.find((t) => t.name === "gos") || null;
  const d = describeTree(method, record);
  if (cur?.label) return { label: cur.label, detail: cur.note || d?.detail || "", kind: d?.label?.startsWith("older") ? "older" : method === "file" ? "current" : "other" };
  return d ? { label: d.label, detail: d.detail, kind: d.label.startsWith("older") ? "older" : d.label.startsWith("included") ? "current" : "other" } : null;
}

/** Tumor / normal counts: qc.json `normal` where present, else a clone named Normal. */
export function countTumorNormal(cells = [], qcRows = []) {
  const qc = new Map((qcRows || []).map((r) => [`${r.cell_id}`, r]));
  let normal = 0;
  cells.forEach((c) => {
    const r = qc.get(`${c.cell_id}`);
    if (typeof r?.normal === "boolean" ? r.normal : /^normal/i.test(`${c.clone_id ?? ""}`)) normal += 1;
  });
  return { total: cells.length, normal, tumor: cells.length - normal };
}

/** Median QC metrics over tumor cells (qc.json): het-site depth, MAPD, het sites per cell; null per metric when absent. */
export function summarizeQc(qcRows = []) {
  const tumor = (qcRows || []).filter((r) => r && r.normal !== true);
  if (!tumor.length) return null;
  return {
    n: tumor.length,
    hetDepth: median(tumor.map((r) => r.het_depth_med)),
    mapd: median(tumor.map((r) => r.mapd)),
    hetSites: median(tumor.map((r) => r.n_het)),
  };
}

/** Tree in use: { label, detail } from the loaded tree (method) and the datafiles record. */
export function describeTree(method, record) {
  const det = `${record?.tumor_details || ""}`;
  const old = det.match(/^old tree\s*\(([^)]*)\)/i);
  if (method === "file") return old ? { label: "older tree file", detail: old[1] } : { label: "included tree", detail: "tree.nwk" };
  if (method === "snv") return { label: "inferred from SNVs", detail: "no tree file; UPGMA on SNV distances" };
  if (method === "cn") return { label: "inferred from copy number", detail: "no tree file; UPGMA on CN distances" };
  return null;
}

/** Cells flagged by QC (qc.json flags, or the coverage-QC fail), of the cells that carry any QC call (tumor and normal); `unassessed` have none. */
export function countFlagged(cells = []) {
  let flagged = 0;
  let assessed = 0;
  cells.forEach((c) => {
    const flag = c["QC flag"];
    if (flag == null && c.QC == null) return;
    assessed += 1;
    if ((flag != null && flag !== "pass") || c.QC === "fail") flagged += 1;
  });
  return { flagged, assessed, unassessed: cells.length - assessed };
}
