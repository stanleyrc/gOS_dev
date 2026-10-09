// Colour and type tokens for the single-cell views, light and dark. One
// source of truth for HTML (exposed as CSS custom properties on <html> by
// applyAppTheme), SVG and canvas drawing (resolved values passed in, so
// exported SVG / PNG files carry real colours, not var() references).
// d3-free so it can be unit tested.

/** Type scale (px). Plot text never goes below `tick`. */
export const TYPE = {
  micro: 10, // only where space is truly fixed (dense matrix column names)
  tick: 11.5, // axis ticks, legend entries, small annotations
  label: 12.5, // axis titles, row / column labels, node labels
  body: 13.5, // card body text, tables, tooltips
  title: 15, // card titles
  stat: 22, // big numbers (antd Statistic)
};

export const FONT_FAMILY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Canvas font string: fontCss(TYPE.tick) -> "400 11.5px ...". */
export const fontCss = (px, weight = 400) => `${weight} ${px}px ${FONT_FAMILY}`;

const LIGHT = {
  mode: "light",
  page: "#f5f6f8",
  panel: "#ffffff", // card / plot background
  panelAlt: "#fafafa", // zebra rows, sticky headers, plot bands
  raised: "#ffffff", // tooltips, popovers
  text: "#1f1f1f", // primary text, data labels
  textSecondary: "#434343", // axis titles, row labels
  muted: "#666666", // ticks, captions (AA on panel)
  faint: "#8c8c8c", // decorative only (never body text)
  axis: "#8c8c8c", // axis lines, tick marks
  grid: "#ebebeb", // gridlines
  border: "#d9d9d9", // card / control borders
  borderSoft: "#f0f0f0", // inner dividers
  empty: "#e8e8e8", // "no data" fill
  band: "rgba(0,0,0,0.045)", // alternating bands
  hover: "#fa541c",
  hoverFill: "rgba(250,84,28,0.08)",
  select: "#1677ff",
  selectFill: "rgba(22,119,255,0.14)",
  accent: "#1677ff",
  accentSoft: "#e6f4ff",
  danger: "#cf1322",
  warn: "#d46b08",
  ok: "#389e0d",
  labelBg: "rgba(255,255,255,0.85)", // halo behind labels drawn over data
  branch: "#595959", // tree branches without a clone colour
  separator: "rgba(0,0,0,0.35)", // chromosome separators drawn over heatmaps
  outline: "rgba(0,0,0,0.85)", // highlighted heatmap rows
  pinned: "#531dab",
};

const DARK = {
  mode: "dark",
  page: "#141414",
  panel: "#1d1d1d",
  panelAlt: "#242424",
  raised: "#2a2a2a",
  text: "#ececec",
  textSecondary: "#cfcfcf",
  muted: "#a8a8a8",
  faint: "#7a7a7a",
  axis: "#8a8a8a",
  grid: "#353535",
  border: "#424242",
  borderSoft: "#303030",
  empty: "#2c2c2c",
  band: "rgba(255,255,255,0.05)",
  hover: "#ff7a45",
  hoverFill: "rgba(255,122,69,0.14)",
  select: "#4096ff",
  selectFill: "rgba(64,150,255,0.22)",
  accent: "#4096ff",
  accentSoft: "#15325b",
  danger: "#ff4d4f",
  warn: "#ffa940",
  ok: "#73d13d",
  labelBg: "rgba(29,29,29,0.85)",
  branch: "#b0b0b0",
  separator: "rgba(255,255,255,0.28)",
  outline: "rgba(255,255,255,0.9)",
  pinned: "#b37feb",
};

/**
 * Alteration class colours (amp / homdel / fusion / truncating / splice /
 * missense) for a theme: the hues are fixed, the near-black truncating and
 * the grey "other" follow the theme's ink so they stay visible on dark.
 */
export function alterationClassColors(theme) {
  return { amp: "#D7191C", homdel: "#2C7BB6", fusion: theme.mode === "dark" ? "#a35fc4" : "#7B3294", trunc: theme.text, splice: "#E6AB02", missense: "#1B9E77", other: theme.faint };
}

/**
 * Light tokens for colours written as SVG attributes (fill={INK.muted}).
 * Every INK value is listed in SVG_REMAP, so under the dark theme the remap
 * stylesheet re-tints it to the matching dark token without a re-render;
 * use usePlotTheme() instead for canvas drawing or data-dependent colours.
 */
export const INK = LIGHT;

/** Resolved colour tokens for "light" / "dark". */
export function plotTheme(mode) {
  return mode === "dark" ? DARK : LIGHT;
}

/** Theme of the page right now (html[data-theme]); light outside a browser. */
export function currentMode() {
  return typeof document !== "undefined" && document.documentElement?.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

export const currentPlotTheme = () => plotTheme(currentMode());

const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** CSS custom properties for a theme: { "--sc-text": "#1f1f1f", ..., "--sc-fs-tick": "11.5px" }. */
export function cssVars(mode) {
  const theme = plotTheme(mode);
  const vars = {};
  Object.keys(theme).forEach((k) => {
    if (k !== "mode") vars[`--sc-${kebab(k)}`] = theme[k];
  });
  Object.keys(TYPE).forEach((k) => {
    vars[`--sc-fs-${k}`] = `${TYPE[k]}px`;
  });
  return vars;
}

/* ---- dark remap of fixed SVG colours ----
   Many SVG plots write light-theme colours as presentation attributes
   (fill="#262626", stroke="#f0f0f0"). CSS beats presentation attributes, so
   one generated stylesheet re-tints every such literal to the dark tokens;
   svgExportButton bakes computed colours, so exports match the screen. */

const SHAPES = ["rect", "path", "circle", "ellipse", "polygon", "polyline", "line"];
// literal light colour -> dark token, per role
export const SVG_REMAP = {
  textFill: {
    text: ["#000", "#000000", "black", "#141414", "#1a1a1a", "#1f1f1f", "#262626", "#333", "#333333", "#222", "#222222"],
    textSecondary: ["#434343", "#555", "#555555", "#595959"],
    muted: ["#666", "#666666", "#8c8c8c", "#888", "#888888", "#999", "#999999", "#aaa", "#aaaaaa", "#bfbfbf", "#bbb"],
  },
  shapeFill: {
    panel: ["#fff", "#ffffff", "white"],
    panelAlt: ["#fafafa", "#fcfcfc", "#fcfcfd", "#f7f7f7", "#f5f5f5", "#f8f8f8"],
    empty: ["#f0f0f0", "#eee", "#eeeeee", "#e8e8e8", "#ebebeb", "#efefef"],
    border: ["#d9d9d9", "#ddd", "#dddddd", "#e0e0e0"],
    labelBg: ["rgba(255,255,255,0.8)", "rgba(255,255,255,0.85)", "rgba(255,255,255,0.9)"],
    // the truncating-alteration class colour (near black) used by the cohort / report panels
    textSecondary: ["#1a1a1a"],
  },
  stroke: {
    panel: ["#fff", "#ffffff", "white"],
    grid: ["#f0f0f0", "#f5f5f5", "#eee", "#eeeeee", "#e8e8e8", "#ebebeb", "#efefef", "#fafafa"],
    border: ["#d9d9d9", "#ddd", "#dddddd", "#e0e0e0", "#ccc", "#cccccc", "#bfbfbf"],
    axis: ["#8c8c8c", "#999", "#999999", "#aaa"],
    textSecondary: ["#000", "#000000", "black", "#262626", "#333", "#434343", "#595959", "#666"],
  },
};

/** The stylesheet text re-tinting SVG_REMAP literals under html[data-theme="dark"]. */
export function svgRemapCss() {
  const dark = plotTheme("dark");
  const root = 'html[data-theme="dark"]';
  const rules = [];
  // svg inside a .sc-light-island (igv.js, which has no dark theme) keeps its light colours
  const svg = "svg:not(.sc-light-island svg)";
  const sel = (els, attr, value) => els.map((el) => `${root} ${svg} ${el}[${attr}="${value}" i]`).join(",\n");
  Object.entries(SVG_REMAP.textFill).forEach(([token, values]) => {
    values.forEach((v) => rules.push(`${sel(["text", "tspan"], "fill", v)} { fill: ${dark[token]}; }`));
  });
  Object.entries(SVG_REMAP.shapeFill).forEach(([token, values]) => {
    values.forEach((v) => rules.push(`${sel(SHAPES, "fill", v)} { fill: ${dark[token]}; }`));
  });
  Object.entries(SVG_REMAP.stroke).forEach(([token, values]) => {
    values.forEach((v) => rules.push(`${sel(SHAPES, "stroke", v)} { stroke: ${dark[token]}; }`));
  });
  // text without any fill inherits black in SVG
  rules.push(`${root} ${svg} text:not([fill]), ${root} ${svg} tspan:not([fill]) { fill: ${dark.text}; }`);
  return rules.join("\n");
}

/* ---- contrast (WCAG 2) — used by the tests to keep the tokens readable ---- */

function channel(v) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** [r, g, b] of #rgb / #rrggbb / rgb(r, g, b) / rgba(...). */
export function parseColor(color) {
  const str = `${color}`.trim();
  const m = str.match(/^rgba?\(([^)]+)\)/i);
  if (m) return m[1].split(/[ ,/]+/).filter(Boolean).slice(0, 3).map(Number);
  let h = str.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Relative luminance of a hex or rgb() colour. */
export function luminance(color) {
  const [r, g, b] = parseColor(color);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Text colour for a label drawn on top of a fill (e.g. a heatmap cell or a
 * coloured chip): whichever of dark / light ink reads better.
 */
export function inkOn(fillHex) {
  try {
    return contrastRatio(fillHex, "#111111") >= contrastRatio(fillHex, "#ffffff") ? "#111111" : "#ffffff";
  } catch (e) {
    return "#111111";
  }
}
