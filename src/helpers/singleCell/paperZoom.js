// Zoom of a figure panel in place (a "lens"): the exact SVG redrawn at a larger scale inside the panel's rectangle,
// with page <-> display mapping so hit regions follow the zoom; plus genome-graph helpers for live per-cell tracks
// (JaBbA segments and junctions in a window) and box selection of marks. d3-free.

export const LENS_MAX = 40;

/** New lens on a panel rectangle (page pt): scale 1, showing the rectangle from its top-left. */
export const lensOn = (rect) => ({ rect, s: 1, ox: rect.x, oy: rect.y });

/** Page pt -> display px (k = px per pt at scale 1). */
export function lensToDisplay(lens, k, x, y) {
  return [lens.rect.x * k + (x - lens.ox) * k * lens.s, lens.rect.y * k + (y - lens.oy) * k * lens.s];
}

/** Display px -> page pt. */
export function lensToPage(lens, k, px, py) {
  return [lens.ox + (px - lens.rect.x * k) / (k * lens.s), lens.oy + (py - lens.rect.y * k) / (k * lens.s)];
}

/** Whether a display point is inside the lens rectangle. */
export const lensContains = (lens, k, px, py) => px >= lens.rect.x * k && px <= (lens.rect.x + lens.rect.w) * k && py >= lens.rect.y * k && py <= (lens.rect.y + lens.rect.h) * k;

function clampLens(l) {
  const vw = l.rect.w / l.s;
  const vh = l.rect.h / l.s;
  return { ...l, ox: Math.max(l.rect.x, Math.min(l.rect.x + l.rect.w - vw, l.ox)), oy: Math.max(l.rect.y, Math.min(l.rect.y + l.rect.h - vh, l.oy)) };
}

/** Zoom by `factor` about a display point (the page point under it stays put); scale clamped to [1, LENS_MAX]. */
export function lensZoom(lens, k, factor, px, py) {
  const [x, y] = lensToPage(lens, k, px, py);
  const s = Math.min(LENS_MAX, Math.max(1, lens.s * factor));
  const ox = x - (px - lens.rect.x * k) / (k * s);
  const oy = y - (py - lens.rect.y * k) / (k * s);
  return clampLens({ ...lens, s, ox, oy });
}

/** Pan by display px. */
export const lensPan = (lens, k, dpx, dpy) => clampLens({ ...lens, ox: lens.ox - dpx / (k * lens.s), oy: lens.oy - dpy / (k * lens.s) });

/** The page window visible through the lens: { x0, x1, y0, y1 } (pt). */
export const lensView = (lens) => ({ x0: lens.ox, x1: lens.ox + lens.rect.w / lens.s, y0: lens.oy, y1: lens.oy + lens.rect.h / lens.s });

// ---- genome-graph tracks

const CELL_RX = /\b((?:BWH|MGH)\d{2,3}_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)+)\b/;
/** A cell id named in a region label ("Short-only cell BWH70_MR_1_pl1_7b: ..."), else null. */
export function cellFromLabel(label) {
  const m = CELL_RX.exec(`${label || ""}`);
  return m ? m[1] : null;
}

/**
 * Axis windows of a genome-axis region: `axis.windows` [{ chr, from, to, f0, f1 }] (f0 / f1: fractions of the region
 * width; broken axes such as chr2 14-16 Mb | chr2 33 Mb | chr12 57.5 Mb), else the single axis over the whole width.
 */
export function axisWindows(region) {
  const a = region.axis || {};
  if (Array.isArray(a.windows) && a.windows.length) return a.windows.map((w) => ({ chr: `${w.chr}`.replace(/^chr/, ""), from: Number(w.from), to: Number(w.to), f0: Number(w.f0), f1: Number(w.f1) }));
  return [{ chr: `${a.chr}`.replace(/^chr/, ""), from: Number(a.from), to: Number(a.to), f0: 0, f1: 1 }];
}

/**
 * Visible windows of a genome-axis region between page x0 and x1: [{ chr, from, to, x0, x1 }] (page pt), one per axis
 * window that overlaps.
 */
export function regionWindows(region, x0, x1) {
  return axisWindows(region)
    .map((w) => {
      const wx0 = region.x + w.f0 * region.w;
      const wx1 = region.x + w.f1 * region.w;
      const a = Math.max(x0, wx0);
      const b = Math.min(x1, wx1);
      if (!(b > a)) return null;
      const pos = (x) => Math.round(w.from + ((x - wx0) / (wx1 - wx0)) * (w.to - w.from));
      return { chr: w.chr, from: pos(a), to: pos(b), x0: a, x1: b };
    })
    .filter(Boolean);
}

/** The genomic window of a genome-axis region seen between page x0 and x1 (clamped to the region). */
export function regionWindow(region, x0, x1) {
  if (Array.isArray(region.axis?.windows) && region.axis.windows.length) {
    const ws = regionWindows(region, Math.min(x0, x1 - 1e-9), Math.max(x1, x0 + 1e-9));
    if (ws.length) return { chr: ws[0].chr, from: ws[0].from, to: ws[ws.length - 1].to };
  }
  const a = region.axis;
  const from = Number(a.from);
  const to = Number(a.to);
  const t0 = Math.max(0, Math.min(1, (x0 - region.x) / region.w));
  const t1 = Math.max(0, Math.min(1, (x1 - region.x) / region.w));
  return { chr: `${a.chr}`.replace(/^chr/, ""), from: Math.round(from + t0 * (to - from)), to: Math.round(from + t1 * (to - from)) };
}

/**
 * Segments and junctions of a JaBbA graph (gOS complex.json) in a window: segments [{ start, end, cn }] overlapping it,
 * junctions [{ id, a, b, chrA, chrB, cn, type }] with at least one breakpoint in it (a / b in bp; the other end may be off-window).
 * Breakpoint side: a positive interval id means its right end for the source and its left end for the sink.
 */
export function graphInWindow(graph, win) {
  const chr = `${win.chr}`.replace(/^chr/, "");
  const iv = new Map((graph?.intervals || []).map((i) => [Math.abs(Number(i.iid)), i]));
  const segs = (graph?.intervals || [])
    .filter((i) => `${i.chromosome}`.replace(/^chr/, "") === chr && Number(i.endPoint) >= win.from && Number(i.startPoint) <= win.to)
    .map((i) => ({ start: Number(i.startPoint), end: Number(i.endPoint), cn: Number(i.y) }));
  const side = (id, isSource) => {
    const i = iv.get(Math.abs(Number(id)));
    if (!i) return null;
    const right = (Number(id) > 0) === isSource;
    return { chr: `${i.chromosome}`.replace(/^chr/, ""), pos: Number(right ? i.endPoint : i.startPoint) };
  };
  const inWin = (p) => p && p.chr === chr && p.pos >= win.from && p.pos <= win.to;
  const juncs = (graph?.connections || [])
    .filter((c) => `${c.type || ""}`.toUpperCase() === "ALT")
    .map((c) => {
      const a = side(c.source, true);
      const b = side(c.sink, false);
      return a && b ? { id: c.cid, a: a.pos, chrA: a.chr, b: b.pos, chrB: b.chr, cn: Number(c.weight), type: c.title || "" } : null;
    })
    .filter((j) => j && (inWin({ chr: j.chrA, pos: j.a }) || inWin({ chr: j.chrB, pos: j.b })));
  return { segs, juncs };
}

/** The junction with a breakpoint nearest to `pos` (bp) on chromosome `chr`, within `tol` bp, else null. */
export function nearestJunction(juncs, chr, pos, tol) {
  let best = null;
  const c = `${chr}`.replace(/^chr/, "");
  juncs.forEach((j) => {
    [[j.chrA, j.a], [j.chrB, j.b]].forEach(([cc, p]) => {
      const d = Math.abs(p - pos);
      if (cc === c && d <= tol && (!best || d < best.d)) best = { d, j };
    });
  });
  return best ? best.j : null;
}

// ---- box selection of marks

/** Cell ids of point marks inside a page box, and of rect marks whose centre is inside it, over every plot region. */
export function marksInBox(sidecar, x0, y0, x1, y1, toPage) {
  const [bx0, bx1] = [Math.min(x0, x1), Math.max(x0, x1)];
  const [by0, by1] = [Math.min(y0, y1), Math.max(y0, y1)];
  const out = new Map(); // cell -> patient
  (sidecar?.regions || []).forEach((r) => {
    if (r.kind !== "plot" || !r.xscale || !r.yscale) return;
    if (r.x > bx1 || r.x + r.w < bx0 || r.y > by1 || r.y + r.h < by0) return;
    r.marks.forEach((m) => {
      const cells = m.fields.cell || m.fields.cell_id;
      if (!cells) return;
      const pats = m.fields.patient;
      const n = m.type === "points" ? m.x.length : m.xmin.length;
      for (let i = 0; i < n; i += 1) {
        const [dx, dy] = m.type === "points" ? [m.x[i], m.y[i]] : [(m.xmin[i] + m.xmax[i]) / 2, (m.ymin[i] + m.ymax[i]) / 2];
        const [px, py] = toPage(r, dx, dy);
        if (px >= bx0 && px <= bx1 && py >= by0 && py <= by1) {
          const id = `${cells.length === 1 ? cells[0] : cells[i]}`;
          out.set(id, pats ? `${pats.length === 1 ? pats[0] : pats[i]}` : r.patient || null);
        }
      }
    });
  });
  return out;
}

// ---- SNV / VAF heatmaps (rows = cells, columns = the figure's site ids in drawn order)

/** snv_matrix.json -> { index: Map(site -> variant index), gene: [..], reads: Map(cell -> Map(variant index -> [ref, alt])) } */
export function snvLookup(json) {
  if (!json || !Array.isArray(json.variants) || !json.cells) return null;
  const index = new Map(json.variants.map((v, i) => [`${v.id}`.replace(/^chr/, ""), i]));
  const gene = json.variants.map((v) => v.gene || "");
  const reads = new Map();
  Object.entries(json.cells).forEach(([cell, list]) => {
    const m = new Map();
    (list || []).forEach((e) => m.set(Number(e[0]), [Number(e[1]) || 0, Number(e[2]) || 0]));
    reads.set(`${cell}`, m);
  });
  return { index, gene, reads };
}

/** Reads of one cell at one site id: { ref, alt, vaf, gene } (vaf null without reads), or null when the site is unknown. */
export function snvAt(lookup, cell, site) {
  const vi = lookup?.index.get(`${site}`.replace(/^chr/, ""));
  if (vi == null) return null;
  const r = lookup.reads.get(`${cell}`)?.get(vi);
  const depth = r ? r[0] + r[1] : 0;
  return { ref: r ? r[0] : 0, alt: r ? r[1] : 0, vaf: depth > 0 ? r[1] / depth : null, gene: lookup.gene[vi] || "" };
}

/** Index of the column under a page x in a region with `cols.ids` (columns evenly over the width), or -1. */
export function colIndexAt(region, x) {
  const n = region.cols?.ids?.length || 0;
  if (!n || x < region.x || x >= region.x + region.w) return -1;
  return Math.min(n - 1, Math.floor(((x - region.x) / region.w) * n));
}
