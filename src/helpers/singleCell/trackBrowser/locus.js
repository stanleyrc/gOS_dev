// Shared locus model of the track browser: one or more windows ({ chrom, start, end }, 1-based closed, chrom
// without "chr") shown side by side. Every track follows the same windows. d3-free so jest can test it.

export const MIN_SPAN = 200; // bp: the narrowest window
export const LOCUS_SEPARATOR = "|";

const bare = (c) => `${c ?? ""}`.trim().replace(/^chr/i, "");
const num = (s) => {
  const t = `${s}`.trim().replace(/,/g, "").toLowerCase();
  const m = t.match(/^([0-9.]+)\s*([kmg]?)b?$/);
  if (!m) return NaN;
  const scale = { "": 1, k: 1e3, m: 1e6, g: 1e9 }[m[2]];
  return Math.round(Number(m[1]) * scale);
};

/** Chromosome length from chromoBins (Settings.chromoBins: { [chrom]: { startPoint, endPoint, startPlace } }). */
export function chromLength(chromoBins, chrom) {
  const b = chromoBins && chromoBins[bare(chrom)];
  return b ? b.endPoint : null;
}

/** Genome-wide coordinate of a position (the gOS "place": chromosome offset + position). */
export function toGlobal(chromoBins, chrom, pos) {
  const b = chromoBins && chromoBins[bare(chrom)];
  if (!b) return NaN;
  return b.startPlace - b.startPoint + pos;
}

/** Parse one window: "chr12:55,500,000-72,500,000", "12:55.5m-72.5m", "chr12" (whole chromosome). Null when unparseable. */
export function parseWindow(text, chromoBins = null) {
  const t = `${text ?? ""}`.trim();
  if (!t) return null;
  const m = t.match(/^([^:\s]+)(?::\s*([0-9.,]+\s*[kmgKMG]?[bB]?)\s*[-–]\s*([0-9.,]+\s*[kmgKMG]?[bB]?))?$/);
  if (!m) return null;
  const chrom = bare(m[1]);
  const len = chromoBins ? chromLength(chromoBins, chrom) : null;
  if (chromoBins && len == null) return null;
  if (m[2] == null) return len == null ? null : { chrom, start: 1, end: len };
  let start = num(m[2]);
  let end = num(m[3]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (end < start) [start, end] = [end, start];
  return clampWindow({ chrom, start, end }, len);
}

/** Parse "w1 | w2 | ..." into windows; returns { windows, errors }. */
export function parseLocus(text, chromoBins = null) {
  const parts = `${text ?? ""}`.split(LOCUS_SEPARATOR).map((s) => s.trim()).filter(Boolean);
  const windows = [];
  const errors = [];
  parts.forEach((p) => {
    const w = parseWindow(p, chromoBins);
    if (w) windows.push(w);
    else errors.push(p);
  });
  return { windows, errors };
}

const commas = (n) => `${Math.round(n)}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
export const formatWindow = (w) => `chr${w.chrom}:${commas(w.start)}-${commas(w.end)}`;
export const formatLocus = (windows) => (windows || []).map(formatWindow).join(` ${LOCUS_SEPARATOR} `);
/** igv.js multi-locus string (space separated, no commas). */
export const igvLocus = (windows) => (windows || []).map((w) => `chr${w.chrom}:${Math.round(w.start)}-${Math.round(w.end)}`).join(" ");

/** Keep a window inside its chromosome and at least MIN_SPAN wide (the span is kept when it is pushed off an edge). */
export function clampWindow(w, len = null) {
  let span = Math.max(MIN_SPAN, w.end - w.start);
  if (len != null) span = Math.min(span, len - 1);
  let start = w.start;
  let end = start + span;
  if (start < 1) {
    start = 1;
    end = 1 + span;
  }
  if (len != null && end > len) {
    end = len;
    start = Math.max(1, len - span);
  }
  return { ...w, start: Math.round(start), end: Math.round(end) };
}

/** Zoom a window by `factor` (<1 zooms in) about a point at fraction `at` (0..1) of its width. */
export function zoomWindow(w, factor, at = 0.5, len = null) {
  const span = w.end - w.start;
  const pivot = w.start + at * span;
  const next = Math.max(MIN_SPAN, span * factor);
  return clampWindow({ ...w, start: pivot - at * next, end: pivot - at * next + next }, len);
}

/** Shift a window by `deltaBp` (positive moves right). */
export function panWindow(w, deltaBp, len = null) {
  return clampWindow({ ...w, start: w.start + deltaBp, end: w.end + deltaBp }, len);
}

/** A window of `flank` bp either side of a position. */
export const windowAround = (chrom, pos, flank, len = null) => clampWindow({ chrom: bare(chrom), start: pos - flank, end: pos + flank }, len);

/**
 * Pixel layout of the windows across `width` px with `gap` px between them: [{ window, x0, width }].
 * Widths are equal so each locus gets the same screen space whatever its span.
 */
export function layoutWindows(windows, width, gap = 8) {
  const n = (windows || []).length;
  if (!n || width <= 0) return [];
  const w = Math.max(10, (width - gap * (n - 1)) / n);
  return windows.map((win, i) => ({ window: win, x0: i * (w + gap), width: w }));
}

/** bp → px inside one laid-out window (px relative to the window's x0). */
export const bpToPx = (slot, pos) => ((pos - slot.window.start) / (slot.window.end - slot.window.start)) * slot.width;
/** px (relative to the window's x0) → bp. */
export const pxToBp = (slot, px) => slot.window.start + (px / slot.width) * (slot.window.end - slot.window.start);

/** Which laid-out window holds chrom:pos, or -1. */
export function slotOf(slots, chrom, pos) {
  const c = bare(chrom);
  return (slots || []).findIndex((s) => s.window.chrom === c && pos >= s.window.start && pos <= s.window.end);
}

/** Nice tick positions (bp) for a window: about `count` ticks. */
export function bpTicks(w, count = 5) {
  const span = w.end - w.start;
  if (span <= 0) return [];
  const raw = span / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) || 10 * pow;
  const out = [];
  for (let v = Math.ceil(w.start / step) * step; v <= w.end; v += step) out.push(v);
  return out;
}

/** Short tick label: 57.5 Mb, 320 kb, 950 bp. */
export function bpLabel(v, span) {
  if (span >= 2e6) return `${(v / 1e6).toFixed(span >= 2e7 ? 0 : 1)} Mb`;
  if (span >= 2e3) return `${(v / 1e3).toFixed(span >= 2e4 ? 0 : 1)} kb`;
  return `${commas(v)}`;
}
