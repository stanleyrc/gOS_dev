// Coverage / copy-number QC of single cells (d3-free). Per-cell metrics are exported into each cell's
// metadata.json as qc_* fields (analysis/cell_qc/cell_qc_apply.R); pass/fail is recomputed here from the
// editable thresholds, so the QC tab can move them live. Layout: layout.hideLowQc (bool), layout.covQcThresholds
// ({ metric: number }); URL: ?hidelowqc=1 and ?qcthr=mapd:0.2,zero:0.05.

// key: URL name; field: cell field; dir: "max" fails above the threshold, "min" fails below it
export const COV_QC_METRICS = [
  { key: "mapd", field: "qc_mapd", dir: "max", label: "MAPD (noise)", reason: "noisy coverage", step: 0.01, digits: 3 },
  { key: "zero", field: "qc_zero_bin_frac", dir: "max", label: "Bins with zero coverage", reason: "coverage dropout", step: 0.01, digits: 3 },
  { key: "cn0", field: "qc_cn0_frac", dir: "max", label: "Genome at CN 0", reason: "CN 0 over much of the genome", step: 0.05, digits: 3 },
  { key: "segs", field: "qc_seg_per_gb", dir: "max", label: "Segments per Gb", reason: "over-segmented", step: 5, digits: 0 },
];

// Anchored in the gbm-sc cells (analysis/cell_qc/out/reference_quantiles.tsv): ~98.5-99th percentile of 2,098 cells
export const DEFAULT_COV_QC = { mapd: 0.2, zero: 0.05, cn0: 0.25, segs: 300 };

export const QC_FIELD = "QC";
export const QC_REASON_FIELD = "QC reason";
export const QC_PARAM = "hidelowqc";
export const QC_THRESHOLD_PARAM = "qcthr";

const num = (v) => (v == null || v === "" || Number.isNaN(+v) ? null : +v);

/** Thresholds with defaults filled in. */
export function resolveThresholds(thr) {
  const out = { ...DEFAULT_COV_QC };
  Object.entries(thr || {}).forEach(([k, v]) => {
    if (k in out && num(v) != null) out[k] = +v;
  });
  return out;
}

/** True when the cell carries coverage-QC metrics. */
export function hasCovQc(cell) {
  return COV_QC_METRICS.some((m) => num(cell?.[m.field]) != null);
}

/** { has, pass, reasons: [text] } for one cell. Cells without metrics are never failed. */
export function covQcStatus(cell, thresholds) {
  const thr = resolveThresholds(thresholds);
  const reasons = [];
  let has = false;
  COV_QC_METRICS.forEach((m) => {
    const v = num(cell?.[m.field]);
    if (v == null) return;
    has = true;
    const fail = m.dir === "max" ? v > thr[m.key] : v < thr[m.key];
    if (fail) reasons.push(m.reason);
  });
  return { has, pass: reasons.length === 0, reasons };
}

/** Set of cell ids failing the thresholds. */
export function covQcFailedIds(cells = [], thresholds) {
  const out = new Set();
  cells.forEach((c) => {
    const s = covQcStatus(c, thresholds);
    if (s.has && !s.pass) out.add(`${c.cell_id}`);
  });
  return out;
}

/** Cells with the QC and QC reason fields added (for annotation strips); unchanged when none carry metrics. */
export function withCovQcFields(cells = [], thresholds) {
  if (!cells.some(hasCovQc)) return cells;
  return cells.map((c) => {
    const s = covQcStatus(c, thresholds);
    if (!s.has) return c;
    return { ...c, [QC_FIELD]: s.pass ? "pass" : "fail", [QC_REASON_FIELD]: s.pass ? "pass" : s.reasons.join(", ") };
  });
}

/** Failing counts per metric (a cell may count under several). */
export function covQcCounts(cells = [], thresholds) {
  const thr = resolveThresholds(thresholds);
  const out = Object.fromEntries(COV_QC_METRICS.map((m) => [m.key, 0]));
  cells.forEach((c) => {
    COV_QC_METRICS.forEach((m) => {
      const v = num(c?.[m.field]);
      if (v != null && (m.dir === "max" ? v > thr[m.key] : v < thr[m.key])) out[m.key] += 1;
    });
  });
  return out;
}

/** ?hidelowqc=1 -> true, =0 -> false, absent -> null. */
export function hideLowQcFromSearch(search = "") {
  const v = new URLSearchParams(search).get(QC_PARAM);
  if (v == null) return null;
  return /^(1|true|yes)$/i.test(v) ? true : /^(0|false|no)$/i.test(v) ? false : null;
}

/** ?qcthr=mapd:0.2,zero:0.05 -> { mapd: 0.2, zero: 0.05 } (known keys only), or null. */
export function thresholdsFromSearch(search = "") {
  const raw = new URLSearchParams(search).get(QC_THRESHOLD_PARAM);
  if (!raw) return null;
  const out = {};
  raw.split(",").forEach((pair) => {
    const [k, v] = pair.split(":");
    if (COV_QC_METRICS.some((m) => m.key === k) && num(v) != null) out[k] = +v;
  });
  return Object.keys(out).length ? out : null;
}

/** Search string with the hide flag and the thresholds that differ from the defaults. */
export function withCovQcSearch(search = "", on = false, thresholds = null) {
  const params = new URLSearchParams(search);
  if (on) params.set(QC_PARAM, "1");
  else params.delete(QC_PARAM);
  const thr = resolveThresholds(thresholds);
  const diff = COV_QC_METRICS.filter((m) => thr[m.key] !== DEFAULT_COV_QC[m.key]).map((m) => `${m.key}:${thr[m.key]}`);
  if (on && diff.length) params.set(QC_THRESHOLD_PARAM, diff.join(","));
  else params.delete(QC_THRESHOLD_PARAM);
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** Annotation strips shown: the chosen ones that exist, plus the QC strip (pass/fail) whenever cells carry QC metrics. */
export function withQcColumn(chosen = [], options = []) {
  const out = (chosen || []).filter((f) => options.includes(f));
  if (options.includes(QC_FIELD) && !out.includes(QC_FIELD)) out.push(QC_FIELD);
  return out;
}
