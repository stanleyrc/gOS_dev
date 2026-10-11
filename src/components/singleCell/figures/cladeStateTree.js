import React, { useCallback, useMemo } from "react";
import FigureCanvas, { fitText } from "./figureCanvas";
import { textRole } from "./figureKit";
import useContainerWidth from "../useContainerWidth";
import { isNormalClone } from "../../../helpers/singleCell/figures";
import { ancestralBinary, pruneLayout } from "../../../helpers/singleCell/figureMath";
import { selectMode } from "./cellSelection";

const H = 250;
const PAD = { top: 18, bottom: 70, side: 26 };

/**
 * Fig 5F, live: the patient tree reduced to one leaf per clone, with the
 * focused variant's state per clade: carrier fraction, and a glyph from how
 * its copies spread across the clade's cells (a ring = variable copies,
 * ecDNA-like; a bar = uniform copies, integration-like, CV < 0.3). Internal
 * nodes show the ancestral presence of the variant. Click a clade to select it.
 */
export default function CladeStateTree({ treeLayout, order = [], cellById, cloneColors = {}, walk, onSelect, minCells = 3 }) {
  const [ref, measured] = useContainerWidth(500);
  const width = Math.max(300, measured);
  const clones = useMemo(() => {
    const by = new Map();
    order.forEach((id) => {
      const k = cellById?.get(id)?.clone_id;
      if (k == null || isNormalClone(k)) return;
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(id);
    });
    return [...by.entries()].filter(([, ids]) => ids.length >= minCells).map(([clone, ids]) => {
      const cn = ids.map((id) => Number(walk?.cells?.[id]) || 0);
      const car = cn.filter((v) => v >= 1);
      const mean = car.reduce((s, v) => s + v, 0) / Math.max(1, car.length);
      const sd = Math.sqrt(car.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, car.length - 1));
      return { clone, ids, frac: car.length / ids.length, cv: car.length > 2 ? sd / Math.max(1e-9, mean) : NaN, median: car.length ? car.slice().sort((a, b) => a - b)[Math.floor(car.length / 2)] : 0 };
    });
  }, [order, cellById, walk, minCells]);
  // one representative leaf per clone -> induced clone tree
  const tree = useMemo(() => {
    if (!treeLayout || !clones.length) return null;
    const rep = new Map(clones.map((c) => [c.ids[Math.floor(c.ids.length / 2)], c]));
    const t = pruneLayout(treeLayout, new Set(rep.keys()));
    if (!t) return null;
    const anc = ancestralBinary(t, (name) => (rep.get(name)?.frac ?? 0) >= 0.5);
    return { t, rep, anc };
  }, [treeLayout, clones]);

  const draw = useCallback(
    (ctx, c) => {
      if (!tree) return [];
      const { t, rep, anc } = tree;
      const nL = t.leaves.length;
      const x = (leafY) => PAD.side + ((leafY + 0.5) / Math.max(1, nL)) * (width - 2 * PAD.side);
      const maxD = Math.max(1e-9, t.maxX);
      const y = (d) => PAD.top + (d / maxD) * (H - PAD.top - PAD.bottom);
      // branches (root at the top)
      ctx.strokeStyle = c.dark ? "rgba(230,230,230,0.85)" : "rgba(40,40,40,0.85)";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      t.nodes.forEach((nd) => {
        if (nd.parent < 0) return;
        const p = t.nodes[nd.parent];
        ctx.moveTo(x(p.y), y(p.x));
        ctx.lineTo(x(nd.y), y(p.x));
        ctx.lineTo(x(nd.y), y(nd.x));
      });
      ctx.stroke();
      ctx.lineWidth = 1;
      const hits = [];
      // ancestral presence on internal nodes: open ring, opacity = probability
      t.nodes.forEach((nd, i) => {
        if (nd.isLeaf) return;
        const p = anc.p[i];
        if (!(p > 0.15)) return;
        ctx.globalAlpha = Math.min(1, 0.25 + p);
        ctx.strokeStyle = "#8e2430";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x(nd.y), y(nd.x), 6, 0, 2 * Math.PI);
        ctx.fillStyle = c.panel;
        ctx.fill();
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1;
        hits.push({ x0: x(nd.y) - 7, x1: x(nd.y) + 7, y0: y(nd.x) - 7, y1: y(nd.x) + 7, kind: "node", p });
      });
      // leaves: state glyph, clone colour block, labels
      t.nodes.forEach((nd) => {
        if (!nd.isLeaf) return;
        const cl = rep.get(nd.name);
        const cx = x(nd.y);
        const cy = H - PAD.bottom + 10;
        if (cl.frac >= 0.2) {
          const integrated = Number.isFinite(cl.cv) && cl.cv < 0.3;
          if (integrated) {
            ctx.fillStyle = "#9e9e9e";
            ctx.fillRect(cx - 12, cy - 3, 9, 6);
            ctx.fillStyle = "#d32f2f";
            ctx.fillRect(cx - 3, cy - 3, 6, 6);
            ctx.fillStyle = "#9e9e9e";
            ctx.fillRect(cx + 3, cy - 3, 9, 6);
          } else {
            ctx.strokeStyle = "#e53935";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(cx, cy, 6, 0, 2 * Math.PI);
            ctx.stroke();
            ctx.lineWidth = 1;
          }
        }
        ctx.fillStyle = cloneColors[cl.clone] || "#9e9e9e";
        ctx.fillRect(cx - 9, cy + 12, 18, 12);
        textRole(ctx, c, "tick", "text");
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(fitText(ctx, `${cl.clone}`.replace(/^clone[\s_-]*/i, ""), (width - 2 * PAD.side) / nL), cx, cy + 27);
        textRole(ctx, c, "caption");
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(`${Math.round(100 * cl.frac)}%`, cx, cy + 40);
        ctx.textBaseline = "middle";
        hits.push({ x0: cx - 14, x1: cx + 14, y0: cy - 10, y1: cy + 52, kind: "clade", cl });
      });
      return hits;
    },
    [tree, width, cloneColors]
  );
  if (!tree) return <div ref={ref} />;
  return (
    <div ref={ref}>
      <FigureCanvas
        width={width}
        height={H}
        draw={draw}
        ariaLabel="Clade tree with the focused amplicon's state per clade"
        tooltip={(h) =>
          h.kind === "clade"
            ? [`${h.cl.clone} · ${h.cl.ids.length} cells`, ["Carriers", `${Math.round(100 * h.cl.frac)}%`], ["Median copies", h.cl.median], ["Copy spread (CV)", Number.isFinite(h.cl.cv) ? h.cl.cv.toFixed(2) : "–"], ["Glyph", Number.isFinite(h.cl.cv) && h.cl.cv < 0.3 ? "uniform copies: integration-like" : "variable copies: ecDNA-like"], ["Click", "select the clade"]]
            : ["Ancestral node", ["Variant present", `${Math.round(100 * h.p)}%`]]
        }
        onClick={(h, event) => h.kind === "clade" && onSelect?.(h.cl.ids, { label: `${h.cl.clone}`, mode: selectMode(event) })}
      />
      <div className="sc-fig-keys">
        <span className="sc-fig-key"><span className="sc-fig-swatch" style={{ border: "2px solid #8e2430", borderRadius: 6, background: "transparent" }} />ecDNA (ancestral)</span>
        <span className="sc-fig-key"><span className="sc-fig-swatch" style={{ border: "2px solid #e53935", borderRadius: 6, background: "transparent" }} />ecDNA (observed, variable copies)</span>
        <span className="sc-fig-key"><span className="sc-fig-swatch" style={{ background: "linear-gradient(90deg,#9e9e9e 40%,#d32f2f 40%,#d32f2f 60%,#9e9e9e 60%)", width: 22 }} />integration-like (uniform copies)</span>
      </div>
    </div>
  );
}
