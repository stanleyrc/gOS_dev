// Window slicing and level of detail for the track browser's per-unit tracks. d3-free (jest).
import { toGlobal } from "./locus";

const bare = (c) => `${c ?? ""}`.replace(/^chr/i, "");

/** First index i with xs[i] >= v (xs sorted ascending). */
export function lowerBound(xs, v) {
  let lo = 0;
  let hi = xs.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (xs[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Coverage bins (genome-wide x, sorted) inside one laid-out window, summarized per pixel column:
 * returns { columns: [{ px, mean, min, max, n }], nBins, binned } where binned is true when several bins share
 * a column (zoomed out: level of detail) and false when each bin is drawn exactly.
 * values: the plotted values (f), aligned with xs. binWidth: bp per bin (for exact drawing).
 */
export function coverageColumns(xs, values, slot, chromoBins, binWidth = 10000) {
  const { window: w, width } = slot;
  const g0 = toGlobal(chromoBins, w.chrom, w.start);
  const g1 = toGlobal(chromoBins, w.chrom, w.end);
  if (!Number.isFinite(g0) || !xs || !xs.length) return { columns: [], nBins: 0, binned: false };
  const i0 = lowerBound(xs, g0 - binWidth);
  const i1 = lowerBound(xs, g1 + 1);
  const nBins = Math.max(0, i1 - i0);
  const span = g1 - g0;
  const pxPerBin = (binWidth / span) * width;
  if (pxPerBin >= 2) {
    const columns = [];
    for (let i = i0; i < i1; i += 1) {
      const v = values[i];
      if (!Number.isFinite(v)) continue;
      const a = ((xs[i] - g0) / span) * width;
      columns.push({ px: a, w: pxPerBin, mean: v, min: v, max: v, n: 1 });
    }
    return { columns, nBins, binned: false };
  }
  const cols = Math.max(1, Math.round(width));
  const sum = new Float64Array(cols);
  const cnt = new Uint32Array(cols);
  const mn = new Float64Array(cols).fill(Infinity);
  const mx = new Float64Array(cols).fill(-Infinity);
  for (let i = i0; i < i1; i += 1) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    const c = Math.floor(((xs[i] - g0) / span) * cols);
    if (c < 0 || c >= cols) continue;
    sum[c] += v;
    cnt[c] += 1;
    if (v < mn[c]) mn[c] = v;
    if (v > mx[c]) mx[c] = v;
  }
  const columns = [];
  for (let c = 0; c < cols; c += 1) {
    if (!cnt[c]) continue;
    columns.push({ px: (c / cols) * width, w: width / cols, mean: sum[c] / cnt[c], min: mn[c], max: mx[c], n: cnt[c] });
  }
  return { columns, nBins, binned: true };
}

/** A value at a quantile of an array (ignores non-finite). */
export function quantile(values, q) {
  const v = Array.from(values || []).filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  return v[Math.min(v.length - 1, Math.max(0, Math.floor(q * (v.length - 1))))];
}

/**
 * The graph (gGnome.js JSON) of one unit in the windows: segments (intervals overlapping a window) and ALT edges
 * with both breakends located. Edge sides follow gGnome.js: a positive sign is the interval's end, negative its start.
 * Returns { segments: [{ slot, start, end, cn, iid }], alts: [{ cid, cn, a, b, title }], loose: [...] } where a/b are
 * { chrom, pos, cn, slot } (slot -1 when the breakend is outside every window).
 */
export function graphInWindows(graph, slots) {
  const out = { segments: [], alts: [] };
  if (!graph || !Array.isArray(graph.intervals)) return out;
  const byId = new Map();
  graph.intervals.forEach((iv) => byId.set(Number(iv.iid), iv));
  const where = (chrom, pos) => slots.findIndex((s) => s.window.chrom === bare(chrom) && pos >= s.window.start && pos <= s.window.end);
  graph.intervals.forEach((iv) => {
    const c = bare(iv.chromosome);
    slots.forEach((s, k) => {
      if (s.window.chrom !== c || iv.endPoint < s.window.start || iv.startPoint > s.window.end) return;
      out.segments.push({ slot: k, start: Math.max(iv.startPoint, s.window.start), end: Math.min(iv.endPoint, s.window.end), cn: Number(iv.y), iid: iv.iid });
    });
  });
  const end = (signed) => {
    const iv = byId.get(Math.abs(Number(signed)));
    if (!iv) return null;
    const pos = Number(signed) > 0 ? iv.endPoint : iv.startPoint;
    const chrom = bare(iv.chromosome);
    return { chrom, pos, cn: Number(iv.y), slot: where(chrom, pos), sign: Math.sign(Number(signed)) };
  };
  (graph.connections || []).forEach((cx) => {
    if (cx.type !== "ALT" || cx.source == null || cx.sink == null) return;
    const a = end(cx.source);
    const b = end(cx.sink);
    if (!a || !b || (a.slot < 0 && b.slot < 0)) return;
    out.alts.push({ cid: cx.cid, cn: Number(cx.weight), title: cx.title || "", a, b, ...(cx.junction_source ? { source: cx.junction_source } : {}) });
  });
  return out;
}

/** A stable key for a junction regardless of which side is listed first (matches across cells within `tol` bp). */
export function junctionKey(a, b, tol = 0) {
  const r = (p) => (tol > 0 ? Math.round(p / tol) * tol : p);
  const ends = [`${a.chrom}:${r(a.pos)}${a.sign > 0 ? "+" : "-"}`, `${b.chrom}:${r(b.pos)}${b.sign > 0 ? "+" : "-"}`].sort();
  return ends.join("|");
}

/** The highest CN among segments (for the auto y max). */
export const maxSegmentCn = (segments) => segments.reduce((m, s) => (Number.isFinite(s.cn) && s.cn > m ? s.cn : m), 0);

const sameEnd = (x, y, tol) => x.chrom === y.chrom && Math.abs(x.pos - y.pos) <= tol;
/** Two ALT edges are the same junction when both breakends match within tol bp (either order). */
export const sameJunction = (j, k, tol = 1000) => (sameEnd(j.a, k.a, tol) && sameEnd(j.b, k.b, tol)) || (sameEnd(j.a, k.b, tol) && sameEnd(j.b, k.a, tol));

/**
 * Units whose graph carries the junction (an ALT edge matching both breakends within tol bp), with that edge's CN.
 * graphs: Map or object unitId -> gGnome.js JSON. Returns [{ id, cn }] in the given unit order.
 */
export function junctionCarriers(junction, unitIds, graphs, tol = 1000) {
  const get = (id) => (graphs instanceof Map ? graphs.get(id) : graphs?.[id]);
  const out = [];
  unitIds.forEach((id) => {
    const g = get(id);
    if (!g) return;
    const hit = graphInWindows(g, [
      { window: { chrom: junction.a.chrom, start: junction.a.pos - tol, end: junction.a.pos + tol } },
      { window: { chrom: junction.b.chrom, start: junction.b.pos - tol, end: junction.b.pos + tol } },
    ]).alts.find((k) => sameJunction(junction, k, tol));
    if (hit) out.push({ id, cn: hit.cn });
  });
  return out;
}
