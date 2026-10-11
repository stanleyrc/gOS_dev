import React from "react";
import { Typography } from "antd";
import { boxStats, extent, jitter, linear } from "../../../helpers/singleCell/vignettes";
import { formatP } from "../../../helpers/singleCell/tests";
import usePlotTheme from "../usePlotTheme";
import { TYPE } from "../../../helpers/singleCell/plotTheme";

const { Text } = Typography;
const W = 420;
const H = 260;
const M = { left: 48, right: 12, top: 12, bottom: 40 };

function ticks([lo, hi], n = 5) {
  const step = (hi - lo) / n;
  const p = 10 ** Math.floor(Math.log10(step || 1));
  const s = [1, 2, 5, 10].map((k) => k * p).find((k) => k >= step) || step;
  const out = [];
  for (let v = Math.ceil(lo / s) * s; v <= hi + 1e-9; v += s) out.push(+v.toFixed(6));
  return out;
}

function Axes({ x, y, xDomain, yDomain, xLabel, yLabel, theme, xTicks = null }) {
  const xs = xTicks || ticks(xDomain);
  return (
    <g fontSize={TYPE.tick} fill={theme.muted}>
      <line x1={M.left} x2={W - M.right} y1={H - M.bottom} y2={H - M.bottom} stroke={theme.axis} />
      <line x1={M.left} x2={M.left} y1={M.top} y2={H - M.bottom} stroke={theme.axis} />
      {ticks(yDomain).map((v) => (
        <g key={`y${v}`}>
          <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} stroke={theme.grid} />
          <text x={M.left - 6} y={y(v)} dy="0.35em" textAnchor="end">{v}</text>
        </g>
      ))}
      {Array.isArray(xs) && xs.map((v) => (typeof v === "object" ? (
        <text key={v.label} x={v.x} y={H - M.bottom + 16} textAnchor="middle" fill={theme.textSecondary}>{v.label}</text>
      ) : (
        <text key={`x${v}`} x={x(v)} y={H - M.bottom + 16} textAnchor="middle">{v}</text>
      )))}
      <text x={(M.left + W - M.right) / 2} y={H - 6} textAnchor="middle" fontSize={TYPE.label} fill={theme.textSecondary}>{xLabel}</text>
      <text transform={`translate(12,${(M.top + H - M.bottom) / 2}) rotate(-90)`} textAnchor="middle" fontSize={TYPE.label} fill={theme.textSecondary}>{yLabel}</text>
    </g>
  );
}

/** Copies vs expression: one dot per tumor cell with DNA and RNA. */
function Scatter({ plot, theme }) {
  const pts = plot.points || [];
  const xDomain = extent(pts.map((p) => p[0]));
  const yDomain = extent(pts.map((p) => p[1]));
  const x = linear(xDomain, [M.left + 4, W - M.right - 4]);
  const y = linear(yDomain, [H - M.bottom - 4, M.top + 4]);
  return (
    <svg width={W} height={H} role="img" aria-label={`${plot.x} vs ${plot.y}`}>
      <Axes x={x} y={y} xDomain={xDomain} yDomain={yDomain} xLabel={plot.x} yLabel={plot.y} theme={theme} />
      {pts.map((p, k) => (
        <circle key={k} cx={x(p[0])} cy={y(p[1])} r={3} fill={theme.accent} fillOpacity={0.55} stroke={theme.panel} strokeWidth={0.5}>
          <title>{`${p[0]} copies · ${p[1]}`}</title>
        </circle>
      ))}
    </svg>
  );
}

/** Two groups (carriers vs others): jittered dots with a box. */
function Groups({ plot, theme }) {
  const groups = plot.groups || [];
  const yDomain = extent(groups.flatMap((g) => g.values));
  const band = (W - M.left - M.right) / Math.max(1, groups.length);
  const cx = (i) => M.left + band * (i + 0.5);
  const y = linear(yDomain, [H - M.bottom - 4, M.top + 4]);
  const fills = [theme.accent, theme.faint];
  return (
    <svg width={W} height={H} role="img" aria-label={plot.y}>
      <Axes x={() => 0} y={y} xDomain={[0, 1]} yDomain={yDomain} xLabel="" yLabel={plot.y} theme={theme} xTicks={groups.map((g, i) => ({ label: `${g.label} (n = ${g.values.length})`, x: cx(i) }))} />
      {groups.map((g, i) => {
        const b = boxStats(g.values);
        const w = Math.min(60, band * 0.4);
        return (
          <g key={g.label}>
            {g.values.map((v, k) => (
              <circle key={k} cx={cx(i) + jitter(k) * band * 0.3} cy={y(v)} r={2.6} fill={fills[i % 2]} fillOpacity={0.5} />
            ))}
            {b && (
              <g stroke={theme.text} fill="none">
                <rect x={cx(i) - w / 2} y={y(b.q3)} width={w} height={Math.max(1, y(b.q1) - y(b.q3))} />
                <line x1={cx(i) - w / 2} x2={cx(i) + w / 2} y1={y(b.median)} y2={y(b.median)} strokeWidth={2} />
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** The expression plot behind a vignette finding (exported with the vignette). */
export default function VignettePlot({ plot }) {
  const theme = usePlotTheme();
  if (!plot) return null;
  const caption =
    plot.type === "scatter"
      ? `Spearman rho ${Number(plot.rho).toFixed(2)}, ${formatP(plot.p)}, n = ${plot.n} tumor cells with DNA and RNA`
      : plot.type === "groups"
        ? `Mann-Whitney ${formatP(plot.p)}${Number.isFinite(plot.fold) ? `; mean linear expression ${plot.fold.toFixed(2)}x` : ""}`
        : "";
  return (
    <div>
      {plot.type === "scatter" && <Scatter plot={plot} theme={theme} />}
      {plot.type === "groups" && <Groups plot={plot} theme={theme} />}
      {caption && <Text type="secondary" style={{ display: "block", fontSize: TYPE.tick }}>{caption}</Text>}
    </div>
  );
}
