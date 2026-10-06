import React, { useMemo, useState } from "react";
import * as d3 from "d3";
import useContainerWidth from "../useContainerWidth";

export const COLOR_UP = "#C2185B";
export const COLOR_DOWN = "#1F5FA8";
const COLOR_NS = "#C9CED6";
const M = { top: 28, right: 24, bottom: 46, left: 56 };
const N_LABELS = 8;

/**
 * Volcano plot of a DE result: log2 fold change vs -log10 p, dashed lines at
 * the fold-change and q thresholds, top genes labelled on each side (placed
 * to avoid overlaps), hover and click on any point.
 */
export default function VolcanoPlot({ genes, labels, qCut, lfcCut, selectedGene, onGene }) {
  const [ref, width] = useContainerWidth(700);
  const [hover, setHover] = useState(null);
  // Roughly 3:2, so the plot isn't flattened on wide screens.
  const HEIGHT = Math.round(Math.min(720, Math.max(480, width * 0.68)));
  const plotW = Math.max(200, width - M.left - M.right);
  const plotH = HEIGHT - M.top - M.bottom;

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
    const pick = (sign) =>
      points
        .filter((p) => p.sig && Math.sign(p.x) === sign)
        .sort((a, b) => b.y - a.y || Math.abs(b.x) - Math.abs(a.x))
        .slice(0, N_LABELS);
    // Greedy placement: push labels down so they never overlap vertically
    // on the same side.
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
    return [...place(pick(1), 1), ...place(pick(-1), -1)];
  }, [points, x, y]);

  const colour = (p) => (!p.sig ? COLOR_NS : p.x > 0 ? COLOR_UP : COLOR_DOWN);
  const ns = points.filter((p) => !p.sig);
  const sig = points.filter((p) => p.sig);
  const focus = points.find((p) => p.gene === (hover?.gene || selectedGene));
  const focusLabelled = focus && labelled.some((l) => l.gene === focus.gene);

  return (
    <div ref={ref} style={{ width: "100%", position: "relative" }}>
      <svg width={width} height={HEIGHT} role="img" aria-label="Volcano plot" style={{ fontFamily: "inherit" }}>
        <rect x={M.left} y={M.top} width={plotW} height={plotH} fill="#FCFCFD" stroke="#F0F0F0" />
        {x.ticks(8).map((tk) => (
          <g key={`x${tk}`}>
            <line x1={x(tk)} x2={x(tk)} y1={M.top} y2={M.top + plotH} stroke="#F0F0F0" />
            <text x={x(tk)} y={M.top + plotH + 16} textAnchor="middle" fontSize="11" fill="#8C8C8C">
              {tk}
            </text>
          </g>
        ))}
        {y.ticks(6).map((tk) => (
          <g key={`y${tk}`}>
            <line x1={M.left} x2={M.left + plotW} y1={y(tk)} y2={y(tk)} stroke="#F0F0F0" />
            <text x={M.left - 8} y={y(tk) + 4} textAnchor="end" fontSize="11" fill="#8C8C8C">
              {tk}
            </text>
          </g>
        ))}
        {/* thresholds */}
        {[-lfcCut, lfcCut].map((v) => (
          <line key={v} x1={x(v)} x2={x(v)} y1={M.top} y2={M.top + plotH} stroke="#8C8C8C" strokeDasharray="4 4" />
        ))}
        {pAtQ != null && (
          <g>
            <line x1={M.left} x2={M.left + plotW} y1={y(-Math.log10(pAtQ))} y2={y(-Math.log10(pAtQ))} stroke="#8C8C8C" strokeDasharray="4 4" />
            <text x={M.left + plotW - 4} y={y(-Math.log10(pAtQ)) - 4} textAnchor="end" fontSize="10" fill="#8C8C8C">
              {`q = ${qCut}`}
            </text>
          </g>
        )}
        {/* side captions */}
        <text x={M.left + 6} y={M.top - 10} fontSize="12" fill={COLOR_DOWN} fontWeight="600">
          {`← higher in ${labels.B}`}
        </text>
        <text x={M.left + plotW - 6} y={M.top - 10} fontSize="12" fill={COLOR_UP} fontWeight="600" textAnchor="end">
          {`higher in ${labels.A} →`}
        </text>
        {ns.map((p) => (
          <circle key={p.gene} cx={x(p.x)} cy={y(p.y)} r={2} fill={COLOR_NS} />
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
            onClick={() => onGene(p.gene)}
          />
        ))}
        {labelled.map((p) => (
          <g key={`l${p.gene}`} style={{ cursor: "pointer" }} onClick={() => onGene(p.gene)}>
            <line x1={p.px} y1={p.py} x2={p.lx} y2={p.ly - 3} stroke="#BFBFBF" />
            <text x={p.lx} y={p.ly} textAnchor={p.anchor} fontSize="11" fill="#262626" stroke="#fff" strokeWidth="3" paintOrder="stroke">
              {p.gene}
            </text>
          </g>
        ))}
        {focus && (
          <g pointerEvents="none">
            <circle cx={x(focus.x)} cy={y(focus.y)} r={7} fill="none" stroke="#FA541C" strokeWidth={2} />
            {!focusLabelled && <text x={x(focus.x)} y={y(focus.y) - 11} textAnchor="middle" fontSize="12" fontWeight="600" fill="#FA541C" stroke="#fff" strokeWidth="3" paintOrder="stroke">
              {`${focus.gene}  log2FC ${focus.x.toFixed(2)}`}
            </text>}
          </g>
        )}
        <text x={M.left + plotW / 2} y={HEIGHT - 8} textAnchor="middle" fontSize="12" fill="#595959">
          log2 fold change
        </text>
        <text transform={`translate(16 ${M.top + plotH / 2}) rotate(-90)`} textAnchor="middle" fontSize="12" fill="#595959">
          −log10 p
        </text>
      </svg>
    </div>
  );
}
