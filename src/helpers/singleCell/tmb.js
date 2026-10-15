// Tumour mutational burden (TMB, mutations per callable Mb) helpers for the Single-Cell views (d3-free).
// Data: <patient>/tmb.json and _cohort/tmb.json written by srctools gos_sc_tmb.R.

const finite = (v) => typeof v === "number" && Number.isFinite(v);

/** "12.3", "0.42" or "n/a": mutations per Mb with sensible precision. */
export function fmtTmb(v) {
  if (!finite(v)) return "n/a";
  if (v >= 100) return v.toFixed(0);
  if (v >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

/** Map cell_id -> per-cell TMB record from a patient tmb.json (empty when missing). */
export function cellTmbMap(tmb) {
  const map = new Map();
  ((tmb && tmb.cells) || []).forEach((c) => c && c.cell_id != null && map.set(`${c.cell_id}`, c));
  return map;
}

/** Quantile (linear interpolation) of finite values; null when none. */
export function quantile(values, q) {
  const v = (values || []).filter(finite).sort((a, b) => a - b);
  if (!v.length) return null;
  const pos = (v.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}

/** Box statistics (Tukey whiskers at 1.5 IQR) of finite values; null when none. */
export function boxStats(values) {
  const v = (values || []).filter(finite).sort((a, b) => a - b);
  if (!v.length) return null;
  const q1 = quantile(v, 0.25);
  const med = quantile(v, 0.5);
  const q3 = quantile(v, 0.75);
  const lo = q1 - 1.5 * (q3 - q1);
  const hi = q3 + 1.5 * (q3 - q1);
  return {
    n: v.length,
    q1,
    median: med,
    q3,
    min: v[0],
    max: v[v.length - 1],
    whiskerLow: v.find((x) => x >= lo),
    whiskerHigh: [...v].reverse().find((x) => x <= hi),
  };
}

/** Bar axis maximum: the 95th percentile of the corrected (else raw) TMB, padded 10%; null when no values. */
export function tmbAxisMax(records, key = "tmb_corrected") {
  const q = quantile((records || []).map((r) => r && r[key]), 0.95);
  return q > 0 ? q * 1.1 : null;
}

/** Bar length as a fraction (0-1) of the column; 0 when the value is missing. */
export function tmbBarFraction(value, axisMax) {
  if (!finite(value) || !(axisMax > 0)) return 0;
  return Math.max(0, Math.min(1, value / axisMax));
}

/** Tooltip lines [label, value] for one cell's TMB record. */
export function tmbTooltipLines(rec) {
  if (!rec) return [["TMB", "not available (no tmb.json entry for this cell)"]];
  const lines = [["TMB (dropout-corrected)", `${fmtTmb(rec.tmb_corrected)} mut/Mb`], ["TMB (raw)", `${fmtTmb(rec.tmb_raw)} mut/Mb`]];
  lines.push(["Alt calls (truncal / subclonal / private)", `${rec.n_alt ?? "n/a"} (${rec.n_truncal_alt ?? "?"} / ${rec.n_subclonal_alt ?? "?"} / ${rec.n_private_alt ?? "?"})`]);
  lines.push(["Callable", finite(rec.callable_mb) ? `${rec.callable_mb.toFixed(0)} Mb${finite(rec.callable_frac) ? ` (${(rec.callable_frac * 100).toFixed(0)}% of territory)` : ""}` : "n/a"]);
  lines.push(["Sensitivity (truncal sites)", finite(rec.sensitivity) ? `${(rec.sensitivity * 100).toFixed(0)}%${rec.n_truncal_covered != null ? ` of ${rec.n_truncal_covered} covered` : ""}` : "n/a (too few covered truncal sites)"]);
  return lines;
}

/** Rows of a patient's TMB summary card: truncal, subclonal, private. */
export function patientTmbRows(tmb) {
  const s = tmb && tmb.patient_summary;
  if (!s) return [];
  return ["truncal", "subclonal", "private"]
    .filter((k) => s[k])
    .map((k) => ({
      key: k,
      nSites: s[k].n_sites ?? null,
      callableMb: s[k].callable_mb ?? null,
      raw: s[k].tmb_raw ?? null,
      corrected: s[k].tmb_corrected ?? null,
      lowerBound: k === "private",
    }));
}

/** Per-patient rows for the cohort box/strip: per-cell corrected TMB values plus the summary. */
export function cohortTmbRows(cohort, key = "tmb_corrected") {
  return ((cohort && cohort.patients) || [])
    .map((p) => {
      const values = (p.cells || []).map((c) => c[key]).filter(finite);
      return { patient: p.patient, noisy: Boolean(p.noisy), caveats: p.caveats || [], summary: p.patient_summary || null, cells: p.cells || [], values, box: boxStats(values) };
    })
    .filter((r) => r.values.length)
    .sort((a, b) => (a.box.median || 0) - (b.box.median || 0));
}

/** Clade TMB rows from a cohort tmb.json, keyed by clade id (join with _cohort/clades.json rows on `clade`). */
export function cladeTmbIndex(cohort) {
  const idx = new Map();
  ((cohort && cohort.patients) || []).forEach((p) => (p.clades || []).forEach((c) => idx.set(c.id, { ...c, patient: p.patient })));
  return idx;
}

/** Faint track behind each TMB bar. */
export const TMB_TRACK = "#eef1f4";

/** Bar colour: teal when the cell has a sensitivity estimate (so the correction is supported), grey when it does not. */
export function tmbBarColor(rec) {
  return rec && finite(rec.sensitivity) ? "#1f9e89" : "#9aa5b1";
}
