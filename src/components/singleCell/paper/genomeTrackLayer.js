import React, { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { loadCellTrack } from "../../../redux/singleCell/loaders";
import { basisOps, cnTicks, connectorPoints, lensGraph, lensYMax, loosePoints } from "../../../helpers/singleCell/paperCellGraph";

const cache = new Map(); // `${dataPath}|${cell}` -> Promise<{ graph, coverage }>

/** A cell's JaBbA graph (complex.json) and coverage (coverage.arrow, CN units), fetched once per page. */
export function loadCellGraph(dataset, cell, chromoBins) {
  const key = `${dataset?.dataPath}|${cell}`;
  if (!cache.has(key)) {
    const p = Promise.all([loadCellTrack(dataset, cell, "total", chromoBins), loadCellTrack(dataset, cell, "coverage", chromoBins)]).then(([g, c]) => ({
      graph: g.status === "ok" ? g.data : null,
      coverage: c.status === "ok" ? c.data : null,
    }));
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return cache.get(key);
}

/**
 * Miniature of one cell's genome graph for the zoomed window, in the figure's place (the full gOS genome plot of the
 * hovered cell opens below the row, see cellGraphLens.js): coverage dots (CN units) behind, a CN axis with ticks,
 * JaBbA intervals at CN, REF connectors, ALT connectors leaving each breakend towards its side with the genome view's
 * geometry (DEL / DUP / INV / TRA look different), loose ends, and JCN beside wide arcs. Everything is batched into a
 * few canvas paths, so hundreds of intervals in the window draw at once.
 * box: { left, top, width, height } in display px (inside the lens); win: { chr, from, to }; onGraph(cell, graph)
 * reports the loaded graph (junction hover).
 */
export default function GenomeTrackLayer({ cell, box, win, onGraph }) {
  const dataset = useSelector((s) => s.Settings?.dataset);
  const chromoBins = useSelector((s) => s.Settings?.chromoBins);
  const ref = useRef(null);
  const [data, setData] = useState(null);
  useEffect(() => {
    let live = true;
    loadCellGraph(dataset, cell, chromoBins).then((d) => {
      if (!live) return;
      setData(d);
      if (d?.graph) onGraph?.(cell, d.graph);
    });
    return () => {
      live = false;
    };
  }, [dataset, cell, chromoBins]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !data) return;
    const pr = window.devicePixelRatio || 1;
    const W = Math.max(1, Math.round(box.width));
    const H = Math.max(1, Math.round(box.height));
    cv.width = W * pr;
    cv.height = H * pr;
    const ctx = cv.getContext("2d");
    ctx.setTransform(pr, 0, 0, pr, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    const chr = `${win.chr}`.replace(/^chr/, "");
    const span = Math.max(1, win.to - win.from);
    const AX = 22; // CN axis gutter
    const X = (pos) => AX + ((pos - win.from) / span) * (W - AX);
    const g = data.graph ? lensGraph(data.graph, win) : { segs: [], refs: [], alts: [], loose: [] };
    // coverage in the window (x: global position -> chromosome position)
    const bin = chromoBins?.[chr];
    const pts = [];
    if (data.coverage && bin) {
      const xs = data.coverage.dataPointsX;
      const ys = data.coverage.dataPointsY1;
      const g0 = bin.startPlace + win.from;
      const g1 = bin.startPlace + win.to;
      for (let i = 0; i < xs.length; i += 1) if (xs[i] >= g0 && xs[i] <= g1) pts.push([xs[i] - bin.startPlace, ys[i]]);
    }
    const top = lensYMax(g.segs, pts.map((p) => p[1]), win);
    const padT = 14;
    const padB = 4;
    const Y = (cn) => H - padB - (Math.max(0, Math.min(cn, top)) / top) * (H - padT - padB);
    // axis
    ctx.font = "9px Helvetica, Arial, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "#e6e6e6";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#666";
    const ticks = cnTicks(top, H > 80 ? 4 : 2);
    ctx.beginPath();
    ticks.forEach((t) => {
      ctx.moveTo(AX, Math.round(Y(t)) + 0.5);
      ctx.lineTo(W, Math.round(Y(t)) + 0.5);
    });
    ctx.stroke();
    ticks.forEach((t) => ctx.fillText(`${t}`, AX - 3, Y(t)));
    ctx.strokeStyle = "#999";
    ctx.beginPath();
    ctx.moveTo(AX + 0.5, padT);
    ctx.lineTo(AX + 0.5, H - padB);
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.rect(AX, 0, W - AX, H);
    ctx.clip();
    // coverage
    ctx.fillStyle = "rgba(60,60,60,0.5)";
    pts.forEach(([p, cn]) => ctx.fillRect(X(p) - 0.6, Y(cn) - 0.6, 1.2, 1.2));
    // REF connectors (grey verticals between adjacent intervals)
    ctx.strokeStyle = "rgba(128,128,128,0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    g.refs.forEach((r) => {
      if (r.chr !== chr) return;
      ctx.moveTo(X(r.pos), Y(r.cnA));
      ctx.lineTo(X(r.pos), Y(r.cnB));
    });
    ctx.stroke();
    // intervals at CN
    const bar = Math.max(2, Math.min(6, H / 20));
    ctx.fillStyle = "#8c8c8c";
    ctx.strokeStyle = "#4d4d4d";
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    g.segs.forEach((s) => {
      const x0 = Math.max(AX, X(s.start));
      const x1 = Math.min(W, X(s.end));
      ctx.rect(x0, Y(s.cn) - bar / 2, Math.max(0.8, x1 - x0), bar);
    });
    ctx.fill();
    ctx.stroke();
    // ALT connectors (gOS geometry); an end off the window or on another chromosome draws as an anchor tick
    const trace = (ops) =>
      ops.forEach((o) => {
        if (o[0] === "M") ctx.moveTo(o[1], o[2]);
        else if (o[0] === "L") ctx.lineTo(o[1], o[2]);
        else ctx.bezierCurveTo(o[1], o[2], o[3], o[4], o[5], o[6]);
      });
    const inW = (e) => e.chr === chr && e.pos >= win.from && e.pos <= win.to;
    const labels = [];
    ctx.strokeStyle = "#e41a1c";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    g.alts.forEach((j) => {
      const ea = { x: X(j.a.pos), cn: j.a.cn, side: j.a.side };
      const eb = { x: X(j.b.pos), cn: j.b.cn, side: j.b.side };
      if (inW(j.a) && inW(j.b)) {
        const pts2 = connectorPoints(ea, eb, Y);
        trace(basisOps(pts2));
        if (Math.abs(eb.x - ea.x) > 36) labels.push([(ea.x + eb.x) / 2, Math.min(...pts2.map((q) => q[1])) - 2, j.cn]);
      } else {
        const e = inW(j.a) ? ea : eb;
        const s = e.side === "right" ? 1 : -1;
        ctx.moveTo(e.x, Y(e.cn));
        ctx.lineTo(e.x + s * 6, Y(e.cn) - 6);
        ctx.lineTo(e.x + s * 6, padT - 4);
        const far = inW(j.a) ? j.b : j.a;
        labels.push([e.x + s * 8, padT - 2, `JCN ${j.cn} → chr${far.chr}:${(far.pos / 1e6).toFixed(2)} Mb`]);
      }
    });
    ctx.stroke();
    // loose ends
    ctx.strokeStyle = "steelblue";
    ctx.setLineDash([3, 1]);
    ctx.beginPath();
    g.loose.forEach((l) => {
      if (l.chr !== chr) return;
      const lp = loosePoints(X(l.pos), Y(l.cn), l.side);
      trace(basisOps(lp));
    });
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    ctx.fillStyle = "#e41a1c";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    labels.forEach(([x, y, t]) => ctx.fillText(typeof t === "number" ? `JCN ${t}` : t, x, Math.max(9, y)));
    ctx.fillStyle = "#555";
    ctx.textAlign = "left";
    ctx.fillText(`${cell} · chr${chr}:${(win.from / 1e6).toFixed(3)}–${(win.to / 1e6).toFixed(3)} Mb · CN`, AX + 4, 10);
  }, [data, box.width, box.height, win.chr, win.from, win.to, chromoBins, cell]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} className="sc-papertrack" style={{ position: "absolute", left: box.left, top: box.top, width: box.width, height: box.height, pointerEvents: "none" }} />;
}
