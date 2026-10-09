import React from "react";
import { arcLayout, junctionLabel } from "../../../helpers/singleCell/splicing";
import { junctionColor, psiColor, psiTextColor } from "../../../helpers/singleCell/rnaColors";
import { TYPE } from "../../../helpers/singleCell/plotTheme";

const FONT = 12;
const fmtPct = (p) => (Number.isFinite(p) ? `${Math.round(p * 100)}%` : "–");

/**
 * Sashimi-lite: a cluster's junctions as arcs over an ordinal axis of their
 * ends (not to scale), arc width and label = PSI in this group, colour = the
 * junction (shared across panels), dashed = unannotated. d3-free SVG.
 */
export function SashimiLite({ junctions, psi, title, subtitle, width = 320, height = 150, chromosome }) {
  const M = { left: 14, right: 14, top: title ? 34 : 12, bottom: 18 };
  const baseY = height - M.bottom;
  const { coords, x, arcs } = arcLayout(junctions, M.left, width - M.right);
  const maxSpan = Math.max(1, ...arcs.map((a) => a.span));
  const room = baseY - M.top - 14;
  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible" }} role="img">
      {title && (
        <text x={2} y={14} fontSize={FONT + 1} fontWeight={600} fill="currentColor">
          {title}
        </text>
      )}
      {subtitle && (
        <text x={2} y={28} fontSize={FONT - 1} fill="currentColor" opacity={0.65}>
          {subtitle}
        </text>
      )}
      <line x1={M.left} x2={width - M.right} y1={baseY} y2={baseY} stroke="currentColor" opacity={0.35} />
      {coords.map((c) => (
        <rect key={c} x={x(c) - 3} y={baseY - 5} width={6} height={10} rx={1} fill="currentColor" opacity={0.55}>
          <title>{`${chromosome ? `${chromosome}:` : ""}${c.toLocaleString("en-US")}`}</title>
        </rect>
      ))}
      {arcs.map((a) => {
        const p = psi?.[a.j];
        const h = 14 + (room * a.span) / maxSpan;
        const mid = (a.xa + a.xb) / 2;
        const w = Number.isFinite(p) ? 1 + p * 9 : 1;
        // apex of the cubic (both control points h above the base) sits at ~0.75 h
        const apexY = baseY - 0.75 * h;
        return (
          <g key={a.j}>
            <path
              d={`M${a.xa},${baseY - 5} C${a.xa},${baseY - h} ${a.xb},${baseY - h} ${a.xb},${baseY - 5}`}
              fill="none"
              stroke={junctionColor(a.j)}
              strokeWidth={w}
              strokeDasharray={a.annotated ? undefined : "5 3"}
              opacity={Number.isFinite(p) ? 0.85 : 0.25}
            >
              <title>{`${junctionLabel(chromosome, junctions[a.j])}: PSI ${fmtPct(p)}`}</title>
            </path>
            <text x={mid} y={apexY - 4} textAnchor="middle" fontSize={FONT - 1} fill={junctionColor(a.j)} fontWeight={600} paintOrder="stroke" stroke="var(--sc-plot-bg, #fff)" strokeWidth={3}>
              {fmtPct(p)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Junction x column PSI grid (columns: patients or groups) with values in the cells. */
export function PsiHeatmap({ junctions, columns, psi, totals, chromosome, cellW = 64, cellH = 26, labelW = 250, totalsLabel = "reads" }) {
  const width = labelW + columns.length * cellW + 8;
  const headH = 64;
  const height = headH + junctions.length * cellH + 22;
  return (
    <svg width={width} height={height} style={{ display: "block" }} role="img">
      {columns.map((c, i) => (
        <text key={c} transform={`translate(${labelW + i * cellW + cellW / 2},${headH - 6}) rotate(-35)`} fontSize={TYPE.label} fill="currentColor">
          {c}
        </text>
      ))}
      {junctions.map((jn, j) => (
        <g key={j} transform={`translate(0,${headH + j * cellH})`}>
          <rect x={0} y={cellH / 2 - 5} width={10} height={10} fill={junctionColor(j)} />
          <text x={16} y={cellH / 2} dy="0.35em" fontSize={TYPE.label} fill="currentColor" fontStyle={jn.annotated === false ? "italic" : undefined}>
            {junctionLabel(chromosome, jn)}
          </text>
          {columns.map((c, i) => {
            const p = psi[j][i];
            return (
              <g key={c} transform={`translate(${labelW + i * cellW},0)`}>
                <rect width={cellW - 2} height={cellH - 2} fill={Number.isFinite(p) ? psiColor(p) : "rgba(0,0,0,0.04)"}>
                  <title>{`${c} · ${junctionLabel(chromosome, jn)}: ${Number.isFinite(p) ? p.toFixed(3) : "no reads"}`}</title>
                </rect>
                <text x={(cellW - 2) / 2} y={(cellH - 2) / 2} dy="0.35em" textAnchor="middle" fontSize={TYPE.tick} fill={psiTextColor(p)}>
                  {Number.isFinite(p) ? p.toFixed(2) : "–"}
                </text>
              </g>
            );
          })}
        </g>
      ))}
      {totals && (
        <g transform={`translate(0,${headH + junctions.length * cellH + 14})`}>
          <text x={16} fontSize={TYPE.tick} fill="currentColor" opacity={0.65}>
            {totalsLabel}
          </text>
          {columns.map((c, i) => (
            <text key={c} x={labelW + i * cellW + (cellW - 2) / 2} textAnchor="middle" fontSize={TYPE.tick} fill="currentColor" opacity={0.65}>
              {totals[i]}
            </text>
          ))}
        </g>
      )}
    </svg>
  );
}
