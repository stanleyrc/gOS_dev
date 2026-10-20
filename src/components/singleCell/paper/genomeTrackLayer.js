import React, { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { loadCellTrack } from "../../../redux/singleCell/loaders";
import { graphInWindow } from "../../../helpers/singleCell/paperZoom";

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
 * One cell's genome track redrawn live for the zoomed window, in the figure's place: coverage dots (CN units),
 * JaBbA segments and ALT junction arcs labelled with their junction copy number. Drawn when a figure panel is
 * zoomed past the PDF's own detail. box: { left, top, width, height } in display px (inside the lens);
 * win: { chr, from, to }; onGraph(cell, graph) reports the loaded graph (junction hover).
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
    const span = Math.max(1, win.to - win.from);
    const X = (pos) => ((pos - win.from) / span) * W;
    const g = data.graph ? graphInWindow(data.graph, win) : { segs: [], juncs: [] };
    // coverage in the window (x: global position -> chromosome position)
    const bin = chromoBins?.[`${win.chr}`];
    const pts = [];
    if (data.coverage && bin) {
      const xs = data.coverage.dataPointsX;
      const ys = data.coverage.dataPointsY1;
      const g0 = bin.startPlace + win.from;
      const g1 = bin.startPlace + win.to;
      for (let i = 0; i < xs.length; i += 1) if (xs[i] >= g0 && xs[i] <= g1) pts.push([xs[i] - bin.startPlace, ys[i]]);
    }
    const top = Math.max(4, ...g.segs.map((s) => s.cn), ...pts.map((p) => p[1]).sort((a, b) => a - b).slice(Math.floor(pts.length * 0.99)));
    const arcH = Math.min(H * 0.35, 40);
    const Y = (cn) => H - 4 - (Math.min(cn, top * 1.05) / (top * 1.05)) * (H - arcH - 8);
    ctx.fillStyle = "rgba(60,60,60,0.55)";
    pts.forEach(([p, cn]) => ctx.fillRect(X(p) - 0.6, Y(cn) - 0.6, 1.2, 1.2));
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 1.6;
    g.segs.forEach((s) => {
      ctx.beginPath();
      ctx.moveTo(Math.max(0, X(s.start)), Y(s.cn));
      ctx.lineTo(Math.min(W, X(s.end)), Y(s.cn));
      ctx.stroke();
    });
    ctx.font = "10px Helvetica, Arial, sans-serif";
    ctx.textAlign = "center";
    g.juncs.forEach((j) => {
      const xa = j.chrA === `${win.chr}` ? X(j.a) : null;
      const xb = j.chrB === `${win.chr}` ? X(j.b) : null;
      ctx.strokeStyle = "#D55E00";
      ctx.lineWidth = Math.max(0.8, Math.min(3, 0.6 + Math.log10(1 + (j.cn || 0))));
      ctx.beginPath();
      if (xa != null && xb != null) {
        const mid = (xa + xb) / 2;
        ctx.moveTo(xa, arcH);
        ctx.quadraticCurveTo(mid, 0, xb, arcH);
        ctx.stroke();
        if (Math.abs(xb - xa) > 30) {
          ctx.fillStyle = "#D55E00";
          ctx.fillText(`JCN ${j.cn}`, mid, 10);
        }
      } else {
        const x = xa ?? xb;
        ctx.moveTo(x, arcH);
        ctx.lineTo(x, 4);
        ctx.stroke();
      }
      [xa, xb].forEach((x) => {
        if (x == null) return;
        ctx.strokeStyle = "rgba(213,94,0,0.35)";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x, arcH);
        ctx.lineTo(x, H);
        ctx.stroke();
      });
    });
    ctx.fillStyle = "#555";
    ctx.textAlign = "left";
    ctx.fillText(`${cell} · chr${win.chr}:${(win.from / 1e6).toFixed(3)}–${(win.to / 1e6).toFixed(3)} Mb`, 4, H - 6);
  }, [data, box.width, box.height, win.chr, win.from, win.to, chromoBins, cell]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} className="sc-papertrack" style={{ position: "absolute", left: box.left, top: box.top, width: box.width, height: box.height, pointerEvents: "none" }} />;
}
