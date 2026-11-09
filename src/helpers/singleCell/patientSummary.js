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

/**
 * TMB for one patient from the cohort tmb.json: truncal SNVs per callable Mb, and the median over tumor cells of
 * subclonal SNVs per cell; each with its class among the cohort's patients.
 */
export function summarizeTmb(cohortDoc, patient) {
  const all = cohortDoc?.patients;
  const p = Array.isArray(all) ? all.find((x) => x.patient === patient) : null;
  if (!p) return null;
  const truncal = p.patient_summary?.truncal?.tmb_corrected;
  const subclonalPerCell = (cells) => median((cells || []).map((c) => c.n_subclonal_alt));
  const cohortTruncal = all.map((x) => x.patient_summary?.truncal?.tmb_corrected);
  const cohortSub = all.map((x) => subclonalPerCell(x.cells));
  const sub = subclonalPerCell(p.cells);
  return {
    truncalPerMb: finite(truncal) ? +truncal : null,
    truncalSites: p.patient_summary?.truncal?.n_sites ?? null,
    truncalClass: quantileClass(truncal, cohortTruncal),
    subclonalPerCell: sub,
    subclonalClass: quantileClass(sub, cohortSub),
    nCohort: all.length,
    noisy: Boolean(p.noisy),
  };
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

/** Cells flagged by QC (qc.json flags, or the coverage-QC fail): count over the cells that carry any QC call. */
export function countFlagged(cells = []) {
  let flagged = 0;
  let assessed = 0;
  cells.forEach((c) => {
    const flag = c["QC flag"];
    if (flag == null && c.QC == null) return;
    assessed += 1;
    if ((flag != null && flag !== "pass") || c.QC === "fail") flagged += 1;
  });
  return { flagged, assessed };
}
