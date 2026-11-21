// Canvas drawing for the track browser (header: ruler, genes, junctions; body: tree + stacked unit rows).
import { bpLabel, bpTicks, bpToPx, formatWindow, toGlobal } from "../../../helpers/singleCell/trackBrowser/locus";
import { coverageColumns, graphInWindows } from "../../../helpers/singleCell/trackBrowser/trackData";
import { cnFrac, cnTicks } from "../../../helpers/singleCell/trackBrowser/scales";
import { expectedDepth, foregroundFromCn, unitFit } from "../../../helpers/singleCell/trackBrowser/coverageAxes";

export const CLASS_COLORS = { "DUP-like": "#1f77b4", "DEL-like": "#d62728", "INV-like": "#2ca02c", "TRA-like": "#9467bd" };
export const altColor = (title) => CLASS_COLORS[title] || "#e6550d";
export const COLORS = { ink: "#222", muted: "#777", grid: "#e6e6e6", cov: "#4d4d4d", covBand: "rgba(90,90,90,0.25)", seg: "#c0392b", node: "#111", sel: "#f39c12", band: "#fafafa" };

export function setupCanvas(canvas, width, height) {
  if (!canvas) return null;
  const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return ctx;
}

const text = (ctx, s, x, y, { color = COLORS.ink, size = 10, align = "left", baseline = "middle", weight = "" } = {}) => {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(s, x, y);
};

/** Arc between two canvas points peaking at yPeak; returns sample points for hit testing. */
function arc(ctx, xa, ya, xb, yb, yPeak, color, width = 1.2) {
  const cx = (xa + xb) / 2;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(xa, ya);
  ctx.quadraticCurveTo(cx, 2 * yPeak - (ya + yb) / 2, xb, yb);
  ctx.stroke();
  const pts = [];
  const n = Math.max(20, Math.ceil((Math.abs(xb - xa) + Math.abs(yPeak - ya) * 2) / 3));
  const qy = 2 * yPeak - (ya + yb) / 2;
  for (let k = 0; k <= n; k += 1) {
    const t = k / n;
    pts.push([(1 - t) ** 2 * xa + 2 * (1 - t) * t * cx + t * t * xb, (1 - t) ** 2 * ya + 2 * (1 - t) * t * qy + t * t * yb]);
  }
  return pts;
}

function stub(ctx, x, y0, y1, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.moveTo(x, y0);
  ctx.lineTo(x, y1);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - 3, y1 + 3);
  ctx.lineTo(x, y1 - 1);
  ctx.lineTo(x + 3, y1 + 3);
  ctx.fill();
  const pts = [];
  for (let yy = Math.min(y0, y1); yy <= Math.max(y0, y1); yy += 3) pts.push([x, yy]);
  return pts;
}

/** Ruler: one box per window with bp ticks and the window's locus. */
export function drawRuler(ctx, slots, left, y, h) {
  slots.forEach((s) => {
    const x0 = left + s.x0;
    ctx.fillStyle = COLORS.band;
    ctx.fillRect(x0, y, s.width, h);
    ctx.strokeStyle = "#bbb";
    ctx.strokeRect(x0 + 0.5, y + 0.5, s.width - 1, h - 1);
    text(ctx, formatWindow(s.window), x0 + 4, y + 8, { weight: "600" });
    const span = s.window.end - s.window.start;
    bpTicks(s.window, Math.max(2, Math.floor(s.width / 90))).forEach((v) => {
      const x = x0 + bpToPx(s, v);
      ctx.strokeStyle = "#999";
      ctx.beginPath();
      ctx.moveTo(x, y + h - 6);
      ctx.lineTo(x, y + h);
      ctx.stroke();
      text(ctx, bpLabel(v, span), x, y + h - 11, { color: COLORS.muted, size: 9, align: "center" });
    });
  });
}

/** Genes (type "gene") overlapping each window, heaviest first, labels placed greedily without overlap. */
export function drawGenes(ctx, slots, genes, chromoBins, left, y, h, highlight = []) {
  if (!genes || !genes.geneTypes || !genes.geneTypes.length) {
    text(ctx, "genes: loading", left + 4, y + h / 2, { color: COLORS.muted });
    return;
  }
  const hl = new Set(highlight.map((g) => `${g}`.toUpperCase()));
  slots.forEach((s) => {
    const g0 = toGlobal(chromoBins, s.window.chrom, s.window.start);
    const g1 = toGlobal(chromoBins, s.window.chrom, s.window.end);
    const span = g1 - g0;
    const hits = [];
    const { geneTypes, genesStartPoint, genesEndPoint, geneTitles, genesWeight } = genes;
    for (let i = 0; i < geneTypes.length; i += 1) {
      if (geneTypes[i] !== "gene") continue;
      if (genesEndPoint[i] < g0 || genesStartPoint[i] > g1) continue;
      hits.push(i);
    }
    hits.sort((a, b) => (hl.has(`${geneTitles[b]}`.toUpperCase()) - hl.has(`${geneTitles[a]}`.toUpperCase())) || (genesWeight?.[b] || 0) - (genesWeight?.[a] || 0));
    const taken = [];
    const x0 = left + s.x0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y, s.width, h);
    ctx.clip();
    hits.slice(0, 600).forEach((i) => {
      const a = x0 + ((genesStartPoint[i] - g0) / span) * s.width;
      const b = x0 + ((genesEndPoint[i] - g0) / span) * s.width;
      const special = hl.has(`${geneTitles[i]}`.toUpperCase());
      ctx.fillStyle = special ? "#b03060" : "#5b7fa6";
      ctx.fillRect(a, y + h - 9, Math.max(1, b - a), 5);
      const label = `${geneTitles[i]}`;
      ctx.font = `${special ? "600" : ""} 9px system-ui, sans-serif`;
      const lw = ctx.measureText(label).width + 4;
      const lx = Math.max(x0, Math.min(x0 + s.width - lw, (a + b) / 2 - lw / 2));
      if (taken.some(([p, q]) => lx < q && lx + lw > p)) return;
      taken.push([lx, lx + lw]);
      text(ctx, label, lx + 2, y + h - 16, { size: 9, color: special ? "#b03060" : "#334", weight: special ? "600" : "" });
    });
    ctx.restore();
  });
}

/**
 * Patient-level junction arcs (junctions_table.json), height by supporting cells. Returns hit records
 * [{ kind: "junction", junction, pts }].
 */
export function drawJunctions(ctx, slots, junctions, left, y, h, maxCells) {
  const hits = [];
  const where = (chrom, pos) => slots.findIndex((s) => s.window.chrom === chrom && pos >= s.window.start && pos <= s.window.end);
  const px = (k, pos) => left + slots[k].x0 + bpToPx(slots[k], pos);
  const base = y + h - 2;
  ctx.strokeStyle = "#ccc";
  slots.forEach((s) => {
    ctx.beginPath();
    ctx.moveTo(left + s.x0, base + 0.5);
    ctx.lineTo(left + s.x0 + s.width, base + 0.5);
    ctx.stroke();
  });
  (junctions || []).forEach((j) => {
    const ka = where(j.a.chrom, j.a.pos);
    const kb = where(j.b.chrom, j.b.pos);
    if (ka < 0 && kb < 0) return;
    const frac = Math.min(1, j.nCells / Math.max(1, maxCells));
    const peak = base - 4 - frac * (h - 10);
    const color = altColor(j.cls);
    let pts;
    if (ka >= 0 && kb >= 0) pts = arc(ctx, px(ka, j.a.pos), base, px(kb, j.b.pos), base, peak, color, 1 + 1.5 * frac);
    else {
      const [k, e] = ka >= 0 ? [ka, j.a] : [kb, j.b];
      pts = stub(ctx, px(k, e.pos), base, peak, color);
    }
    hits.push({ kind: "junction", junction: j, pts });
  });
  return hits;
}

/** Tree at the left: elbow edges, leaves at their row centers. Returns node positions for hit testing. */
export function drawTree(ctx, layout, rowCenterOf, width, scrollTop, viewH, groupColorOf) {
  if (!layout) return [];
  const { nodes, maxX } = layout;
  const sx = (x) => 6 + (maxX > 0 ? (x / maxX) * (width - 14) : 0);
  const yOf = (n) => {
    if (n.isLeaf) return rowCenterOf(n.name) - scrollTop;
    return null;
  };
  const ys = new Map();
  for (let k = nodes.length - 1; k >= 0; k -= 1) {
    const n = nodes[k];
    if (n.isLeaf) ys.set(n.id, yOf(n));
    else {
      const kids = n.children.map((c) => ys.get(c)).filter((v) => v != null);
      ys.set(n.id, kids.length ? (Math.min(...kids) + Math.max(...kids)) / 2 : null);
    }
  }
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 1;
  const out = [];
  nodes.forEach((n) => {
    const y = ys.get(n.id);
    if (y == null) return;
    const x = sx(n.x);
    if (!n.isLeaf) {
      const kids = n.children.map((c) => ys.get(c)).filter((v) => v != null);
      const lo = Math.min(...kids);
      const hi = Math.max(...kids);
      if (hi < -20 || lo > viewH + 20) return;
      ctx.beginPath();
      ctx.moveTo(x, lo);
      ctx.lineTo(x, hi);
      ctx.stroke();
      n.children.forEach((c) => {
        const cy = ys.get(c);
        if (cy == null || cy < -20 || cy > viewH + 20) return;
        ctx.beginPath();
        ctx.moveTo(x, cy);
        ctx.lineTo(sx(nodes[c].x), cy);
        ctx.stroke();
      });
      out.push({ id: n.id, x, y });
    } else if (y > -10 && y < viewH + 10) {
      ctx.fillStyle = groupColorOf(n.name) || "#888";
      ctx.fillRect(sx(n.x), y - 2, width - sx(n.x), 4);
    }
  });
  return out;
}

/**
 * One unit row: graph sub-row (segments at CN, ALT arcs) and coverage sub-row (two axes). Returns hit records.
 * opts: { unit, top, left, slots, chromoBins, graph, coverage, showGraph, graphH, showCov, covH, cnMax, scale, axisL, axisR, trackRight }
 */
export function drawUnitRow(ctx, o) {
  const hits = [];
  const { unit, top, left, slots, chromoBins, graph, coverage, cnMax, scale } = o;
  const g = graph ? graphInWindows(graph, slots) : null;
  const px = (k, pos) => left + slots[k].x0 + bpToPx(slots[k], pos);
  let y = top;
  const yIn = (cn, y0, hh) => y0 + hh - 2 - cnFrac(cn, cnMax, scale) * (hh - 6);
  const frame = (y0, hh) => {
    slots.forEach((s) => {
      ctx.fillStyle = "#fff";
      ctx.fillRect(left + s.x0, y0, s.width, hh);
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(left + s.x0, y0 + hh - 0.5);
      ctx.lineTo(left + s.x0 + s.width, y0 + hh - 0.5);
      ctx.stroke();
      const two = yIn(2, y0, hh);
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(left + s.x0, two);
      ctx.lineTo(left + s.x0 + s.width, two);
      ctx.stroke();
      ctx.setLineDash([]);
    });
  };
  const clip = (y0, hh, fn) => {
    ctx.save();
    ctx.beginPath();
    slots.forEach((s) => ctx.rect(left + s.x0, y0 - 1, s.width, hh + 1));
    ctx.clip();
    fn();
    ctx.restore();
  };
  const segmentsLine = (y0, hh, color, width) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    g.segments.forEach((sg) => {
      const yy = yIn(sg.cn, y0, hh);
      ctx.beginPath();
      ctx.moveTo(px(sg.slot, sg.start), yy);
      ctx.lineTo(Math.max(px(sg.slot, sg.start) + 1, px(sg.slot, sg.end)), yy);
      ctx.stroke();
    });
  };
  if (o.showGraph) {
    const hh = o.graphH;
    frame(y, hh);
    if (!graph) text(ctx, o.graphStatus === "missing" ? "graph not available (no complex.json)" : "graph: loading", left + 4, y + hh / 2, { color: COLORS.muted, size: 9 });
    else
      clip(y, hh, () => {
        segmentsLine(y, hh, COLORS.node, 2);
        g.alts.forEach((a) => {
          const color = altColor(a.title);
          const ya = yIn(a.a.cn, y, hh);
          const yb = yIn(a.b.cn, y, hh);
          let pts;
          if (a.a.slot >= 0 && a.b.slot >= 0) pts = arc(ctx, px(a.a.slot, a.a.pos), ya, px(a.b.slot, a.b.pos), yb, y + 2, color, 1.2);
          else {
            const e = a.a.slot >= 0 ? a.a : a.b;
            pts = stub(ctx, px(e.slot, e.pos), e === a.a ? ya : yb, y + 3, color);
          }
          hits.push({ kind: "alt", unit, alt: a, pts });
        });
      });
    y += hh;
  }
  if (o.showCov) {
    const hh = o.covH;
    frame(y, hh);
    const fit = unitFit(unit);
    if (!coverage) text(ctx, o.covStatus === "missing" ? "coverage not available (no coverage.arrow)" : "coverage: loading", left + 4, y + hh / 2, { color: COLORS.muted, size: 9 });
    else
      clip(y, hh, () => {
        slots.forEach((s) => {
          const { columns, binned } = coverageColumns(coverage.x, coverage.y, s, chromoBins, coverage.binWidth);
          const x0 = left + s.x0;
          columns.forEach((c) => {
            if (binned) {
              ctx.fillStyle = COLORS.covBand;
              const a = yIn(c.max, y, hh);
              const b = yIn(c.min, y, hh);
              ctx.fillRect(x0 + c.px, a, Math.max(1, c.w), Math.max(1, b - a));
            }
            ctx.fillStyle = COLORS.cov;
            ctx.fillRect(x0 + c.px, yIn(c.mean, y, hh) - 0.75, Math.max(1.2, binned ? c.w : Math.min(c.w, 3)), 1.5);
          });
        });
        if (g) segmentsLine(y, hh, COLORS.seg, 1.2);
      });
    // axes: CN (left, shared scale) and expected depth (right, this unit's mean depth)
    const ticks = cnTicks(cnMax, scale, hh >= 40 ? 3 : 2);
    const xl = left - 3;
    const xr = o.trackRight + 3;
    ticks.forEach((cn) => {
      const yy = yIn(cn, y, hh);
      text(ctx, `${cn}`, xl, yy, { size: 8, color: COLORS.muted, align: "right" });
      if (fit.ploidy != null && fit.meanDepth != null) {
        const d = expectedDepth(foregroundFromCn(cn, fit.purity, fit.ploidy), fit.meanDepth);
        text(ctx, d >= 100 ? d.toFixed(0) : d.toFixed(1), xr, yy, { size: 8, color: "#2b6cb0", align: "left" });
      }
    });
    if (fit.meanDepth == null || fit.ploidy == null) text(ctx, "n/a", xr, y + hh / 2, { size: 8, color: COLORS.muted });
    y += hh;
  }
  return hits;
}

/** Nearest hit record within `tol` px of (x, y). */
export function hitTest(hits, x, y, tol = 4) {
  let best = null;
  let bestD = tol * tol;
  (hits || []).forEach((h) => {
    (h.pts || []).forEach(([px, py]) => {
      const d = (px - x) ** 2 + (py - y) ** 2;
      if (d <= bestD) {
        bestD = d;
        best = h;
      }
    });
  });
  return best;
}
