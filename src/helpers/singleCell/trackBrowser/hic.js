// Hi-C contact maps over the track browser's windows (GxG gMap style on a multi-range view): the windows are
// concatenated into one axis, each window's cis block sits on the diagonal and trans blocks between windows sit off
// it. Data come from gos-hic-tiles/1 exports (skilift sc_export_hic_tiles): index.json + one range-readable binary
// per resolution, [bin1 offsets u32 x (nbins+1)] [weights f32 x nbins] [(bin2 u32, count f32) x nnz], cooler upper
// triangle sorted by bin1. d3-free so jest can test it.

export const HIC_FORMAT = "gos-hic-tiles/1";
export const CHUNK_BINS = 256; // rows fetched together (aligned), so panning reuses chunks
export const MAX_AXIS_BINS = 1400; // dense matrix cap (N x N floats)

const bare = (c) => `${c ?? ""}`.replace(/^chr/i, "");

/** Problems with an index.json ([] when usable). */
export function validateHicIndex(idx) {
  const errors = [];
  if (!idx || typeof idx !== "object") return ["not a JSON object"];
  if (idx.format !== HIC_FORMAT) errors.push(`format must be ${HIC_FORMAT}`);
  if (!Array.isArray(idx.resolutions) || !idx.resolutions.length) errors.push("no resolutions");
  else
    idx.resolutions.forEach((r, i) => {
      if (!(r.res > 0) || !r.file || !Array.isArray(r.chroms) || !r.sections) errors.push(`resolution ${i} incomplete`);
    });
  return errors;
}

/** The chromosome entry of a resolution ({ name, length, bin_offset, nbins }) or null. */
export const chromEntry = (resEntry, chrom) => (resEntry?.chroms || []).find((c) => bare(c.name) === bare(chrom)) || null;

/**
 * Bins of each window at one resolution, concatenated: [{ k, chrom, b0, b1, n, axis0, start, end }] where b0..b1 are
 * the export's global bin ids (inclusive) and axis0 the window's first index on the concatenated axis. A window on a
 * chromosome the export lacks gets n = 0.
 */
export function windowBins(resEntry, windows) {
  let axis = 0;
  return (windows || []).map((w, k) => {
    const c = chromEntry(resEntry, w.chrom);
    if (!c) return { k, chrom: bare(w.chrom), b0: 0, b1: -1, n: 0, axis0: axis, start: w.start, end: w.end, missing: true };
    const res = resEntry.res;
    const lo = Math.max(0, Math.floor((w.start - 1) / res));
    const hi = Math.min(c.nbins - 1, Math.floor((w.end - 1) / res));
    const n = Math.max(0, hi - lo + 1);
    const out = { k, chrom: bare(w.chrom), b0: c.bin_offset + lo, b1: c.bin_offset + hi, n, axis0: axis, start: w.start, end: w.end, binStart: lo * res + 1, res };
    axis += n;
    return out;
  });
}

export const axisLength = (wb) => (wb || []).reduce((s, w) => s + w.n, 0);

/**
 * The resolution to draw: the finest whose concatenated axis has at most `targetBins` bins (about one bin per 1.5 px),
 * else the coarsest. `override` (a bin size present in the index) wins when its axis fits MAX_AXIS_BINS.
 */
export function pickResolution(index, windows, targetBins, override = null) {
  const list = [...(index?.resolutions || [])].sort((a, b) => a.res - b.res);
  if (!list.length) return null;
  if (override != null) {
    const r = list.find((x) => x.res === Number(override));
    if (r && axisLength(windowBins(r, windows)) <= MAX_AXIS_BINS) return r;
  }
  const t = Math.min(MAX_AXIS_BINS, Math.max(16, targetBins));
  return list.find((r) => axisLength(windowBins(r, windows)) <= t) || list[list.length - 1];
}

/** Chunk ids (aligned CHUNK_BINS row blocks, by global bin) needed for the windows. */
export function chunksFor(wb, nbins) {
  const ids = new Set();
  (wb || []).forEach((w) => {
    if (!w.n) return;
    for (let c = Math.floor(w.b0 / CHUNK_BINS); c <= Math.floor(w.b1 / CHUNK_BINS); c += 1) ids.add(c);
  });
  return [...ids].filter((c) => c * CHUNK_BINS < nbins).sort((a, b) => a - b);
}

/** Byte ranges (inclusive, for an HTTP Range header) of a chunk's offsets and weights. */
export function chunkRanges(resEntry, chunk) {
  const s = resEntry.sections;
  const r0 = chunk * CHUNK_BINS;
  const r1 = Math.min(resEntry.nbins - 1, r0 + CHUNK_BINS - 1);
  return {
    r0,
    r1,
    offsets: [s.offsets.byte + 4 * r0, s.offsets.byte + 4 * (r1 + 2) - 1],
    weights: [s.weights.byte + 4 * r0, s.weights.byte + 4 * (r1 + 1) - 1],
  };
}

/** Byte range of pixels p0..p1-1 (global pixel indices from the offsets), or null when empty. */
export function pixelRange(resEntry, p0, p1) {
  if (!(p1 > p0)) return null;
  const s = resEntry.sections.pixels;
  const stride = s.stride || 8;
  return [s.byte + stride * p0, s.byte + stride * p1 - 1];
}

/**
 * Decode a fetched chunk: offsets (ArrayBuffer of (nrows+1) u32), weights (nrows f32), pixels (ArrayBuffer of
 * (bin2 u32, count f32) records starting at offsets[0]). Returns { r0, r1, rowStart: Uint32Array (relative), bin2,
 * count, weights }.
 */
export function decodeChunk(r0, r1, offsetsBuf, weightsBuf, pixelsBuf) {
  const off = new Uint32Array(offsetsBuf.slice(0));
  const base = off[0];
  const rowStart = new Uint32Array(off.length);
  for (let i = 0; i < off.length; i += 1) rowStart[i] = off[i] - base;
  const np = rowStart[rowStart.length - 1];
  const bin2 = new Uint32Array(np);
  const count = new Float32Array(np);
  if (np && pixelsBuf) {
    const dv = new DataView(pixelsBuf);
    for (let i = 0; i < np; i += 1) {
      bin2[i] = dv.getUint32(8 * i, true);
      count[i] = dv.getFloat32(8 * i + 4, true);
    }
  }
  const weights = weightsBuf ? new Float32Array(weightsBuf.slice(0)) : new Float32Array(r1 - r0 + 1).fill(NaN);
  return { r0, r1, rowStart, bin2, count, weights };
}

/**
 * Dense symmetric N x N matrix over the concatenated axis from decoded chunks (Map chunkId -> chunk).
 * mode "raw" (counts) or "balanced" (count * w1 * w2; NaN when a bin is filtered). Returns
 * { n, values: Float32Array, weights: Float32Array (per axis bin), missingChunks, nPixels }.
 */
export function buildMatrix(wb, chunks, mode = "raw") {
  const n = axisLength(wb);
  const values = new Float32Array(n * n);
  const axisW = new Float32Array(n).fill(NaN);
  let missingChunks = 0;
  let nPixels = 0;
  const chunkOf = (bin) => chunks.get(Math.floor(bin / CHUNK_BINS));
  // per-axis weights
  wb.forEach((w) => {
    for (let b = w.b0; b <= w.b1; b += 1) {
      const ch = chunkOf(b);
      if (ch) axisW[w.axis0 + b - w.b0] = ch.weights[b - ch.r0];
    }
  });
  const balanced = mode === "balanced";
  wb.forEach((w) => {
    for (let b = w.b0; b <= w.b1; b += 1) {
      const ch = chunkOf(b);
      if (!ch) {
        missingChunks += 1;
        continue;
      }
      const a = w.axis0 + b - w.b0;
      const r = b - ch.r0;
      const wa = ch.weights[r];
      for (let p = ch.rowStart[r]; p < ch.rowStart[r + 1]; p += 1) {
        const b2 = ch.bin2[p];
        for (let k = 0; k < wb.length; k += 1) {
          const w2 = wb[k];
          if (b2 < w2.b0 || b2 > w2.b1) continue;
          const bb = w2.axis0 + b2 - w2.b0;
          let v = ch.count[p];
          if (balanced) v = v * wa * axisW[bb];
          values[a * n + bb] = v;
          values[bb * n + a] = v;
          nPixels += 1;
        }
      }
    }
  });
  return { n, values, weights: axisW, missingChunks, nPixels };
}

/** The q-quantile of the finite positive values (robust color max), skipping the main diagonal when offDiag. */
export function robustMax(m, q = 0.99, offDiag = true) {
  const vals = [];
  for (let i = 0; i < m.n; i += 1)
    for (let j = offDiag ? i + 1 : i; j < m.n; j += 1) {
      const v = m.values[i * m.n + j];
      if (v > 0 && Number.isFinite(v)) vals.push(v);
    }
  if (!vals.length) return 0;
  vals.sort((a, b) => a - b);
  return vals[Math.min(vals.length - 1, Math.floor(q * (vals.length - 1)))];
}

/** 0..1 color position: log1p(v) / log1p(max) (log) or v / max (linear), clipped. NaN stays NaN. */
export function colorPos(v, max, log = true) {
  if (!Number.isFinite(v)) return NaN;
  if (!(max > 0) || v <= 0) return 0;
  const t = log ? Math.log1p(v) / Math.log1p(max) : v / max;
  return t > 1 ? 1 : t;
}

/** White -> red (Juicebox-style) RGB for a 0..1 position; NaN (filtered bin) is light grey. */
export function heatRgb(t) {
  if (!Number.isFinite(t)) return [228, 228, 228];
  const k = Math.max(0, Math.min(1, t));
  if (k < 0.5) {
    const u = k / 0.5;
    return [255, Math.round(255 - 120 * u), Math.round(255 - 205 * u)];
  }
  const u = (k - 0.5) / 0.5;
  return [Math.round(255 - 95 * u), Math.round(135 - 135 * u), Math.round(50 - 50 * u)];
}

/**
 * Screen column -> concatenated-axis index for x = 0..width-1 (px relative to the first window's x0), from the
 * track browser slots ({ window, x0, width }) and the window bins. Gaps between windows map to -1.
 */
export function columnAxis(slots, wb, width) {
  const out = new Int32Array(Math.max(0, Math.round(width))).fill(-1);
  slots.forEach((s, k) => {
    const w = wb[k];
    if (!w || !w.n) return;
    const span = s.window.end - s.window.start;
    for (let x = Math.max(0, Math.floor(s.x0)); x < Math.min(out.length, Math.ceil(s.x0 + s.width)); x += 1) {
      const pos = s.window.start + ((x + 0.5 - s.x0) / s.width) * span;
      const bin = Math.floor((pos - 1) / w.res) - (w.binStart - 1) / w.res;
      if (bin >= 0 && bin < w.n) out[x] = w.axis0 + bin;
    }
  });
  return out;
}

/** Screen x (relative to the first window's x0) of a genomic position, or null when it is outside every window. */
export function xOfPos(slots, chrom, pos) {
  const c = bare(chrom);
  for (let k = 0; k < slots.length; k += 1) {
    const s = slots[k];
    if (s.window.chrom === c && pos >= s.window.start && pos <= s.window.end) return s.x0 + ((pos - s.window.start) / (s.window.end - s.window.start)) * s.width;
  }
  return null;
}

/**
 * Triangle (45 degrees, apex down) geometry: a contact between screen columns xa <= xb sits at
 * ((xa + xb) / 2, (xb - xa) / 2). Inverse for a pixel (x, y): xa = x - y, xb = x + y.
 */
export const triangleXY = (xa, xb) => [(xa + xb) / 2, Math.abs(xb - xa) / 2];
export const trianglePair = (x, y) => [x - y, x + y];

/**
 * RGBA pixels of the map. mode "triangle": width x height, the pair under pixel (x, y) is (x - y, x + y), so the
 * diagonal is the top edge and x stays aligned with the tracks. mode "square": width x height, columns and rows both
 * follow the window layout (rows scaled by height / width). Gaps and pairs outside the windows are transparent;
 * borders between windows are grey.
 */
export function renderPixels(m, cols, width, height, { mode = "triangle", max, log = true } = {}) {
  const W = Math.max(1, Math.round(width));
  const H = Math.max(1, Math.round(height));
  const rgba = new Uint8ClampedArray(W * H * 4);
  const n = m.n;
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i += 1) {
    const [r, g, b] = heatRgb(i / 255);
    lut[3 * i] = r;
    lut[3 * i + 1] = g;
    lut[3 * i + 2] = b;
  }
  const put = (o, v) => {
    const t = colorPos(v, max, log);
    if (!Number.isFinite(t)) {
      rgba[o] = 228;
      rgba[o + 1] = 228;
      rgba[o + 2] = 228;
    } else {
      const i = Math.round(t * 255) * 3;
      rgba[o] = lut[i];
      rgba[o + 1] = lut[i + 1];
      rgba[o + 2] = lut[i + 2];
    }
    rgba[o + 3] = 255;
  };
  if (mode === "square") {
    const rowScale = cols.length / H;
    for (let y = 0; y < H; y += 1) {
      const b = cols[Math.min(cols.length - 1, Math.floor((y + 0.5) * rowScale))] ?? -1;
      if (b < 0) continue;
      for (let x = 0; x < W; x += 1) {
        const a = cols[x] ?? -1;
        if (a < 0) continue;
        put(4 * (y * W + x), m.values[a * n + b]);
      }
    }
    return rgba;
  }
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const xa = x - y;
      const xb = x + y;
      if (xa < 0 || xb >= cols.length) continue;
      const a = cols[xa];
      const b = cols[xb];
      if (a < 0 || b < 0) continue;
      put(4 * (y * W + x), m.values[a * n + b]);
    }
  }
  return rgba;
}

/** Contact under a pixel: { a, b } axis indices (a <= b) or null. */
export function pairAt(cols, x, y, mode = "triangle", height = null) {
  let xa;
  let xb;
  if (mode === "square") {
    xa = Math.round(x);
    xb = Math.min(cols.length - 1, Math.floor((y + 0.5) * (cols.length / (height || cols.length))));
  } else [xa, xb] = trianglePair(Math.round(x), Math.round(y));
  if (xa < 0 || xb < 0 || xa >= cols.length || xb >= cols.length) return null;
  const a = cols[xa];
  const b = cols[xb];
  if (a < 0 || b < 0) return null;
  return a <= b ? { a, b } : { a: b, b: a };
}

/** Window and bp range of an axis index: { k, chrom, start, end } (1-based closed bin bounds). */
export function axisLocus(wb, i) {
  const w = (wb || []).find((x) => x.n && i >= x.axis0 && i < x.axis0 + x.n);
  if (!w) return null;
  const start = w.binStart + (i - w.axis0) * w.res;
  return { k: w.k, chrom: w.chrom, start, end: start + w.res - 1 };
}

/** Axis index of a genomic position (first window that holds it), or -1. */
export function axisOfPos(wb, chrom, pos) {
  const c = bare(chrom);
  const w = (wb || []).find((x) => x.n && x.chrom === c && pos >= x.start && pos <= x.end);
  if (!w) return -1;
  const i = Math.floor((pos - w.binStart) / w.res);
  return i >= 0 && i < w.n ? w.axis0 + i : -1;
}

/**
 * Junction marks: ALT edges (graphInWindows(...).alts: { a: { chrom, pos }, b: { chrom, pos } }) with both ends inside
 * the windows, as { xa, xb, ia, ib, value } (screen columns relative to the first window and axis indices).
 */
export function junctionMarks(alts, slots, wb, m = null) {
  const out = [];
  (alts || []).forEach((j) => {
    const xa = xOfPos(slots, j.a.chrom, j.a.pos);
    const xb = xOfPos(slots, j.b.chrom, j.b.pos);
    if (xa == null || xb == null) return;
    const ia = axisOfPos(wb, j.a.chrom, j.a.pos);
    const ib = axisOfPos(wb, j.b.chrom, j.b.pos);
    const value = m && ia >= 0 && ib >= 0 ? m.values[ia * m.n + ib] : null;
    out.push({ xa: Math.min(xa, xb), xb: Math.max(xa, xb), ia, ib, value, junction: j });
  });
  return out;
}

/** gos-track-spec `hic` track for the current view (round-trips through hicStateFromTrack). */
export function hicTrack(state) {
  return {
    id: "hic",
    type: "hic",
    title: "Hi-C contacts",
    per_unit: true,
    url: "{dataPath}{unit}/hic/index.json",
    format: HIC_FORMAT,
    units: state.units || [],
    mode: state.mode === "square" ? "square" : "triangle",
    resolution: state.resolution == null ? "auto" : Number(state.resolution),
    normalization: state.normalization === "balanced" ? "balanced" : "raw",
    color: { scale: state.log === false ? "linear" : "log", max: state.max == null ? `p${Math.round((state.quantile ?? 0.99) * 100)}` : Number(state.max), palette: "white-red" },
    junctions: { overlay: state.junctions !== false, source: "graph" },
    height: state.height ?? null,
    visible: state.visible !== false,
  };
}

/** Viewer state from a spec `hic` track (defaults for missing fields). */
export function hicStateFromTrack(t = {}) {
  const max = t.color?.max;
  const pm = typeof max === "string" ? max.match(/^p(\d+(?:\.\d+)?)$/) : null;
  return {
    units: Array.isArray(t.units) ? t.units : [],
    mode: t.mode === "square" ? "square" : "triangle",
    resolution: t.resolution == null || t.resolution === "auto" ? null : Number(t.resolution),
    normalization: t.normalization === "balanced" ? "balanced" : "raw",
    log: t.color?.scale !== "linear",
    quantile: pm ? Number(pm[1]) / 100 : 0.99,
    max: Number.isFinite(Number(max)) && typeof max !== "string" ? Number(max) : null,
    junctions: t.junctions?.overlay !== false,
    height: Number.isFinite(t.height) ? t.height : null,
    visible: t.visible !== false,
  };
}

/** Default Hi-C units: those with at least minCells cells (at most max), else the first. units: [{ id, nCells }]. */
export function defaultHicUnits(units, minCells = 100, max = 5) {
  const big = (units || []).filter((u) => (u.nCells || 0) >= minCells).slice(0, max).map((u) => u.id);
  return big.length ? big : (units || []).slice(0, 1).map((u) => u.id);
}
