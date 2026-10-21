// A cell's genome graph (gOS complex.json) in the paper lens: the part of the graph in one or more genomic windows,
// breakend sides and junction classes, the CN axis, and the gOS connector geometry (helpers/connection.js) for the
// canvas miniature. d3-free (jest cannot parse d3 ESM).

import { regionWindows } from "./paperZoom";

const chrOf = (c) => `${c}`.replace(/^chr/, "");
const inWin = (w, chr, pos) => w.chr === chr && pos >= w.from && pos <= w.to;
const normWins = (wins) => (Array.isArray(wins) ? wins : [wins]).filter(Boolean).map((w) => ({ chr: chrOf(w.chr), from: Number(w.from), to: Number(w.to) }));

/** Breakend side of a signed interval id in a connection: a positive id is the interval's right end, a negative its left end. */
export const breakendSide = (signedId) => (Number(signedId) > 0 ? "right" : "left");

/**
 * Class of a junction from its two breakends { chr, pos, side }: "TRA" (two chromosomes), "INV" (same side, inversion-like),
 * "DEL" (the lower end leaves rightwards and the upper end leftwards: deletion-like) or "DUP" (the reverse: tandem
 * duplication-like).
 */
export function junctionClass(a, b) {
  if (!a || !b) return "LOOSE";
  if (a.chr !== b.chr) return "TRA";
  if (a.side === b.side) return "INV";
  const [lo, hi] = a.pos <= b.pos ? [a, b] : [b, a];
  return lo.side === "right" && hi.side === "left" ? "DEL" : "DUP";
}

/**
 * The graph in the windows: segments [{ iid, chr, start, end, cn }], REF connectors [{ cid, chr, pos, cnA, cnB }],
 * ALT junctions [{ cid, a, b, cn, kind, title }] (a / b: { chr, pos, side, cn }; at least one end in a window) and loose
 * ends [{ cid, chr, pos, side, cn, weight }]. a is the source breakend, b the sink.
 */
export function lensGraph(graph, wins) {
  const W = normWins(wins);
  const any = (chr, pos) => W.some((w) => inWin(w, chr, pos));
  const ivs = graph?.intervals || [];
  const byId = new Map(ivs.map((i) => [Math.abs(Number(i.iid)), i]));
  const segs = ivs
    .filter((i) => W.some((w) => chrOf(i.chromosome) === w.chr && Number(i.endPoint) >= w.from && Number(i.startPoint) <= w.to))
    .map((i) => ({ iid: Math.abs(Number(i.iid)), chr: chrOf(i.chromosome), start: Number(i.startPoint), end: Number(i.endPoint), cn: Number(i.y) }));
  const end = (signed) => {
    if (signed == null || signed === 0) return null;
    const i = byId.get(Math.abs(Number(signed)));
    if (!i) return null;
    const side = breakendSide(signed);
    return { chr: chrOf(i.chromosome), pos: Number(side === "right" ? i.endPoint : i.startPoint), side, cn: Number(i.y) };
  };
  const refs = [];
  const alts = [];
  const loose = [];
  (graph?.connections || []).forEach((c) => {
    const type = `${c.type || ""}`.toUpperCase();
    const a = end(c.source);
    const b = end(c.sink);
    if (type === "LOOSE" || !a || !b) {
      const e = a || b;
      if (e && any(e.chr, e.pos)) loose.push({ cid: c.cid, ...e, weight: Number(c.weight) });
      return;
    }
    if (!any(a.chr, a.pos) && !any(b.chr, b.pos)) return;
    if (type === "REF") refs.push({ cid: c.cid, chr: a.chr, pos: Math.min(a.pos, b.pos), cnA: a.cn, cnB: b.cn });
    else alts.push({ cid: c.cid, a, b, cn: Number(c.weight), kind: junctionClass(a, b), title: c.title || "" });
  });
  return { segs, refs, alts, loose };
}

/**
 * Subgraph for rendering a window with the gOS genome plot: intervals in the windows plus the far intervals of
 * connections that touch them (so off-window ends draw as anchors), and those connections. Same shape as complex.json.
 */
export function subgraphForWindows(graph, wins) {
  const W = normWins(wins);
  const ivs = graph?.intervals || [];
  const byId = new Map(ivs.map((i) => [Math.abs(Number(i.iid)), i]));
  const keep = new Set(ivs.filter((i) => W.some((w) => chrOf(i.chromosome) === w.chr && Number(i.endPoint) >= w.from && Number(i.startPoint) <= w.to)).map((i) => Math.abs(Number(i.iid))));
  const inside = new Set(keep);
  const connections = (graph?.connections || []).filter((c) => {
    const ids = [c.source, c.sink].filter((x) => x != null && x !== 0).map((x) => Math.abs(Number(x)));
    if (!ids.some((id) => inside.has(id))) return false;
    if (!ids.every((id) => byId.has(id))) return false;
    ids.forEach((id) => keep.add(id));
    return true;
  });
  return { settings: graph?.settings || {}, intervals: ivs.filter((i) => keep.has(Math.abs(Number(i.iid)))), connections };
}

/** Quantile (0..1) of a numeric array (nearest rank on a sorted copy); 0 when empty. */
export function quantile(values, q) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return 0;
  return v[Math.min(v.length - 1, Math.max(0, Math.floor(q * v.length)))];
}

/**
 * CN axis top for a window: the 99th percentile of the coverage in it, but never below the highest CN of a segment
 * covering more than 1% of the window (tiny segments do not stretch the axis), and at least `floor`. Rounded up to an
 * integer with 5% headroom.
 */
export function lensYMax(segs, coverage, wins, floor = 4) {
  const W = normWins(wins);
  const span = W.reduce((s, w) => s + Math.max(1, w.to - w.from), 0);
  let segMax = 0;
  segs.forEach((s) => {
    const cover = W.reduce((n, w) => (s.chr && s.chr !== w.chr ? n : n + Math.max(0, Math.min(s.end, w.to) - Math.max(s.start, w.from))), 0);
    if (cover > 0.01 * span && s.cn > segMax) segMax = s.cn;
  });
  const top = Math.max(floor, quantile(coverage || [], 0.99), segMax);
  return Math.ceil(top * 1.05);
}

/** Nice integer ticks from 0 to top (about n of them, always including top). */
export function cnTicks(top, n = 4) {
  if (!(top > 0)) return [0];
  const raw = top / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const out = [];
  for (let t = 0; t < top - step * 0.3; t += step) out.push(Math.round(t));
  out.push(Math.round(top));
  return [...new Set(out)];
}

/**
 * Points of a junction connector in px, as gOS draws it (helpers/connection.js interConnectorEndpoints): each end
 * leaves its breakend towards its side (right: +x, left: -x), 5 then 25 px out; ends at equal CN arc 0.5 CN above it.
 * a / b: { x, cn, side }; Y: CN -> px.
 */
export function connectorPoints(a, b, Y) {
  const [o, t] = a.x <= b.x ? [a, b] : [b, a];
  const so = o.side === "right" ? 1 : -1;
  const st = t.side === "right" ? 1 : -1;
  const midX = (o.x + t.x) / 2;
  if (Math.abs(o.cn) === Math.abs(t.cn)) {
    const midCn = (o.cn + t.cn) / 2;
    return [
      [o.x, Y(o.cn)],
      [Math.min(o.x + so * 5, midX - 5), Y(o.cn + 0.06)],
      [Math.min(o.x + so * 25, midX - 5), Y(o.cn + 0.36)],
      [midX, Y(midCn + 0.5)],
      [Math.max(t.x + st * 25, midX + 5), Y(t.cn + 0.36)],
      [Math.max(t.x + st * 5, midX + 5), Y(t.cn + 0.06)],
      [t.x, Y(t.cn)],
    ];
  }
  const dir = Math.sign(t.cn - o.cn);
  return [
    [o.x, Y(o.cn)],
    [o.x + so * 5, Y(o.cn)],
    [o.x + so * 25, Y(o.cn + dir * (o.cn < 10 ? 0.25 : 2))],
    [t.x + st * 25, Y(t.cn - dir * (t.cn < 10 ? 0.25 : 2))],
    [t.x + st * 5, Y(t.cn)],
    [t.x, Y(t.cn)],
  ];
}

/** Loose-end connector points (gOS looseConnectorEndpoints): a hook leaving the breakend towards its side. */
export function loosePoints(x, y, side) {
  const s = side === "right" ? 1 : -1;
  return [
    [x, y],
    [x + s * 15, y - 5],
    [x + s * 5, y - 15],
  ];
}

/** d3 curveBasis as path operations (a port of d3-shape's basis curve): ["M", x, y] | ["L", x, y] | ["C", x1, y1, x2, y2, x, y]. */
export function basisOps(points) {
  const ops = [];
  let state = 0;
  let x0;
  let y0;
  let x1;
  let y1;
  const bez = (x, y) => ops.push(["C", (2 * x0 + x1) / 3, (2 * y0 + y1) / 3, (x0 + 2 * x1) / 3, (y0 + 2 * y1) / 3, (x0 + 4 * x1 + x) / 6, (y0 + 4 * y1 + y) / 6]);
  points.forEach(([x, y]) => {
    if (state === 0) {
      state = 1;
      ops.push(["M", x, y]);
    } else if (state === 1) {
      state = 2;
    } else {
      if (state === 2) {
        state = 3;
        ops.push(["L", (5 * x0 + x1) / 6, (5 * y0 + y1) / 6]);
      }
      bez(x, y);
    }
    x0 = x1;
    x1 = x;
    y0 = y1;
    y1 = y;
  });
  if (state === 3) bez(x1, y1);
  if (state >= 2) ops.push(["L", x1, y1]);
  return ops;
}

/** gOS genome-plot domains (global places) of the windows, from chromoBins ({ chr: { startPlace } }). */
export function windowsToDomains(chromoBins, wins) {
  return normWins(wins)
    .map((w) => {
      const b = chromoBins?.[w.chr];
      return b ? [b.startPlace + w.from, b.startPlace + w.to] : null;
    })
    .filter(Boolean);
}

/**
 * Genomic windows of the cell graph opened from a genome-axis region: the CN-heatmap zoom window when the region is
 * zoomed in place (zoom: { from, to }), else the part of the region seen through the lens (view: lensView, page pt;
 * one window per broken-axis piece), else null (not zoomed). rect: the row / track rectangle (default the region).
 */
export function focusWindows(region, { zoom = null, view = null, rect = region } = {}) {
  if (!region?.axis) return null;
  if (zoom && Number.isFinite(zoom.from) && Number.isFinite(zoom.to)) return [{ chr: chrOf(region.axis.chr), from: zoom.from, to: zoom.to }];
  if (!view) return null;
  const a = Math.max(rect.x, view.x0);
  const b = Math.min(rect.x + rect.w, view.x1);
  if (!(b > a)) return null;
  const ws = regionWindows(region, a, b).map(({ chr, from, to }) => ({ chr, from, to }));
  return ws.length ? ws : null;
}
