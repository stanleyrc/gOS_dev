import React, { useMemo, useState } from "react";
import useContainerWidth from "../useContainerWidth";
import usePlotTheme from "../usePlotTheme";
import { ChartTooltip, useChartText } from "../chartAxes";

const ROW = 20;
const LABEL_W = 84;
const CLIP = 0.8;

// blue (low) - white - red (high) on scaled expression, clipped at +-CLIP
function colour(v, dark) {
  if (!Number.isFinite(v)) return "#bbb";
  const t = Math.max(-1, Math.min(1, v / CLIP));
  const mid = dark ? [48, 48, 52] : [250, 250, 250];
  const end = t >= 0 ? [194, 24, 91] : [31, 95, 168];
  const k = Math.abs(t);
  return `rgb(${mid.map((m, i) => Math.round(m + (end[i] - m) * k)).join(",")})`;
}

/**
 * Dot plot: genes (rows, ordered by effect) x covariate groups (columns). Colour = mean scaled expression (z per patient and
 * gene over the test's cells), dot size = share of cells with expression > 0. `columns` / `cells` come from dotPlotAggregate.
 */
export default function CovariateDeDotPlot({ genes, columns, cells, labelA, labelB, onGene = null }) {
  const [ref, width] = useContainerWidth(600);
  const theme = usePlotTheme();
  const txt = useChartText();
  const [tip, setTip] = useState(null);
  const byKey = useMemo(() => new Map(cells.map((c) => [`${c.gene}|${c.col}`, c])), [cells]);
  const split = columns.some((c) => c.patient);
  const colW = Math.max(22, Math.min(80, (width - LABEL_W - 12) / Math.max(1, columns.length)));
  const top = split ? 46 : 30;
  const height = top + genes.length * ROW + 70;
  const r = Math.min(8, colW / 2 - 2, ROW / 2 - 1);
  const dark = theme.mode === "dark";
  // patient spans for the header in split mode
  const spans = [];
  columns.forEach((c, i) => {
    if (!c.patient) return;
    const last = spans[spans.length - 1];
    if (last && last.patient === c.patient) last.x1 = i;
    else spans.push({ patient: c.patient, x0: i, x1: i });
  });
  const x = (i) => LABEL_W + colW * i + colW / 2;
  const legendY = top + genes.length * ROW + 14;
  return (
    <div ref={ref} style={{ width: "100%", position: "relative", overflowX: "auto" }}>
      <svg width={Math.max(width, LABEL_W + colW * columns.length + 12)} height={height} role="img" aria-label="Dot plot of the selected genes by covariate group">
        {spans.map((s) => (
          <g key={s.patient}>
            <line x1={x(s.x0) - colW / 2 + 3} x2={x(s.x1) + colW / 2 - 3} y1={14} y2={14} stroke={theme.border} />
            <text x={(x(s.x0) + x(s.x1)) / 2} y={10} textAnchor="middle" {...txt.group}>{s.patient}</text>
          </g>
        ))}
        {columns.map((c, i) => (
          <text key={c.key} x={x(i)} y={top - 8} textAnchor="middle" {...txt.label} fill={c.side === "A" ? "#C2185B" : "#1F5FA8"}>{c.side}</text>
        ))}
        {genes.map((g, j) => {
          const y = top + j * ROW + ROW / 2;
          return (
            <g key={g}>
              {j % 2 === 0 && <rect x={0} y={y - ROW / 2} width={LABEL_W + colW * columns.length} height={ROW} fill={theme.panelAlt} />}
              <text x={LABEL_W - 8} y={y + 4} textAnchor="end" {...txt.tick} fill={theme.text} style={{ cursor: onGene ? "pointer" : undefined }} onClick={() => onGene && onGene(g)}>{g}</text>
              {columns.map((c, i) => {
                const cell = byKey.get(`${g}|${c.key}`);
                if (!cell || cell.pct == null) return <text key={c.key} x={x(i)} y={y + 4} textAnchor="middle" {...txt.caption}>–</text>;
                const rad = Math.max(1.5, r * Math.sqrt(cell.pct));
                return (
                  <circle
                    key={c.key} cx={x(i)} cy={y} r={rad} fill={colour(cell.mean, dark)} stroke={theme.border} strokeWidth={0.6}
                    onMouseEnter={(e) => { const box = e.currentTarget.ownerSVGElement.getBoundingClientRect(); setTip({ x: e.clientX - box.left + 10, y: e.clientY - box.top + 10, g, c, cell }); }}
                    onMouseLeave={() => setTip(null)}
                  />
                );
              })}
            </g>
          );
        })}
        <g transform={`translate(${LABEL_W}, ${legendY})`}>
          <text x={0} y={10} {...txt.caption}>scaled mean:</text>
          {[-CLIP, -CLIP / 2, 0, CLIP / 2, CLIP].map((v, k) => (
            <g key={v}>
              <rect x={96 + k * 26} y={0} width={26} height={12} fill={colour(v, dark)} stroke={theme.border} strokeWidth={0.5} />
              {(k === 0 || k === 4) && <text x={96 + k * 26 + 13} y={24} textAnchor="middle" {...txt.caption}>{v > 0 ? `+${v}` : v}</text>}
            </g>
          ))}
          <text x={0} y={44} {...txt.caption}>cells with expression &gt; 0:</text>
          {[0.1, 0.5, 1].map((p, k) => <circle key={p} cx={176 + k * 34} cy={40} r={Math.max(1.5, r * Math.sqrt(p))} fill={theme.faint} />)}
          {[0.1, 0.5, 1].map((p, k) => <text key={p} x={176 + k * 34 + 12} y={44} {...txt.caption}>{`${Math.round(p * 100)}%`}</text>)}
        </g>
      </svg>
      {tip && (
        <ChartTooltip x={tip.x} y={tip.y}>
          <b>{tip.g}</b> · {tip.c.patient ? `${tip.c.patient} ` : ""}{tip.c.side === "A" ? labelA : labelB}
          <br />
          {`mean scaled expression ${tip.cell.mean?.toFixed(2)} · ${Math.round(tip.cell.pct * 100)}% of ${tip.cell.n} cells > 0`}
        </ChartTooltip>
      )}
    </div>
  );
}
