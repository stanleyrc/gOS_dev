import React, { useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import useContainerWidth from "../useContainerWidth";
import { INK, TYPE } from "../../../helpers/singleCell/plotTheme";

export const COLOR_UP = "#C2185B";
export const COLOR_DOWN = "#1F5FA8";
const COLOR_NS = "#C9CED6";
const M = { top: 28, right: 24, bottom: 46, left: 56 };
const N_LABELS = 8;
const MAX_SELECTED_LABELS = 25;

function insidePolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Volcano plot of a DE result: log2 fold change vs -log10 p, dashed lines at
 * the fold-change and q thresholds, top genes labelled on each side.
 * Click a point to pick that gene; Shift/Cmd-click adds or removes it; drag
 * on empty space to lasso genes (Shift/Cmd adds to the current pick).
 */
export default function VolcanoPlot({ genes, labels, qCut, lfcCut, selectedGene, selectedGenes = [], onGene, onSelectGenes }) {
  const [ref, width] = useContainerWidth(700);
  const [hover, setHover] = useState(null);
  const [lasso, setLasso] = useState(null);
  const svgRef = useRef(null);
  const drag = useRef(null);
  // Roughly 3:2, so the plot isn't flattened on wide screens.
  const HEIGHT = Math.round(Math.min(720, Math.max(480, width * 0.68)));
  const plotW = Math.max(200, width - M.left - M.right);
  const plotH = HEIGHT - M.top - M.bottom;
  const picked = useMemo(() => new Set(selectedGenes), [selectedGenes]);

  const points = useMemo(
    () =>
      genes.map((g) => ({
        gene: g.gene,
        x: g.avg_log2FC,
        y: -Math.log10(Math.max(g.p_val, 1e-300)),
        sig: g.q_val < qCut && Math.abs(g.avg_log2FC) >= lfcCut,
      })),
    [genes, qCut, lfcCut]
  );
  const xMax = Math.max(1, d3.max(points, (p) => Math.abs(p.x)) || 1) * 1.08;
  const yMax = Math.max(2, d3.max(points, (p) => p.y) || 1) * 1.08;
  const x = d3.scaleLinear().domain([-xMax, xMax]).range([M.left, M.left + plotW]).nice();
  const y = d3.scaleLinear().domain([0, yMax]).range([M.top + plotH, M.top]).nice();
  // p at the q threshold: the largest p among genes passing q.
  const pAtQ = d3.max(genes.filter((g) => g.q_val < qCut), (g) => g.p_val);

  const labelled = useMemo(() => {
    const top = (sign) =>
      points
        .filter((p) => p.sig && Math.sign(p.x) === sign)
        .sort((a, b) => b.y - a.y || Math.abs(b.x) - Math.abs(a.x))
        .slice(0, N_LABELS);
    const chosen = picked.size && picked.size <= MAX_SELECTED_LABELS ? points.filter((p) => picked.has(p.gene)) : [];
    const byGene = new Map();
    [...top(1), ...top(-1), ...chosen].forEach((p) => byGene.set(p.gene, p));
    // Greedy placement: push labels down so they never overlap on one side.
    const place = (list, side) => {
      const out = [];
      list
        .map((p) => ({ ...p, px: x(p.x), py: y(p.y) }))
        .sort((a, b) => a.py - b.py)
        .forEach((p) => {
          let ly = p.py - 8;
          out.forEach((o) => {
            if (Math.abs(o.ly - ly) < 12) ly = o.ly + 12;
          });
          out.push({ ...p, ly, lx: p.px + (side > 0 ? 6 : -6), anchor: side > 0 ? "start" : "end" });
        });
      return out;
    };
    const all = [...byGene.values()];
    return [...place(all.filter((p) => p.x >= 0), 1), ...place(all.filter((p) => p.x < 0), -1)];
  }, [points, picked, x, y]);

  const colour = (p) => (!p.sig ? COLOR_NS : p.x > 0 ? COLOR_UP : COLOR_DOWN);
  const ns = points.filter((p) => !p.sig && !picked.has(p.gene));
  const sig = points.filter((p) => p.sig && !picked.has(p.gene));
  const chosenPts = points.filter((p) => picked.has(p.gene));
  const focus = points.find((p) => p.gene === (hover?.gene || selectedGene));
  const focusLabelled = focus && labelled.some((l) => l.gene === focus.gene);

  const multi = (e) => e.shiftKey || e.metaKey || e.ctrlKey;
  const clickPoint = (p, e) => {
    e.stopPropagation();
    if (multi(e)) {
      onSelectGenes(picked.has(p.gene) ? selectedGenes.filter((g) => g !== p.gene) : [...selectedGenes, p.gene]);
    } else {
      onSelectGenes([p.gene]);
      onGene(p.gene);
    }
  };
  const local = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    drag.current = { path: [local(e)], moved: false, additive: multi(e) };
  };
  const onMouseMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const pt = local(e);
    const [x0, y0] = d.path[0];
    if (!d.moved && Math.hypot(pt[0] - x0, pt[1] - y0) < 4) return;
    d.moved = true;
    d.path.push(pt);
    setLasso([...d.path]);
  };
  const onMouseUp = () => {
    const d = drag.current;
    drag.current = null;
    setLasso(null);
    if (!d || !d.moved || d.path.length < 3) return;
    const inside = points.filter((p) => insidePolygon(x(p.x), y(p.y), d.path)).map((p) => p.gene);
    onSelectGenes(d.additive ? [...new Set([...selectedGenes, ...inside])] : inside);
  };

  return (
    <div ref={ref} style={{ width: "100%", position: "relative", userSelect: "none" }}>
      <svg
        ref={svgRef}
        width={width}
        height={HEIGHT}
        role="img"
        aria-label="Volcano plot"
        style={{ fontFamily: "inherit", cursor: lasso ? "crosshair" : "default" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <rect x={M.left} y={M.top} width={plotW} height={plotH} fill="#FCFCFD" stroke={INK.grid} />
        {x.ticks(8).map((tk) => (
          <g key={`x${tk}`}>
            <line x1={x(tk)} x2={x(tk)} y1={M.top} y2={M.top + plotH} stroke={INK.grid} />
            <text x={x(tk)} y={M.top + plotH + 16} textAnchor="middle" fontSize={TYPE.tick} fill={INK.muted}>
              {tk}
            </text>
          </g>
        ))}
        {y.ticks(6).map((tk) => (
          <g key={`y${tk}`}>
            <line x1={M.left} x2={M.left + plotW} y1={y(tk)} y2={y(tk)} stroke={INK.grid} />
            <text x={M.left - 8} y={y(tk) + 4} textAnchor="end" fontSize={TYPE.tick} fill={INK.muted}>
              {tk}
            </text>
          </g>
        ))}
        {[-lfcCut, lfcCut].map((v) => (
          <line key={v} x1={x(v)} x2={x(v)} y1={M.top} y2={M.top + plotH} stroke={INK.axis} strokeDasharray="4 4" />
        ))}
        {pAtQ != null && (
          <g>
            <line x1={M.left} x2={M.left + plotW} y1={y(-Math.log10(pAtQ))} y2={y(-Math.log10(pAtQ))} stroke={INK.axis} strokeDasharray="4 4" />
            <text x={M.left + plotW - 4} y={y(-Math.log10(pAtQ)) - 4} textAnchor="end" fontSize={11} fill={INK.muted}>
              {`q = ${qCut}`}
            </text>
          </g>
        )}
        <text x={M.left + 6} y={M.top - 10} fontSize={TYPE.label} fill={COLOR_DOWN} fontWeight="600">
          {`← higher in ${labels.B}`}
        </text>
        <text x={M.left + plotW - 6} y={M.top - 10} fontSize={TYPE.label} fill={COLOR_UP} fontWeight="600" textAnchor="end">
          {`higher in ${labels.A} →`}
        </text>
        {ns.map((p) => (
          <circle key={p.gene} cx={x(p.x)} cy={y(p.y)} r={2} fill={COLOR_NS} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => clickPoint(p, e)} />
        ))}
        {sig.map((p) => (
          <circle
            key={p.gene}
            cx={x(p.x)}
            cy={y(p.y)}
            r={3.2}
            fill={colour(p)}
            fillOpacity={0.8}
            style={{ cursor: "pointer" }}
            onMouseEnter={() => setHover(p)}
            onMouseLeave={() => setHover(null)}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => clickPoint(p, e)}
          />
        ))}
        {chosenPts.map((p) => (
          <circle
            key={`c${p.gene}`}
            cx={x(p.x)}
            cy={y(p.y)}
            r={4.5}
            fill={colour(p) === COLOR_NS ? "#8C8C8C" : colour(p)}
            stroke="#141414"
            strokeWidth={1.5}
            style={{ cursor: "pointer" }}
            onMouseEnter={() => setHover(p)}
            onMouseLeave={() => setHover(null)}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => clickPoint(p, e)}
          />
        ))}
        {labelled.map((p) => (
          <g key={`l${p.gene}`} style={{ cursor: "pointer" }} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => clickPoint(p, e)}>
            <line x1={p.px} y1={p.py} x2={p.lx} y2={p.ly - 3} stroke={INK.axis} />
            <text
              x={p.lx}
              y={p.ly}
              textAnchor={p.anchor}
              fontSize={TYPE.tick}
              fontWeight={picked.has(p.gene) ? 700 : 400}
              fill={INK.text}
              stroke={INK.panel}
              strokeWidth="3"
              paintOrder="stroke"
            >
              {p.gene}
            </text>
          </g>
        ))}
        {focus && (
          <g pointerEvents="none">
            <circle cx={x(focus.x)} cy={y(focus.y)} r={7} fill="none" stroke={INK.hover} strokeWidth={2} />
            {!focusLabelled && (
              <text x={x(focus.x)} y={y(focus.y) - 11} textAnchor="middle" fontSize={TYPE.label} fontWeight="600" fill="#FA541C" stroke={INK.panel} strokeWidth="3" paintOrder="stroke">
                {`${focus.gene}  log2FC ${focus.x.toFixed(2)}`}
              </text>
            )}
          </g>
        )}
        {lasso && lasso.length > 1 && (
          <path
            d={`M${lasso.map((pt) => pt.join(",")).join("L")}Z`}
            fill="rgba(22,119,255,0.08)"
            stroke={INK.select}
            strokeDasharray="4 3"
            pointerEvents="none"
          />
        )}
        <text x={M.left + plotW / 2} y={HEIGHT - 8} textAnchor="middle" fontSize={TYPE.label} fill={INK.textSecondary}>
          log2 fold change
        </text>
        <text transform={`translate(16 ${M.top + plotH / 2}) rotate(-90)`} textAnchor="middle" fontSize={TYPE.label} fill={INK.textSecondary}>
          −log10 p
        </text>
      </svg>
    </div>
  );
}
