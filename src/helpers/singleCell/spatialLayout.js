// Layout of the slide-tag tissue map next to the phylogeny + CN heatmap, d3-free.
//   ?spmap=beside|below   where the tissue map sits
//   ?spw=<px>             width of the map column when beside
//   ?sphide=all|a,b,c     collapsed cards / sections ("all" = compact spatial view)

export const MAP_MIN = 300;
export const MAP_MAX = 900;
export const MAP_DEFAULT = 480;
export const HEATMAP_MIN = 520; // px the heatmap card keeps when the map is beside
export const BESIDE_MIN_VIEWPORT = 1200; // narrower screens fall back to "below"
export const SPLITTER_WIDTH = 10;
export const SIZE_PRESETS = { S: 360, M: 480, L: 640 };

// Cards and sections that can be collapsed; compact view hides all of them.
export const SPATIAL_SECTIONS = [
  "nav", // gene + cytoband navigation above the heatmap
  "igv",
  "umap",
  "treebars",
  "tracks", // per-cell tracks
  "headline", // plain-language spatial summary
  "legend", // colour legend, notes on the plot
  "clustering",
  "enrichment",
  "niche",
  "mantel",
  "notes",
];

/**
 * Beside the heatmap the page opens like the gbm-sc Single-Cell page: the sections that page has (gene navigation, IGV,
 * UMAP, tree bars, cell tracks, legend) stay visible; only the slide-tag analysis cards are collapsed.
 */
export const DEFAULT_HIDDEN_BESIDE = ["headline", "clustering", "enrichment", "niche", "mantel", "notes"];

/** Map column width allowed by the available row width: the heatmap keeps HEATMAP_MIN. */
export function clampMapWidth(width, rowWidth = Infinity) {
  const w = Number.isFinite(+width) ? +width : MAP_DEFAULT;
  const max = Math.max(MAP_MIN, Math.min(MAP_MAX, rowWidth - HEATMAP_MIN - SPLITTER_WIDTH));
  return Math.round(Math.max(MAP_MIN, Math.min(max, w)));
}

/** "beside" only when asked for and the viewport is wide enough. */
export function effectiveMode(mode, viewportWidth) {
  return mode !== "below" && viewportWidth >= BESIDE_MIN_VIEWPORT ? "beside" : "below";
}

/** Preset letter matching a width (null when custom). */
export function presetOf(width) {
  const hit = Object.entries(SIZE_PRESETS).find(([, w]) => w === width);
  return hit ? hit[0] : null;
}

/** Hidden sections: explicit list, or the default (slide-tag analysis cards collapsed when beside, nothing when below). */
export function hiddenSections(stored, mode) {
  if (Array.isArray(stored)) return stored.filter((k) => SPATIAL_SECTIONS.includes(k));
  return mode === "beside" ? [...DEFAULT_HIDDEN_BESIDE] : [];
}
export const isCompact = (hidden) => SPATIAL_SECTIONS.every((k) => hidden.includes(k));
export function toggleSection(hidden, key) {
  return hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key];
}

/** Layout patch from a link; only fields present in the URL. */
export function readSpatialLink(search = "") {
  const params = new URLSearchParams(search);
  const patch = {};
  const mode = params.get("spmap");
  if (mode === "beside" || mode === "below") patch.spMap = mode;
  if (params.has("spw") && Number.isFinite(+params.get("spw"))) patch.spWidth = clampMapWidth(+params.get("spw"));
  const hide = params.get("sphide");
  if (hide != null) {
    patch.spHidden =
      hide === "all" ? [...SPATIAL_SECTIONS] : hide === "none" || hide === "" ? [] : hide.split(",").filter((k) => SPATIAL_SECTIONS.includes(k));
  }
  return patch;
}

/** Query string with the spatial layout written in (defaults removed). */
export function withSpatialLink(search = "", { spMap, spWidth, spHidden } = {}) {
  const params = new URLSearchParams(search);
  ["spmap", "spw", "sphide"].forEach((k) => params.delete(k));
  if (spMap === "below" || spMap === "beside") params.set("spmap", spMap);
  if (spMap !== "below" && Number.isFinite(+spWidth) && +spWidth !== MAP_DEFAULT) params.set("spw", `${Math.round(spWidth)}`);
  if (Array.isArray(spHidden)) params.set("sphide", isCompact(spHidden) ? "all" : spHidden.length ? spHidden.join(",") : "none");
  const out = params.toString();
  return out ? `?${out}` : "";
}
