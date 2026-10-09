// Single-cell matrix helpers: payload normalization, colour scales, per-cell
// track derivation and pixel lookups for canvas heatmaps.
// Dependency-free (no d3) so the logic is unit-testable in isolation.

/* ----------------------------------------------------------------------- */
/* Colours                                                                  */
/* ----------------------------------------------------------------------- */

// Integer copy-number palette used across scWGS tools (HMMcopy / signals /
// schnapps convention): blue for losses, grey for diploid, warm for gains.
export const CN_STATE_COLORS = [
  "#3182BD", // 0
  "#9ECAE1", // 1
  "#CCCCCC", // 2
  "#FDCC8A", // 3
  "#FC8D59", // 4
  "#E34A33", // 5
  "#B30000", // 6
  "#980043", // 7
  "#DD1C77", // 8
  "#DF65B0", // 9
  "#C994C7", // 10
  "#D4B9DA", // 11+
];
export const MISSING_COLOR = "#FFFFFF";

export const SNV_STATUS_COLORS = {
  present: "#B2182B",
  absent: "#C6DBEF",
  missing: "#F5F5F5",
};

export const CLONE_PALETTE = [
  "#4E79A7",
  "#F28E2B",
  "#59A14F",
  "#E15759",
  "#B07AA1",
  "#76B7B2",
  "#EDC948",
  "#FF9DA7",
  "#9C755F",
  "#BAB0AC",
  "#1B9E77",
  "#D95F02",
  "#7570B3",
  "#E7298A",
  "#66A61E",
  "#E6AB02",
];

// Sequential ramp for junction copy number (1 .. max).
const JUNCTION_RAMP = ["#FDD49E", "#FDBB84", "#FC8D59", "#E34A33", "#B30000", "#7F0000"];
export const JUNCTION_ZERO_COLOR = "#EEEEEE";

export function hexToRgb(hex) {
  const h = `${hex || ""}`.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n) || full.length !== 6) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Pack RGB into the ABGR uint32 layout expected by ImageData on little-endian hosts. */
export function packRGBA(rgb, alpha = 255) {
  return ((alpha << 24) | (rgb[2] << 16) | (rgb[1] << 8) | rgb[0]) >>> 0;
}

/** Pack RGB into r*65536+g*256+b, the format gOS' WebGL scatter shader decodes. */
export function packRGBInt(rgb) {
  return rgb[0] * 65536 + rgb[1] * 256 + rgb[2];
}

export function cnStateColor(state) {
  if (state == null || !Number.isFinite(state)) return MISSING_COLOR;
  const idx = Math.max(0, Math.min(CN_STATE_COLORS.length - 1, Math.round(state)));
  return CN_STATE_COLORS[idx];
}

const CN_RGBA = CN_STATE_COLORS.map((c) => packRGBA(hexToRgb(c)));
const CN_INT = CN_STATE_COLORS.map((c) => packRGBInt(hexToRgb(c)));
export const MISSING_RGBA = packRGBA(hexToRgb(MISSING_COLOR));
const MISSING_RGBA_DARK = packRGBA(hexToRgb("#1a1a1a"));
/** Dark app theme (html[data-theme="dark"]): plots use dark neutrals. */
export const isDarkPlots = () => typeof document !== "undefined" && document.documentElement?.getAttribute("data-theme") === "dark";
export const missingRGBA = () => (isDarkPlots() ? MISSING_RGBA_DARK : MISSING_RGBA);

export function cnStateRGBA(state) {
  if (!Number.isFinite(state)) return missingRGBA();
  return CN_RGBA[Math.max(0, Math.min(CN_RGBA.length - 1, Math.round(state)))];
}

export function cnStateInt(state) {
  if (!Number.isFinite(state)) return packRGBInt(hexToRgb("#999999"));
  return CN_INT[Math.max(0, Math.min(CN_INT.length - 1, Math.round(state)))];
}

const SNV_RGBA = {
  1: packRGBA(hexToRgb(SNV_STATUS_COLORS.present)),
  0: packRGBA(hexToRgb(SNV_STATUS_COLORS.absent)),
  [-1]: packRGBA(hexToRgb(SNV_STATUS_COLORS.missing)),
};
export function snvStatusRGBA(status) {
  return SNV_RGBA[status] ?? SNV_RGBA[-1];
}

export function junctionColor(value, max) {
  if (value == null || !Number.isFinite(value)) return MISSING_COLOR;
  if (value <= 0) return JUNCTION_ZERO_COLOR;
  const top = Math.max(1, max || 1);
  const t = top <= 1 ? 1 : Math.min(1, (value - 1) / (top - 1));
  return JUNCTION_RAMP[Math.round(t * (JUNCTION_RAMP.length - 1))];
}
const JUNCTION_RGBA_CACHE = new Map();
export function junctionRGBA(value, max) {
  const hex = junctionColor(value, max);
  if (!JUNCTION_RGBA_CACHE.has(hex)) {
    JUNCTION_RGBA_CACHE.set(hex, packRGBA(hexToRgb(hex)));
  }
  return JUNCTION_RGBA_CACHE.get(hex);
}

/** Map clone IDs to colours, honouring colours supplied in the data. */
export function cloneColorMap(cells = [], clones = []) {
  const map = {};
  (clones || []).forEach((c) => {
    if (c && c.clone_id != null && c.color) map[`${c.clone_id}`] = c.color;
  });
  const ids = [];
  const seen = new Set();
  (clones || []).forEach((c) => {
    if (c && c.clone_id != null && !seen.has(`${c.clone_id}`)) {
      seen.add(`${c.clone_id}`);
      ids.push(`${c.clone_id}`);
    }
  });
  (cells || []).forEach((c) => {
    const id = c?.clone_id;
    if (id != null && !seen.has(`${id}`)) {
      seen.add(`${id}`);
      ids.push(`${id}`);
    }
  });
  ids.sort(naturalCompare);
  let k = 0;
  ids.forEach((id) => {
    if (!map[id]) {
      map[id] = CLONE_PALETTE[k % CLONE_PALETTE.length];
      k += 1;
    }
  });
  return map;
}

export function naturalCompare(a, b) {
  return `${a}`.localeCompare(`${b}`, undefined, { numeric: true, sensitivity: "base" });
}

/* ----------------------------------------------------------------------- */
/* Genome coordinates                                                       */
/* ----------------------------------------------------------------------- */

/** Resolve a chromosome name to a chromoBins key, tolerating a "chr" prefix mismatch. */
export function resolveChromosome(chromosome, chromoBins = {}) {
  const c = `${chromosome ?? ""}`.trim();
  if (chromoBins[c]) return c;
  const stripped = c.replace(/^chr/i, "");
  if (chromoBins[stripped]) return stripped;
  if (chromoBins[`chr${stripped}`]) return `chr${stripped}`;
  return null;
}

/** Same convention as dataToGenome: global = chromoBins[chr].startPlace + position. */
export function toGlobal(chromoBins, chromosome, position) {
  const key = resolveChromosome(chromosome, chromoBins);
  if (!key) return NaN;
  return chromoBins[key].startPlace + Number(position);
}

const columnsFromBins = (bins) => {
  if (Array.isArray(bins)) {
    return {
      chromosome: bins.map((b) => b.chromosome ?? b.chr),
      start: bins.map((b) => Number(b.start)),
      end: bins.map((b) => Number(b.end)),
    };
  }
  if (bins && Array.isArray(bins.chromosome)) {
    return {
      chromosome: bins.chromosome,
      start: bins.start.map(Number),
      end: bins.end.map(Number),
    };
  }
  throw new Error("Bins must be an array of {chromosome,start,end} or an object of arrays");
};

/**
 * Build a bin index with global coordinates. Bins on chromosomes unknown to
 * the reference get gStart = NaN and are never drawn.
 * `sorted` lists bin indices ordered by gStart (valid bins only).
 */
export function buildBinIndex(bins, chromoBins) {
  const { chromosome, start, end } = columnsFromBins(bins);
  const n = chromosome.length;
  if (start.length !== n || end.length !== n) {
    throw new Error("Bin chromosome/start/end arrays differ in length");
  }
  const gStart = new Float64Array(n);
  const gEnd = new Float64Array(n);
  const chrom = new Array(n);
  for (let k = 0; k < n; k += 1) {
    const key = resolveChromosome(chromosome[k], chromoBins);
    chrom[k] = key ?? `${chromosome[k]}`;
    if (key) {
      gStart[k] = chromoBins[key].startPlace + start[k];
      gEnd[k] = chromoBins[key].startPlace + end[k];
    } else {
      gStart[k] = NaN;
      gEnd[k] = NaN;
    }
  }
  const sorted = [];
  for (let k = 0; k < n; k += 1) if (Number.isFinite(gStart[k])) sorted.push(k);
  sorted.sort((a, b) => gStart[a] - gStart[b]);
  const sortedStarts = new Float64Array(sorted.length);
  sorted.forEach((b, k) => (sortedStarts[k] = gStart[b]));
  return {
    n,
    chromosome: chrom,
    start: Int32Array.from(start),
    end: Int32Array.from(end),
    gStart,
    gEnd,
    sorted: Int32Array.from(sorted),
    sortedStarts,
  };
}

/** Bin index covering global position g, or -1. */
export function binAt(binIndex, g) {
  const { sorted, sortedStarts, gEnd } = binIndex;
  let lo = 0;
  let hi = sortedStarts.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sortedStarts[mid] <= g) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (found < 0) return -1;
  const b = sorted[found];
  return g <= gEnd[b] ? b : -1;
}

export function binLabel(binIndex, b) {
  if (b < 0 || b >= binIndex.n) return "";
  const fmt = (v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${binIndex.chromosome[b]}:${fmt(binIndex.start[b])}-${fmt(binIndex.end[b])}`;
}

/* ----------------------------------------------------------------------- */
/* Pixel lookups for canvas heatmaps                                        */
/* ----------------------------------------------------------------------- */

/**
 * Split `width` pixels across domains (equal shares, `gap` px between) and
 * return, for each pixel column, the bin it shows (-1 for gaps / no bin).
 * Also returns the pixel extent of each domain for drawing separators.
 */
export function domainExtents(domains, width, gap = 0) {
  const w = Math.max(0, Math.floor(width));
  const ds = (domains || []).filter((d) => Array.isArray(d) && d[1] > d[0]);
  if (!ds.length || !w) return [];
  const share = (w - gap * (ds.length - 1)) / ds.length;
  return ds.map((d, k) => [
    Math.round(k * (share + gap)),
    Math.round(k * (share + gap) + share),
    d,
  ]);
}

export function genomicColumnLookup(binIndex, domains, width, gap = 0) {
  const w = Math.max(0, Math.floor(width));
  const cols = new Int32Array(w).fill(-1);
  const extents = domainExtents(domains, width, gap);
  extents.forEach(([px0, px1, d]) => {
    const span = px1 - px0;
    for (let x = px0; x < px1 && x < w; x += 1) {
      const g = d[0] + ((x + 0.5 - px0) / span) * (d[1] - d[0]);
      cols[x] = binAt(binIndex, g);
    }
  });
  return { cols, extents };
}

/** Pixel column -> discrete column index for n equally wide columns. */
export function discreteColumnLookup(n, width) {
  const w = Math.max(0, Math.floor(width));
  const cols = new Int32Array(w).fill(-1);
  if (!n) return cols;
  for (let x = 0; x < w; x += 1) cols[x] = Math.min(n - 1, Math.floor(((x + 0.5) * n) / w));
  return cols;
}

/** Pixel row -> row index for n rows over `height` pixels. */
export function rowLookup(n, height) {
  const h = Math.max(0, Math.floor(height));
  const rows = new Int32Array(h).fill(-1);
  if (!n) return rows;
  for (let y = 0; y < h; y += 1) rows[y] = Math.min(n - 1, Math.floor(((y + 0.5) * n) / h));
  return rows;
}

/* ----------------------------------------------------------------------- */
/* Ordering, selection, mapping                                             */
/* ----------------------------------------------------------------------- */

/** Default row order without a tree: by clone (natural), then cell id. */
export function defaultCellOrder(cells) {
  const cloneCompare = (a, b) => {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    return naturalCompare(a, b);
  };
  return [...cells]
    .sort(
      (a, b) =>
        cloneCompare(a.clone_id, b.clone_id) ||
        naturalCompare(a.cell_id, b.cell_id)
    )
    .map((c) => c.cell_id);
}

/** For each displayed cell id, the row index in a payload's `cells` array (or -1). */
export function rowMap(displayCellIds, payloadCells) {
  const pos = new Map();
  (payloadCells || []).forEach((c, k) => pos.set(`${c}`, k));
  return Int32Array.from(displayCellIds, (id) => (pos.has(id) ? pos.get(id) : -1));
}

/** One cell per clone (first in display order), up to `limit`. */
export function representativeCells(cells, order, limit = 3) {
  const byId = new Map(cells.map((c) => [c.cell_id, c]));
  const picked = [];
  const clones = new Set();
  for (const id of order) {
    const clone = byId.get(id)?.clone_id ?? null;
    if (!clones.has(clone)) {
      clones.add(clone);
      picked.push(id);
      if (picked.length >= limit) break;
    }
  }
  return picked;
}

/** Column order for SNV heatmap: genomic, or by prevalence (fraction present among covered). */
export function snvColumnOrder(snv, mode = "genomic") {
  const idx = snv.variants.map((v) => v.index);
  if (mode === "catalog") return idx;
  if (mode === "prevalence") {
    const prevalence = snv.variants.map((v) => {
      let present = 0;
      let covered = 0;
      snv.status.forEach((row) => {
        if (row[v.index] >= 0) covered += 1;
        if (row[v.index] === 1) present += 1;
      });
      return covered ? present / covered : 0;
    });
    return idx.sort((a, b) => prevalence[b] - prevalence[a] || a - b);
  }
  return idx.sort((a, b) => {
    const ga = snv.variants[a].global;
    const gb = snv.variants[b].global;
    if (Number.isFinite(ga) && Number.isFinite(gb)) return ga - gb;
    return Number.isFinite(ga) ? -1 : Number.isFinite(gb) ? 1 : a - b;
  });
}

export function junctionColumnOrder(junctions) {
  return junctions
    .map((j) => j.index)
    .sort((a, b) => {
      const ga = junctions[a].global1;
      const gb = junctions[b].global1;
      if (Number.isFinite(ga) && Number.isFinite(gb)) return ga - gb || a - b;
      return Number.isFinite(ga) ? -1 : Number.isFinite(gb) ? 1 : a - b;
    });
}

/* ----------------------------------------------------------------------- */
/* Axes                                                                     */
/* ----------------------------------------------------------------------- */

/**
 * Chromosome spans (in pixels) visible within genomic column extents, as
 * returned by genomicColumnLookup. Returns { spans: [{chromosome, x0, x1}],
 * separators: [x] } — separators mark chromosome and domain boundaries.
 */
export function chromosomeSpans(chromoBins, extents) {
  const spans = [];
  const separators = [];
  extents.forEach(([px0, px1, d], k) => {
    if (k > 0) separators.push(px0 - 1);
    const scale = (g) => px0 + ((g - d[0]) / (d[1] - d[0])) * (px1 - px0);
    Object.keys(chromoBins).forEach((chromosome) => {
      const c = chromoBins[chromosome];
      const a = Math.max(c.startPlace, d[0]);
      const b = Math.min(c.endPlace, d[1]);
      if (b <= a) return;
      const x0 = scale(a);
      const x1 = scale(b);
      spans.push({ chromosome, x0, x1 });
      if (c.startPlace > d[0] && c.startPlace < d[1]) separators.push(x0);
    });
  });
  return { spans, separators };
}

/** 1, 2 or 5 × 10^k, the smallest at least `raw`. */
export function niceStep(raw) {
  if (!(raw > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

/** Position label in Mb / kb / bp depending on the tick step. */
export function formatPosition(bp, step) {
  if (step >= 1e6) return `${+(bp / 1e6).toFixed(step >= 1e7 ? 0 : 1)} Mb`;
  if (step >= 1e3) return `${+(bp / 1e3).toFixed(step >= 1e4 ? 0 : 1)} kb`;
  return `${Math.round(bp).toLocaleString()} bp`;
}

/**
 * Within-chromosome coordinate ticks for genomic heatmap columns. Only
 * chromosomes that are wide enough on screen (zoomed in, or a domain showing
 * just a few chromosomes) get ticks, so the whole-genome view keeps only the
 * chromosome names. Each domain/region gets its own axis.
 */
export function genomicTicks(chromoBins, extents, { minSpan = 60, maxChromosomes = 4, spacing = 90 } = {}) {
  const ticks = [];
  extents.forEach(([px0, px1, d]) => {
    const scale = (g) => px0 + ((g - d[0]) / (d[1] - d[0])) * (px1 - px0);
    const visible = Object.keys(chromoBins).filter((k) => chromoBins[k].endPlace > d[0] && chromoBins[k].startPlace < d[1]);
    if (!visible.length || visible.length > maxChromosomes) return;
    visible.forEach((chromosome) => {
      const c = chromoBins[chromosome];
      const a = Math.max(c.startPlace, d[0]);
      const b = Math.min(c.endPlace, d[1]);
      const px = scale(b) - scale(a);
      if (px < minSpan) return;
      const offset = (c.startPoint ?? 1) - c.startPlace;
      const la = a + offset;
      const lb = b + offset;
      const step = niceStep((lb - la) / Math.max(1, Math.floor(px / spacing)));
      for (let v = Math.ceil(la / step) * step; v <= lb; v += step) {
        ticks.push({ x: scale(v - offset), label: formatPosition(v, step), chromosome });
      }
    });
  });
  return ticks;
}

/**
 * For discrete columns laid out in `order`, group consecutive columns that
 * share a key (e.g. chromosome) and return pixel spans and separators.
 */
export function discreteGroups(order, keyOf, width) {
  const n = order.length;
  const spans = [];
  const separators = [];
  if (!n) return { spans, separators };
  let start = 0;
  for (let k = 1; k <= n; k += 1) {
    if (k === n || keyOf(order[k]) !== keyOf(order[start])) {
      const x0 = (start * width) / n;
      const x1 = (k * width) / n;
      spans.push({ chromosome: `${keyOf(order[start]) ?? ""}`, x0, x1 });
      if (k < n) separators.push(x1);
      start = k;
    }
  }
  return { spans, separators };
}

/* ----------------------------------------------------------------------- */
/* Interactive zoom / pan of genome domains                                 */
/* ----------------------------------------------------------------------- */

const clampDomain = (start, width, bounds) => {
  const [lo, hi] = bounds;
  const w = Math.min(width, hi - lo);
  const s = Math.min(Math.max(start, lo), hi - w);
  return [Math.round(s), Math.round(s + w)];
};

/** Zoom a domain by `factor` (<1 zooms in) keeping genome position `anchor` fixed. */
export function zoomDomain(domain, anchor, factor, bounds, minWidth = 100) {
  const width = domain[1] - domain[0];
  const next = Math.max(minWidth, width * factor);
  const frac = width > 0 ? (anchor - domain[0]) / width : 0.5;
  return clampDomain(anchor - frac * next, next, bounds);
}

/** Shift a domain by `delta` genome bases, kept inside bounds. */
export function panDomain(domain, delta, bounds) {
  return clampDomain(domain[0] + delta, domain[1] - domain[0], bounds);
}

/* ----------------------------------------------------------------------- */
/* Expression colour                                                        */
/* ----------------------------------------------------------------------- */

export const EXPRESSION_ZERO_COLOR = "#EAEAEA";
// YlGnBu: pale yellow (low) through green to dark blue (high); distinct from
// the copy-number blues/oranges and the black/white mutation scale.
const EXPRESSION_RAMP = ["#FFFFD9", "#EDF8B1", "#C7E9B4", "#7FCDBB", "#41B6C4", "#1D91C0", "#225EA8", "#253494", "#081D58"].map(hexToRgb);

/** Colour for an expression value: 0 is light grey, NaN/undefined is "no RNA" (null). */
export function expressionRGB(value, max) {
  if (value == null || !Number.isFinite(value)) return null;
  if (value <= 0 || !(max > 0)) return hexToRgb(EXPRESSION_ZERO_COLOR);
  // Gamma < 1 lifts low values so sparse expression stays visible.
  const t = Math.pow(Math.min(1, value / max), 0.7) * (EXPRESSION_RAMP.length - 1);
  const k = Math.min(EXPRESSION_RAMP.length - 2, Math.floor(t));
  const f = t - k;
  return EXPRESSION_RAMP[k].map((c, i) => Math.round(c + (EXPRESSION_RAMP[k + 1][i] - c) * f));
}

export function expressionRGBA(value, max) {
  const rgb = expressionRGB(value, max);
  return rgb ? packRGBA(rgb) : missingRGBA();
}

/* ----------------------------------------------------------------------- */
/* Configurable copy-number palettes                                        */
/* ----------------------------------------------------------------------- */

// pgv phylogeny palette (states 0..10, 11+). Allelic channels shift it so
// CN 1 is the neutral white; Total keeps CN 2 white.
const PGV_TOTAL = [
  "#168CCB", "#8FD3E8", "#FFFFFF", "#FDBF6F", "#FF8A3D", "#FF5A24",
  "#EF2B2D", "#D7193F", "#B2184B", "#8C1D40", "#5A2630", "#000000",
];
const shiftForAllelic = (p) => [p[0], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[9], p[10], p[11], p[11]];

// Blue-white-red diverging (ColorBrewer RdBu, reversed), 2 = white.
const DIVERGING_TOTAL = ["#2166AC", "#92C5DE", "#FFFFFF", "#FDDBC7", "#F4A582", "#E58368", "#D6604D", "#C43C3C", "#B2182B", "#8E0F22", "#67001F", "#2D0010"];
// Sequential ramps: 0 dark, 11+ bright (viridis / magma samples).
const VIRIDIS_TOTAL = ["#440154", "#482475", "#414487", "#355F8D", "#2A788E", "#21918C", "#22A884", "#44BF70", "#7AD151", "#BDDF26", "#FDE725", "#FFFFE0"];
const MAGMA_TOTAL = ["#000004", "#180F3E", "#451077", "#721F81", "#9F2F7F", "#CD4071", "#F1605D", "#FD9567", "#FEC98D", "#FCFDBF", "#FFFFFF", "#FFFFFF"];
// Zissou-inspired: cool losses, warm gains, 2 = pale.
const ZISSOU_TOTAL = ["#3B9AB2", "#78B7C5", "#EEEEE6", "#EBCC2A", "#E1AF00", "#F2AD00", "#F98400", "#F21A00", "#C81400", "#9A0E00", "#6B0A00", "#2B0400"];

// dark-theme variant of the pgv palette: CN 2 is dark grey instead of white,
// and 11+ (black in pgv) is near-white so the highest amplifications do not
// vanish into the dark background
const PGV_DARK = PGV_TOTAL.map((c, k) => (k === 2 ? "#2e2e2e" : k === 11 ? "#f2e6ea" : c));

export const CN_PALETTE_PRESETS = {
  pgv: { total: PGV_TOTAL, allelic: shiftForAllelic(PGV_TOTAL), missing: "#EEEEEE" },
  pgvDark: { total: PGV_DARK, allelic: shiftForAllelic(PGV_DARK), missing: "#1a1a1a" },
  diverging: { total: DIVERGING_TOTAL, allelic: shiftForAllelic(DIVERGING_TOTAL), missing: "#EEEEEE" },
  zissou: { total: ZISSOU_TOTAL, allelic: shiftForAllelic(ZISSOU_TOTAL), missing: "#EEEEEE" },
  viridis: { total: VIRIDIS_TOTAL, allelic: shiftForAllelic(VIRIDIS_TOTAL), missing: "#EEEEEE" },
  magma: { total: MAGMA_TOTAL, allelic: shiftForAllelic(MAGMA_TOTAL), missing: "#EEEEEE" },
  scwgs: {
    total: CN_STATE_COLORS,
    allelic: shiftForAllelic(CN_STATE_COLORS).map((c, k) => (k === 1 ? "#CCCCCC" : c)),
    missing: MISSING_COLOR,
  },
};
export const DEFAULT_CN_PALETTE = "pgv";
export const CN_MODES = ["total", "major", "minor"];

const validHex = (c) => /^#[0-9a-f]{6}$/i.test(`${c || ""}`);

/** Fill gaps in a user palette from a preset, so stored palettes survive format changes. */
export function normalizePalette(palette, preset = DEFAULT_CN_PALETTE) {
  const base = CN_PALETTE_PRESETS[preset] || CN_PALETTE_PRESETS[DEFAULT_CN_PALETTE];
  const pick = (list, fallback) =>
    fallback.map((c, k) => (Array.isArray(list) && validHex(list[k]) ? list[k] : c));
  return {
    total: pick(palette?.total, base.total),
    allelic: pick(palette?.allelic, base.allelic),
    missing: validHex(palette?.missing) ? palette.missing : base.missing,
  };
}

/** Packed-RGBA lookup for one CN mode: state -> colour (11+ share the last colour). */
export function cnColorer(palette, mode = "total") {
  const p = normalizePalette(palette);
  const colors = (mode === "total" ? p.total : p.allelic).map((c) => packRGBA(hexToRgb(c)));
  const missing = packRGBA(hexToRgb(p.missing));
  return (state) =>
    Number.isFinite(state)
      ? colors[Math.max(0, Math.min(colors.length - 1, Math.floor(state)))]
      : missing;
}

/* ----------------------------------------------------------------------- */
/* Mutation metrics (VAF, alt reads, total reads)                           */
/* ----------------------------------------------------------------------- */

export const SNV_METRICS = ["vaf", "alt", "depth", "gt"];
// genotype calls: no call / ref / alt
export const GT_COLORS = { nocall: "#D9D9D9", ref: "#9ECAE1", alt: "#B2182B" };
export const SNV_MISSING_COLOR = "#ADB5BD";
const SNV_MISSING_RGBA = packRGBA(hexToRgb(SNV_MISSING_COLOR));

/** Value of a metric for matrix row p, variant c; null when the site has no reads. */
export function snvMetricValue(snv, p, c, metric) {
  if (metric === "gt") {
    if (p < 0 || !snv.gt) return null;
    const g = snv.gt[p][c];
    return g === 1 || g === 0 ? g : null; // 1 alt, 0 ref, null = no call
  }
  if (p < 0 || snv.status[p][c] < 0) return null;
  const alt = snv.alt[p][c];
  const depth = snv.depth[p][c];
  if (metric === "alt") return Number.isFinite(alt) ? alt : snv.status[p][c] === 1 ? null : 0;
  if (metric === "depth") return Number.isFinite(depth) ? depth : null;
  if (Number.isFinite(alt) && depth > 0) return alt / depth;
  return snv.status[p][c] === 0 && !Number.isFinite(depth) ? 0 : null;
}

/** White (0) to black (1), as pgv draws VAF and binned positive fractions; dark theme: dark (0) to white (1). */
export function vafRGBA(value) {
  if (value == null || !Number.isFinite(value)) return isDarkPlots() ? packRGBA([70, 74, 80]) : SNV_MISSING_RGBA;
  const f = Math.max(0, Math.min(1, value));
  const v = isDarkPlots() ? Math.round(31 + 224 * f) : Math.round(255 * (1 - f));
  return packRGBA([v, v, v]);
}

/** Read counts are right-skewed: log1p blue-to-red, scaled to the patient maximum. */
export function countRGBA(value, max) {
  if (value == null || !Number.isFinite(value)) return SNV_MISSING_RGBA;
  const top = Math.max(1, max || 1);
  const t = Math.log1p(Math.max(0, Math.min(top, value))) / Math.log1p(top);
  return packRGBA([Math.round(255 * t), 128, Math.round(255 * (1 - t))]);
}

export function snvMetricMax(snv, metric) {
  if (metric === "vaf" || metric === "gt") return 1;
  const source = metric === "alt" ? snv.alt : snv.depth;
  let max = 1;
  source.forEach((row) => row.forEach((v) => {
    if (Number.isFinite(v) && v > max) max = v;
  }));
  return max;
}

export function snvMetricRGBA(value, metric, max) {
  if (metric === "gt") {
    if (value === 1) return packRGBA(hexToRgb(GT_COLORS.alt));
    if (value === 0) return packRGBA(hexToRgb(GT_COLORS.ref));
    return packRGBA(hexToRgb(isDarkPlots() ? "#3a3a3a" : GT_COLORS.nocall));
  }
  return metric === "vaf" ? vafRGBA(value) : countRGBA(value, max);
}

/** Tick values for a count legend on the log1p scale. */
export function countTicks(max) {
  const top = Math.max(1, Math.round(max || 1));
  return [...new Set([0, 1 / 3, 2 / 3, 1].map((f) => (f === 1 ? top : Math.round(Math.expm1(Math.log1p(top) * f)))))];
}

/**
 * Summary of one bin of columns for row p: sites with alt reads, covered
 * sites without, and sites with no reads. The overview colour is the
 * fraction of positive sites (pgv convention), not a mean VAF.
 */
export function snvBinSummary(snv, p, columns, start, end) {
  let positive = 0;
  let zero = 0;
  let missing = 0;
  for (let k = start; k < end; k += 1) {
    const s = p < 0 ? -1 : snv.status[p][columns[k]];
    if (s === 1) positive += 1;
    else if (s === 0) zero += 1;
    else missing += 1;
  }
  return { positive, zero, missing };
}

/**
 * Map `width` pixels onto columns[start..end): one bin per pixel when sites
 * outnumber pixels, else each site spans several pixels. Returns per pixel
 * the bin's [start, end) offsets into `columns` (Int32Arrays, -1 = none).
 */
export function columnBins(count, width, range = [0, count]) {
  const w = Math.max(0, Math.floor(width));
  const binStart = new Int32Array(w).fill(-1);
  const binEnd = new Int32Array(w).fill(-1);
  const start = Math.max(0, Math.min(count, Math.floor(range[0])));
  const end = Math.max(start, Math.min(count, Math.ceil(range[1])));
  const span = end - start;
  if (!span || !w) return { binStart, binEnd, binned: false };
  for (let x = 0; x < w; x += 1) {
    const a = start + Math.floor((x * span) / w);
    const b = start + Math.floor(((x + 1) * span) / w);
    binStart[x] = a;
    binEnd[x] = Math.max(a + 1, b);
  }
  return { binStart, binEnd, binned: span > w };
}

/**
 * Column order that follows the tree: each variant is placed on the clade
 * (contiguous leaf rows [firstLeaf, lastLeaf]) that best matches the cells
 * calling it (F1 over cells with reads), then variants are sorted by clade in
 * depth-first order with the trunk first, and by prevalence within a clade.
 * rows: matrix row (in snv) for each display row (rowMap of display order).
 */
export function treeColumnOrder(snv, layout, rows) {
  const nVar = snv.variants.length;
  if (!layout || !nVar) return snv.variants.map((v) => v.index);
  const nLeaves = layout.leaves.length;
  const carriers = Array.from({ length: nVar }, () => []);
  const covered = Array.from({ length: nVar }, () => []);
  for (let r = 0; r < nLeaves; r += 1) {
    const p = rows[r];
    if (p < 0) continue;
    const status = snv.status[p];
    for (let c = 0; c < nVar; c += 1) {
      if (status[c] >= 0) covered[c].push(r);
      if (status[c] === 1) carriers[c].push(r);
    }
  }
  const countIn = (sorted, lo, hi) => {
    const lower = (v) => {
      let a = 0;
      let b = sorted.length;
      while (a < b) {
        const m = (a + b) >> 1;
        if (sorted[m] < v) a = m + 1;
        else b = m;
      }
      return a;
    };
    return lower(hi + 1) - lower(lo);
  };
  // Depth-first rank of each clade: parents before children, top to bottom.
  const nodes = layout.nodes.filter((n) => n.lastLeaf > n.firstLeaf || n.isLeaf);
  const rank = new Map();
  [...nodes]
    .sort((a, b) => a.firstLeaf - b.firstLeaf || b.lastLeaf - a.lastLeaf)
    .forEach((n, k) => rank.set(n, k));
  const placement = new Int32Array(nVar);
  const prevalence = new Float64Array(nVar);
  for (let c = 0; c < nVar; c += 1) {
    const nCarry = carriers[c].length;
    prevalence[c] = covered[c].length ? nCarry / covered[c].length : 0;
    if (!nCarry) {
      placement[c] = Number.MAX_SAFE_INTEGER;
      continue;
    }
    let best = null;
    let bestScore = -1;
    nodes.forEach((n) => {
      const inside = countIn(carriers[c], n.firstLeaf, n.lastLeaf);
      if (!inside) return;
      const coveredInside = countIn(covered[c], n.firstLeaf, n.lastLeaf);
      const precision = inside / nCarry;
      const recall = coveredInside ? inside / coveredInside : 0;
      const f1 = (2 * precision * recall) / (precision + recall || 1);
      if (f1 > bestScore + 1e-12 || (Math.abs(f1 - bestScore) <= 1e-12 && rank.get(n) < rank.get(best))) {
        bestScore = f1;
        best = n;
      }
    });
    placement[c] = best ? rank.get(best) : Number.MAX_SAFE_INTEGER;
  }
  return snv.variants
    .map((v) => v.index)
    .sort((a, b) => placement[a] - placement[b] || prevalence[b] - prevalence[a] || a - b);
}

/**
 * Zoom factor for one wheel event, as d3-zoom computes it (the genome plots'
 * behaviour): 2^(delta * k) with k = 0.002 per pixel, 0.05 per line, 1 per
 * page, and 10x for pinch gestures (ctrlKey). >1 zooms out.
 */
export function wheelZoomFactor({ deltaY, deltaMode = 0, pinch = false }) {
  const k = deltaMode === 1 ? 0.05 : deltaMode ? 1 : 0.002;
  return Math.pow(2, deltaY * k * (pinch ? 10 : 1));
}

/* ----------------------------------------------------------------------- */
/* Annotation colours shared by every view                                  */
/* ----------------------------------------------------------------------- */

// Fixed colours for GBM cell states so they match across views.
// GBM cell states as in the lab's figures (bwh69.R state.col_fun): OPC green,
// NPC blue, AC orange, MES red; "-like" names share the colour.
const KNOWN_LEVEL_COLORS = {
  MES: "#eb2626",
  NPC: "#3b54a3",
  OPC: "#6cbd45",
  AC: "#f9a41b",
  "MES-like": "#eb2626",
  "NPC-like": "#3b54a3",
  "OPC-like": "#6cbd45",
  "AC-like": "#f9a41b",
  "Enhancing Edge": "#F28E2B",
  "Non-Enhancing Peritumoral": "#4E79A7",
};
const ANNOTATION_PALETTE = ["#59A14F", "#9C755F", "#FF9DA7", "#BAB0AC", "#1B9E77", "#D95F02", "#7570B3", "#E7298A", "#66A61E", "#E6AB02", "#4E79A7", "#F28E2B", "#E15759", "#76B7B2", "#EDC948", "#B07AA1"];

/**
 * level -> colour for a categorical annotation (stable: sorted levels).
 * Known GBM states keep their fixed colours; the rest cycle through
 * `palette` (a theme's colours) or the built-in one.
 */
export function annotationColors(levels = [], palette = ANNOTATION_PALETTE) {
  const sorted = [...new Set(levels.map(String))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const out = {};
  let k = 0;
  sorted.forEach((l) => {
    out[l] = KNOWN_LEVEL_COLORS[l] || palette[k++ % palette.length];
  });
  return out;
}
