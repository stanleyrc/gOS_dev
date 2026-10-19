// Text builders for plot hover cards (d3-free, so they can be unit tested).
// Every builder returns an array of plain lines: the first is the title, the
// last may be a "Click to ..." hint. Numbers carry denominators ("12 of 157
// cells (8%)"), percentages use 0 decimals unless below 1%.

/** 1234567 -> "1,234,567"; 3.14159 -> "3.14"; non-finite -> "n/a". */
export function fmtNum(v, digits = 2) {
  const n = Number(v);
  if (v == null || v === "" || !Number.isFinite(n)) return "n/a";
  if (Number.isInteger(n) || Math.abs(n) >= 1000) return Math.round(n).toLocaleString("en-US");
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

/** Fraction -> "8%"; below 1% keeps one decimal ("0.4%"); exact zero is "0%". */
export function fmtPct(frac) {
  const f = Number(frac);
  if (frac == null || !Number.isFinite(f)) return "n/a";
  if (f === 0) return "0%";
  const p = f * 100;
  if (Math.abs(p) < 1) return `${p.toFixed(1)}%`;
  return `${Math.round(p)}%`;
}

/** "12 of 157 cells (8%)". */
export function fmtCount(n, total, noun = "cells") {
  if (!Number.isFinite(Number(n))) return "n/a";
  if (!Number.isFinite(Number(total)) || Number(total) <= 0) return `${fmtNum(n)} ${noun}`;
  return `${fmtNum(n)} of ${fmtNum(total)} ${noun} (${fmtPct(n / total)})`;
}

/** Hover for one point of a box-and-strip plot (one cell, one value). */
export function boxPointLines({ id, group, metric, value, unit = "", flagged = false, median, n, clickHint = "" }) {
  const u = unit ? ` ${unit}` : "";
  const lines = [`${id ?? group}`];
  if (id != null && group) lines.push(`Patient / group: ${group}`);
  lines.push(`${metric || "Value"}: ${fmtNum(value)}${u}`);
  if (Number.isFinite(Number(median))) lines.push(`Group median: ${fmtNum(median)}${u}${Number.isFinite(Number(n)) ? ` (n = ${fmtNum(n)} cells)` : ""}`);
  if (flagged) lines.push("Flagged outlier (more than 3 MADs from the group median)");
  if (clickHint) lines.push(clickHint);
  return lines;
}

/** Hover for a whole box (group summary). */
export function boxSummaryLines({ group, metric, n, total, median, q1, q3, unit = "", noun = "cells" }) {
  const u = unit ? ` ${unit}` : "";
  return [
    `${group}`,
    `${fmtCount(n, total, noun)}${metric ? ` with ${metric}` : ""}`,
    `Median ${fmtNum(median)}${u}; IQR ${fmtNum(q1)} to ${fmtNum(q3)}${u}`,
    "Box = interquartile range, line = median",
  ];
}

/** Hover for one patient on the patient-vs-patient scatter. */
export function patientScatterLines({ patient, xLabel, xValue, yLabel, yValue, nTumorCells, nClones, clickHint = "Click to open the patient" }) {
  const lines = [patient, `${xLabel}: ${fmtNum(xValue)}`, `${yLabel}: ${fmtNum(yValue)}`];
  if (Number.isFinite(Number(nTumorCells))) lines.push(`${fmtNum(nTumorCells)} tumor cells${Number.isFinite(Number(nClones)) ? ` in ${fmtNum(nClones)} clones` : ""}`);
  if (clickHint) lines.push(clickHint);
  return lines;
}

/** Hover for the "fraction of cells carrying this walk" bar. */
export function carrierBarLines({ patient, label, nCarriers, nCells }) {
  return [`${patient}: ${label}`, `Carried by ${fmtCount(nCarriers, nCells, "cells")}`, "Carrier = copies of the walk above zero in the cell"];
}

/** Hover for one dot of the CN-vs-expression Stouffer plot. */
export function stoufferDotLines({ label, group, rho, p, pText, n, score, clipped = false, nPatients }) {
  const dir = !Number.isFinite(score) ? "" : score > 0 ? "expression rises with copy number" : score < 0 ? "expression falls with copy number" : "no association";
  const lines = [`${label}${group ? ` (${group.toLowerCase()})` : ""}`];
  lines.push(`Weighted rho: ${Number.isFinite(rho) ? rho.toFixed(2) : "n/a"}${dir ? ` (${dir})` : ""}`);
  lines.push(`Stouffer p: ${pText ?? (Number.isFinite(p) ? p.toExponential(1) : "n/a")}${Number.isFinite(score) ? `; score ${score.toFixed(1)}${clipped ? " (drawn at the axis limit)" : ""}` : ""}`);
  lines.push(`${fmtNum(n)} tumor cells${Number.isFinite(Number(nPatients)) ? ` from ${fmtNum(nPatients)} patients` : ""}`);
  return lines;
}

/** "BWH69 (115 cells)" style label with a thousands separator. */
export const withCount = (label, n, noun = "cells") => (n != null && Number.isFinite(Number(n)) ? `${label} (${fmtNum(n)} ${noun})` : `${label}`);

// axis-title suffix: unit of each per-cell QC metric (labels that already carry one are left alone)
const QC_UNITS = { ploidy: "copies per genome", snv_count: "n", junction_count: "n", qc_reads: "reads", qc_depth: "x coverage", qc_mad: "of coverage, unitless", qc_gini: "0 = even, 1 = uneven", qc_ado: "fraction of het sites" };
export const qcAxisTitle = (key, label, log) => `${label}${QC_UNITS[key] ? ` (${QC_UNITS[key]})` : ""}${log ? ", log scale" : ""}`;
