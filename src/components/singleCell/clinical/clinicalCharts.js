import React from "react";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import { statusFill } from "./clinicalViz";

const log = (v) => Math.log10(Math.max(v, 0.5));

/** Scatter with a y = x line; germline-like points hollow; labelled points; optional log axes. points {x,y,label,status,tip,href,germlineLike,yMax,show}. */
export function AgreementScatter({ points, width, height = 300, xLabel, yLabel, logAxes, theme, xMax, yMax, pct }) {
  const col = statusFill(theme);
  const M = { l: 58, r: 18, t: 14, b: 46 };
  const hi = Math.max(1e-9, xMax || 0, yMax || 0, ...points.map((p) => p.x), ...points.map((p) => p.y)) * 1.08;
  const lo = logAxes ? 0.5 : 0;
  const f = (v) => (logAxes ? log(v) : v);
  const sx = (v) => M.l + ((f(v) - f(lo)) / (f(hi) - f(lo))) * (width - M.l - M.r);
  const sy = (v) => height - M.b - ((f(v) - f(lo)) / (f(hi) - f(lo))) * (height - M.t - M.b);
  const ticks = logAxes ? [1, 3, 10, 30, 100, 300].filter((t) => t <= hi) : pct ? [0, 0.25, 0.5, 0.75, 1] : [0, 0.25, 0.5, 0.75, 1].map((t) => t * hi);
  const fmt = (t) => (pct ? `${Math.round(t * 100)}%` : logAxes ? t : Math.round(t * 100) / 100);
  return (
    <svg width={width} height={height} style={{ display: "block", fontSize: TYPE.tick }} role="img" aria-label={`${yLabel} against ${xLabel}`}>
      <rect x={M.l} y={M.t} width={width - M.l - M.r} height={height - M.t - M.b} fill={theme.panel} stroke={theme.grid} />
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={sx(t)} x2={sx(t)} y1={M.t} y2={height - M.b} stroke={theme.grid} />
          <line y1={sy(t)} y2={sy(t)} x1={M.l} x2={width - M.r} stroke={theme.grid} />
          <text x={sx(t)} y={height - M.b + 14} textAnchor="middle" fill={theme.muted}>{fmt(t)}</text>
          <text x={M.l - 6} y={sy(t) + 4} textAnchor="end" fill={theme.muted}>{fmt(t)}</text>
        </g>
      ))}
      <line x1={sx(lo)} y1={sy(lo)} x2={sx(hi)} y2={sy(hi)} stroke={theme.axis} strokeDasharray="4 3" />
      <text x={sx(hi) - 4} y={sy(hi) + 14} textAnchor="end" fill={theme.muted} fontSize={TYPE.micro + 0.5}>y = x</text>
      {points.map((p, i) => {
        const hollow = p.germlineLike;
        const c = p.status === "not_covered" ? theme.axis : col[p.status] === "none" ? theme.text : col[p.status];
        const dot = (
          <g>
            <title>{p.tip}</title>
            {p.yMax != null && p.yMax > p.y && <line x1={sx(p.x)} x2={sx(p.x)} y1={sy(p.y)} y2={sy(Math.min(p.yMax, hi))} stroke={c} strokeOpacity={0.5} />}
            <circle cx={sx(p.x)} cy={sy(p.y)} r={6} fill={hollow ? theme.panel : c} fillOpacity={hollow ? 1 : 0.85} stroke={hollow ? theme.text : theme.panel} strokeWidth={hollow ? 1.8 : 1} />
            {p.show && <text x={sx(p.x) + 9} y={sy(p.y) + 4} fill={theme.textSecondary} fontSize={TYPE.micro + 0.5} stroke={theme.panel} strokeWidth={3} paintOrder="stroke">{p.label}</text>}
          </g>
        );
        return p.href ? <a key={i} href={p.href}>{dot}</a> : <g key={i}>{dot}</g>;
      })}
      <text x={(M.l + width - M.r) / 2} y={height - 6} textAnchor="middle" fill={theme.textSecondary} fontSize={TYPE.label}>{xLabel}</text>
      <text transform={`translate(14,${(M.t + height - M.b) / 2}) rotate(-90)`} textAnchor="middle" fill={theme.textSecondary} fontSize={TYPE.label}>{yLabel}</text>
    </svg>
  );
}

/** Clinical vs single-cell TMB side by side per patient (vertical bars); rows from tmbRows(). */
export function TmbPaired({ rows, width, theme }) {
  const M = { l: 48, r: 10, t: 12, b: 36 };
  const height = 230;
  const max = Math.max(1, ...rows.flatMap((r) => [r.clinical, r.clonal, r.cellMedian].map((v) => v || 0))) * 1.12;
  const gw = (width - M.l - M.r) / Math.max(1, rows.length);
  const bw = Math.min(26, gw / 3);
  const sy = (v) => height - M.b - (v / max) * (height - M.t - M.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(t * max * 10) / 10);
  return (
    <svg width={width} height={height} style={{ display: "block", fontSize: TYPE.tick }} role="img" aria-label="Tumour mutational burden, clinical and single-cell">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={M.l} x2={width - M.r} y1={sy(t)} y2={sy(t)} stroke={theme.grid} />
          <text x={M.l - 6} y={sy(t) + 4} textAnchor="end" fill={theme.muted}>{t}</text>
        </g>
      ))}
      <text transform={`translate(12,${(M.t + height - M.b) / 2}) rotate(-90)`} textAnchor="middle" fill={theme.textSecondary} fontSize={TYPE.label}>mutations per Mb</text>
      {rows.map((r, i) => {
        const x0 = M.l + i * gw + gw / 2;
        const sc = r.clonal;
        return (
          <g key={r.patient}>
            <text x={x0} y={height - M.b + 15} textAnchor="middle" fill={theme.text} fontWeight={600}>{r.patient}</text>
            <g>
              <title>{`${r.patient} clinical (Oncopanel): ${r.clinical.toFixed(2)} mutations per Mb of the gene panel`}</title>
              <rect x={x0 - bw - 2} y={sy(r.clinical)} width={bw} height={sy(0) - sy(r.clinical)} fill={theme.accent} />
              <text x={x0 - bw / 2 - 2} y={sy(r.clinical) - 3} textAnchor="middle" fill={theme.textSecondary} fontSize={TYPE.micro + 0.5}>{r.clinical.toFixed(1)}</text>
            </g>
            {sc == null ? (
              <text x={x0 + 2} y={sy(0) - 6} fill={theme.muted} fontSize={TYPE.micro + 0.5}>
                <title>{r.note}</title>
                n/a
              </text>
            ) : (
              <g>
                <title>{`${r.patient} single-cell: truncal ${r.truncal.toFixed(2)} + subclonal ${(sc - r.truncal).toFixed(2)} = ${sc.toFixed(2)} mutations per Mb of callable diploid genome; per-cell median ${r.cellMedian?.toFixed(2)}`}</title>
                <rect x={x0 + 2} y={sy(r.truncal)} width={bw} height={sy(0) - sy(r.truncal)} fill={theme.ok} />
                <rect x={x0 + 2} y={sy(sc)} width={bw} height={sy(r.truncal) - sy(sc)} fill={theme.warn} />
                <text x={x0 + 2 + bw / 2} y={sy(sc) - 3} textAnchor="middle" fill={theme.textSecondary} fontSize={TYPE.micro + 0.5}>{sc.toFixed(1)}</text>
                {r.cellMedian != null && <line x1={x0 + 2 - 2} x2={x0 + 2 + bw + 2} y1={sy(r.cellMedian)} y2={sy(r.cellMedian)} stroke={theme.text} strokeWidth={2} />}
              </g>
            )}
          </g>
        );
      })}
      <g transform={`translate(${M.l},${height - 6})`} fontSize={TYPE.micro + 0.5} fill={theme.textSecondary}>
        {[["Clinical", theme.accent], ["SC truncal", theme.ok], ["SC subclonal", theme.warn]].map(([lb, c], k) => (
          <g key={lb} transform={`translate(${k * 100},0)`}><rect width={9} height={9} y={-9} fill={c} /><text x={13}>{lb}</text></g>
        ))}
        <g transform="translate(300,0)"><line x1={0} x2={12} y1={-4} y2={-4} stroke={theme.text} strokeWidth={2} /><text x={16}>SC per-cell median</text></g>
      </g>
    </svg>
  );
}
