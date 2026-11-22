// Raw EagleC calls (gos-eaglec/1, one file per Hi-C unit: {dataPath}{unit}/hic/eaglec.json) as a second overlay layer
// on the Hi-C contact maps, next to the graph junctions (the unit's genome-graph ALT edges). EagleC calls are drawn as
// open markers sized and colored by probability; kept = matched to a graph ALT edge (in_graph), dropped = not in the
// graph. d3-free so jest can test it.
import { axisOfPos, xOfPos } from "./hic";

export const EAGLEC_FORMAT = "gos-eaglec/1";
export const EAGLEC_URL = "{dataPath}{unit}/hic/eaglec.json";
export const EAGLEC_SHOW = ["all", "kept", "dropped"];
export const DEFAULT_OVERLAYS = {
  graph: { on: true },
  eaglec: { on: true, minProb: 0.5, show: "all" },
};

const bare = (c) => `${c ?? ""}`.replace(/^chr/i, "");

/** Problems with an eaglec.json ([] when usable). */
export function validateEaglec(d) {
  if (!d || typeof d !== "object") return ["not a JSON object"];
  const errors = [];
  if (d.format !== EAGLEC_FORMAT) errors.push(`format must be ${EAGLEC_FORMAT}`);
  if (!Array.isArray(d.calls)) errors.push("calls must be an array");
  return errors;
}

/** Calls normalized: chromosomes without "chr", numbers as numbers, in_graph boolean, edge_id string or null. */
export function parseEaglec(d) {
  return (d?.calls || [])
    .map((c, i) => ({
      id: c.id ?? i + 1,
      chr1: bare(c.chr1),
      pos1: Number(c.pos1),
      chr2: bare(c.chr2),
      pos2: Number(c.pos2),
      strand: c.strand ?? null,
      prob: Number(c.prob),
      probs: c.probs || null,
      res: Number(c.res) || null,
      fileTag: c.file_tag ?? null,
      inGraph: c.in_graph === true || c.in_graph === "TRUE",
      edgeId: c.edge_id == null ? null : `${c.edge_id}`,
      distBp: c.dist_bp == null ? null : Number(c.dist_bp),
    }))
    .filter((c) => c.chr1 && c.chr2 && Number.isFinite(c.pos1) && Number.isFinite(c.pos2));
}

/** Calls passing the filter: prob >= minProb and show "all" | "kept" (in graph) | "dropped" (not in graph). */
export function filterCalls(calls, { minProb = 0, show = "all" } = {}) {
  return (calls || []).filter((c) => (Number.isFinite(c.prob) ? c.prob : 0) >= minProb && (show === "kept" ? c.inGraph : show === "dropped" ? !c.inGraph : true));
}

/** Marker radius (px) for a probability: 3 px at 0.5 or below, 7 px at 1. */
export const markRadius = (p) => 3 + 4 * Math.max(0, Math.min(1, ((Number(p) || 0) - 0.5) / 0.5));

/** Marker color for a probability: light violet (0.5) -> dark violet (1); gives an rgb() string. */
export function markColor(p) {
  const t = Math.max(0, Math.min(1, ((Number(p) || 0) - 0.5) / 0.5));
  const lerp = (a, b) => Math.round(a + (b - a) * t);
  return `rgb(${lerp(196, 84)},${lerp(160, 20)},${lerp(232, 140)})`;
}

/**
 * EagleC marks on a map: calls with both breakends inside the windows, as { xa, xb, ia, ib, call } (screen columns
 * relative to the first window, xa <= xb, and axis indices), like junctionMarks.
 */
export function eaglecMarks(calls, slots, wb) {
  const out = [];
  (calls || []).forEach((c) => {
    const x1 = xOfPos(slots, c.chr1, c.pos1);
    const x2 = xOfPos(slots, c.chr2, c.pos2);
    if (x1 == null || x2 == null) return;
    out.push({ xa: Math.min(x1, x2), xb: Math.max(x1, x2), ia: axisOfPos(wb, c.chr1, c.pos1), ib: axisOfPos(wb, c.chr2, c.pos2), call: c });
  });
  return out;
}

/**
 * Screen point(s) of a mark: triangle -> [((xa + xb) / 2, (xb - xa) / 2)]; square -> both mirror images
 * [(xa, xb * k), (xb, xa * k)] with k = height / width.
 */
export function markPoints(mk, mode = "triangle", k = 1) {
  if (mode === "square") return [[mk.xa, mk.xb * k], [mk.xb, mk.xa * k]];
  return [[(mk.xa + mk.xb) / 2, (mk.xb - mk.xa) / 2]];
}

/** The mark nearest (x, y) within its radius + tol, or null. marks: [{ ..., r }] with points from markPoints. */
export function nearestMark(marks, x, y, mode = "triangle", k = 1, tol = 3) {
  let best = null;
  (marks || []).forEach((mk) => {
    const r = (mk.r ?? 5) + tol;
    markPoints(mk, mode, k).forEach(([px, py]) => {
      const d = Math.hypot(px - x, py - y);
      if (d <= r && (!best || d < best.d)) best = { d, mk };
    });
  });
  return best ? best.mk : null;
}

const fmtPos = (c, p) => `chr${c}:${Number(p).toLocaleString("en-US")}`;
const fmtRes = (r) => (!r ? "?" : r >= 1e6 ? `${r / 1e6} Mb` : `${r / 1e3} kb`);

/** Hover lines for an EagleC call. */
export function eaglecHoverLines(c) {
  const kept = c.inGraph ? `kept: in graph (edge ${c.edgeId ?? "?"}${c.distBp != null ? `, breakends within ${c.distBp.toLocaleString("en-US")} bp` : ""})` : "dropped: not in the graph";
  return [
    `EagleC call ${c.id}`,
    `${fmtPos(c.chr1, c.pos1)} × ${fmtPos(c.chr2, c.pos2)}`,
    `prob ${Number.isFinite(c.prob) ? c.prob.toFixed(3) : "?"} · strand ${c.strand ?? "?"} · ${fmtRes(c.res)} bins${c.fileTag ? ` (${c.fileTag})` : ""}`,
    kept,
  ];
}

/** Hover lines for a graph junction mark (ALT edge). */
export function junctionHoverLines(j) {
  const a = j.a || {};
  const b = j.b || {};
  const id = j.id ?? j.cid;
  return [`graph junction${id != null ? ` ${id}` : ""}${Number.isFinite(j.cn) ? ` · CN ${j.cn}` : ""}`, `${fmtPos(a.chrom, a.pos)} × ${fmtPos(b.chrom, b.pos)}`];
}

/** Counts for a legend: { total, shown, kept, dropped } (shown = after the filter, both ends anywhere). */
export function eaglecCounts(calls, filter) {
  const shown = filterCalls(calls, filter);
  return { total: (calls || []).length, shown: shown.length, kept: shown.filter((c) => c.inGraph).length, dropped: shown.filter((c) => !c.inGraph).length };
}

/** gos-track-spec v0.5 hic `overlays` from the viewer state ({ graph: { on }, eaglec: { on, minProb, show } }). */
export function overlaysToSpec(o = DEFAULT_OVERLAYS) {
  const g = { ...DEFAULT_OVERLAYS.graph, ...(o.graph || {}) };
  const e = { ...DEFAULT_OVERLAYS.eaglec, ...(o.eaglec || {}) };
  return [
    { id: "graph", type: "graph-junctions", on: g.on !== false },
    { id: "eaglec", type: "eaglec", url: EAGLEC_URL, on: e.on !== false, min_prob: Number(e.minProb) || 0, show: EAGLEC_SHOW.includes(e.show) ? e.show : "all" },
  ];
}

/**
 * Viewer overlay state from a spec hic track: v0.5 `overlays`, else the v0.4 `junctions.overlay` flag (EagleC on by
 * default; a v0.4 view had no EagleC layer, so it is shown with the default filter).
 */
export function overlaysFromSpec(track = {}) {
  const out = { graph: { ...DEFAULT_OVERLAYS.graph }, eaglec: { ...DEFAULT_OVERLAYS.eaglec } };
  if (Array.isArray(track.overlays)) {
    track.overlays.forEach((o) => {
      if (o?.type === "graph-junctions" || o?.id === "graph") out.graph = { on: o.on !== false };
      if (o?.type === "eaglec" || o?.id === "eaglec")
        out.eaglec = {
          on: o.on !== false,
          minProb: Number.isFinite(Number(o.min_prob)) ? Number(o.min_prob) : DEFAULT_OVERLAYS.eaglec.minProb,
          show: EAGLEC_SHOW.includes(o.show) ? o.show : "all",
        };
    });
  } else if (track.junctions) out.graph = { on: track.junctions.overlay !== false };
  return out;
}

/**
 * Arcs of the per-unit junction lane (paired layout): graph ALT edges and filtered EagleC calls with at least one
 * breakend in the windows, as { x1, x2 (null when that end is outside), kind: "graph" | "eaglec", item }. x relative to
 * the first window's x0, x1 <= x2 when both are present.
 */
export function laneArcs(alts, calls, slots) {
  const out = [];
  const add = (kind, item, c1, p1, c2, p2) => {
    let x1 = xOfPos(slots, c1, p1);
    let x2 = xOfPos(slots, c2, p2);
    if (x1 == null && x2 == null) return;
    if (x1 == null) [x1, x2] = [x2, null];
    else if (x2 != null && x2 < x1) [x1, x2] = [x2, x1];
    out.push({ x1, x2, kind, item });
  };
  (alts || []).forEach((j) => add("graph", j, j.a.chrom, j.a.pos, j.b.chrom, j.b.pos));
  (calls || []).forEach((c) => add("eaglec", c, c.chr1, c.pos1, c.chr2, c.pos2));
  return out;
}

/** All marks within their radius + tol of (x, y), nearest first (an EagleC call and its graph edge often coincide). */
export function marksAt(marks, x, y, mode = "triangle", k = 1, tol = 3) {
  const out = [];
  (marks || []).forEach((mk) => {
    const d = Math.min(...markPoints(mk, mode, k).map(([px, py]) => Math.hypot(px - x, py - y)));
    if (d <= (mk.r ?? 5) + tol) out.push({ d, mk });
  });
  return out.sort((a, b) => a.d - b.d).map((o) => o.mk);
}
