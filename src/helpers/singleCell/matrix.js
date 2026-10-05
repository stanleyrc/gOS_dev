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

export function cnStateRGBA(state) {
  if (!Number.isFinite(state)) return MISSING_RGBA;
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

export const EXPRESSION_ZERO_COLOR = "#EFEDF5";
const EXPRESSION_LOW = hexToRgb("#DADAEB");
const EXPRESSION_HIGH = hexToRgb("#3F007D");

/** Sequential colour for an expression value; 0 is pale, NaN/undefined is "no RNA". */
export function expressionRGB(value, max) {
  if (value == null || !Number.isFinite(value)) return null;
  if (value <= 0 || !(max > 0)) return hexToRgb(EXPRESSION_ZERO_COLOR);
  const t = Math.min(1, value / max);
  return EXPRESSION_LOW.map((lo, k) => Math.round(lo + (EXPRESSION_HIGH[k] - lo) * t));
}

export function expressionRGBA(value, max) {
  const rgb = expressionRGB(value, max);
  return rgb ? packRGBA(rgb) : MISSING_RGBA;
}
