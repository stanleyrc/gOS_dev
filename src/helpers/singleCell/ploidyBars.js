// Per-cell ploidy bars for the Single-Cell heatmap annotation strips (d3-free).
// Bar length = ploidy (relative to the largest ploidy shown); colour = deviation
// from the patient's modal ploidy (diverging: blue below, grey at, red above).
import { PC_FIELDS } from "./precompute";

const finite = (v) => typeof v === "number" && Number.isFinite(v);

/** Most common ploidy after rounding to `step` (ties -> the lower value). null when no cell has one. */
export function modalPloidy(cells = [], step = 0.25) {
  const counts = new Map();
  (cells || []).forEach((c) => {
    if (!c || c.normal || !finite(c.ploidy)) return;
    const k = Math.round(c.ploidy / step) * step;
    counts.set(k, (counts.get(k) || 0) + 1);
  });
  let best = null;
  counts.forEach((n, k) => {
    if (best == null || n > best[1] || (n === best[1] && k < best[0])) best = [k, n];
  });
  return best ? best[0] : null;
}

/** Axis maximum for the bars: the largest ploidy, at least twice the mode, capped at 12. */
export function ploidyAxisMax(cells = [], modal = null) {
  const vals = (cells || []).map((c) => c?.ploidy).filter(finite);
  const max = vals.length ? Math.max(...vals) : 0;
  return Math.min(12, Math.max(max, modal ? modal * 1.5 : 0, 2));
}

/** Bar length as a fraction (0-1) of the column; 0 when the cell has no ploidy. */
export function ploidyBarFraction(ploidy, axisMax) {
  if (!finite(ploidy) || !(axisMax > 0)) return 0;
  return Math.max(0, Math.min(1, ploidy / axisMax));
}

/** Deviation of a ploidy from the mode (null when either is missing). */
export function ploidyDeviation(ploidy, modal) {
  return finite(ploidy) && finite(modal) ? ploidy - modal : null;
}

/** Hex colour for a deviation: grey within 0.25, blue below, red above, saturating at +-1.5. */
export function ploidyDeviationColor(dev) {
  if (!finite(dev)) return "#bfbfbf";
  const a = Math.abs(dev);
  if (a < 0.25) return "#8c8c8c";
  const s = Math.min(1, (a - 0.25) / 1.25);
  const mix = (from, to) => Math.round(from + (to - from) * s);
  return dev > 0
    ? `#${[mix(222, 200), mix(150, 30), mix(130, 20)].map((x) => x.toString(16).padStart(2, "0")).join("")}`
    : `#${[mix(150, 25), mix(190, 90), mix(235, 200)].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

/** Pixel columns lit for a bar of `fraction` over `barPx` device pixels (at least 1 when fraction > 0). */
export function barPixels(fraction, barPx) {
  if (!(fraction > 0) || barPx <= 0) return 0;
  return Math.max(1, Math.min(barPx, Math.round(fraction * barPx)));
}

/** Tooltip lines [label, value] for a cell's ploidy fit: ploidy, purity, deviation and fit QC. */
export function ploidyTooltipLines(cell, modal) {
  if (!cell || !finite(cell.ploidy)) return [["Ploidy", "not fitted"]];
  const lines = [["Ploidy", cell.ploidy.toFixed(2)]];
  if (finite(cell.purity)) lines.push(["Purity", cell.purity.toFixed(2)]);
  const dev = ploidyDeviation(cell.ploidy, modal);
  if (dev != null) lines.push(["vs patient mode", `${dev >= 0 ? "+" : ""}${dev.toFixed(2)} (mode ${modal.toFixed(2)})`]);
  const flags = `${cell[PC_FIELDS.qcFlags] || ""}`.split(",").filter(Boolean);
  const resid = cell[PC_FIELDS.cnResid];
  if (finite(resid)) lines.push(["Fit residual (coverage vs CN)", resid.toFixed(3)]);
  const qc = cell[PC_FIELDS.qcFlag];
  if (qc != null || flags.length) lines.push(["Fit QC", flags.includes("cn_inconsistent") ? "coverage not fitting integer CN" : qc ?? flags.join(", ")]);
  return lines;
}
