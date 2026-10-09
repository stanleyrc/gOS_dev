// Figure styles: how a plot is drawn (axis lines, ticks, grid, row bands,
// type weights, marker size, spacing), separate from its colours, which come
// from plotTheme (light / dark tokens). A style is a plain object so canvas
// and SVG drawing read the same values; d3-free so it can be unit tested.

import { TYPE } from "./plotTheme";

const BASE = {
  fontScale: 1,
  rowScale: 1,
  // axes
  axisLine: true, // baseline along the value axis
  axisWidth: 1,
  axisInk: "axis", // plotTheme token for axis lines and ticks
  tickLen: 3,
  tickInk: "muted",
  grid: "major", // "none" | "major"
  gridDash: null,
  // rows / groups
  bands: false, // alternating group backgrounds
  groupRule: true, // hairline between groups (patients)
  rowRule: false, // hairline between rows inside a group
  // type
  tickWeight: 400,
  labelWeight: 400, // row labels, legend
  groupWeight: 600, // group (patient) names
  headWeight: 500, // column / axis titles
  captionItalic: false,
  // marks
  markerR: 4,
  markerHalo: 1, // px of panel colour around markers
  areaAlpha: 0.55, // violins, densities
  barRadius: 1.5,
  barThin: 0.55, // bar thickness as a fraction of the row
  refDash: [3, 3],
  refInk: "muted", // reference lines (z = 1.96, 50 % ...)
};

/** Named presets; `legacy` reproduces the original look for comparison. */
export const FIGURE_STYLES = {
  clean: { ...BASE, label: "Clean" },
  classic: {
    ...BASE,
    label: "Classic",
    axisInk: "text",
    tickInk: "textSecondary",
    tickLen: 4,
    grid: "none",
    groupRule: false,
    labelWeight: 400,
    groupWeight: 700,
    headWeight: 600,
    markerHalo: 0,
    areaAlpha: 0.7,
    barRadius: 0,
  },
  minimal: {
    ...BASE,
    label: "Minimal grid",
    axisLine: false,
    tickLen: 0,
    grid: "major",
    gridDash: [2, 3],
    groupRule: false,
    bands: true,
    headWeight: 400,
    groupWeight: 500,
    areaAlpha: 0.45,
    markerR: 3.5,
  },
  compact: { ...BASE, label: "Compact", fontScale: 0.9, rowScale: 0.8, markerR: 3.2, tickLen: 2, barThin: 0.6 },
  legacy: {
    ...BASE,
    label: "Legacy",
    axisLine: false,
    tickLen: 0,
    bands: true,
    groupRule: false,
    labelWeight: 600,
    groupWeight: 600,
    headWeight: 600,
    markerHalo: 1,
    areaAlpha: 0.75,
    barRadius: 0,
    refDash: [4, 3],
    refInk: "danger",
  },
};

export const DEFAULT_FIGURE_STYLE = "clean";

export const figureStyle = (name) => FIGURE_STYLES[name] || FIGURE_STYLES[DEFAULT_FIGURE_STYLE];

/** Font size (px) of a text role in a style: tick / label / group / head / caption / title. */
export function styleFontSize(style, role) {
  const s = style.fontScale || 1;
  const px = { tick: TYPE.tick - 0.5, label: TYPE.label - 0.5, group: TYPE.label, head: TYPE.label - 0.5, caption: TYPE.tick, title: TYPE.title - 1 }[role] ?? TYPE.label;
  return Math.round(px * s * 2) / 2;
}

/** Font weight of a text role in a style. */
export function styleFontWeight(style, role) {
  return { tick: style.tickWeight, label: style.labelWeight, group: style.groupWeight, head: style.headWeight, caption: 400, title: 600 }[role] ?? 400;
}

/**
 * Tick label text: no trailing zeros, thin-space thousands, k / M above
 * 10 000, a percent sign when `percent` (values given as fractions or as
 * 0-100 with percent: "points").
 */
export function formatTick(v, { percent = false } = {}) {
  if (!Number.isFinite(v)) return "";
  if (percent === true) return `${Math.round(v * 100)}%`;
  if (percent === "points") return `${Math.round(v)}%`;
  const a = Math.abs(v);
  if (a >= 1e6) return `${trim(v / 1e6)}M`;
  if (a >= 1e4) return `${trim(v / 1e3)}k`;
  // whole thousands as k, so a log axis reads 100 · 1k · 10k, not 100 · 1 000 · 10k
  if (a >= 1000 && v % 1000 === 0) return `${v / 1000}k`;
  if (a >= 1000) return `${Math.round(v)}`.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return trim(v);
}

/**
 * A summary value for display (medians, means in tables and card headers):
 * k / M / G with three significant digits from 10 000 up (90 499 908 ->
 * "90.5M"), otherwise at most `digits` decimals without trailing zeros.
 */
export function formatValue(v, digits = 2) {
  const x = Number(v);
  if (v === null || v === undefined || v === "" || !Number.isFinite(x)) return "–";
  const a = Math.abs(x);
  const sig = (n) => `${Number(n.toPrecision(3))}`;
  if (a >= 1e9) return `${sig(x / 1e9)}G`;
  if (a >= 1e6) return `${sig(x / 1e6)}M`;
  if (a >= 1e4) return `${sig(x / 1e3)}k`;
  return `${Number(x.toFixed(a >= 100 ? Math.min(digits, 1) : digits))}`;
}

function trim(v) {
  const a = Math.abs(v);
  const digits = a >= 100 || Number.isInteger(v) ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3;
  return `${Number(v.toFixed(digits))}`;
}

/** "Nice" ticks for a linear range: ~n values on 1 / 2 / 5 x 10^k steps, inside [lo, hi]. */
export function linearTicks(lo, hi, n = 5) {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / Math.max(1, n);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw * 0.999) || 10 * mag;
  const out = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}
