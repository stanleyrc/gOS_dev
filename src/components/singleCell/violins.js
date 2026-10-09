import React, { useState } from "react";
import useContainerWidth from "./useContainerWidth";
import usePlotTheme from "./usePlotTheme";
import { TYPE } from "../../helpers/singleCell/plotTheme";
import { kernelDensity, quartiles } from "../../helpers/singleCell/rnaStats";

const fmt = (v) => (Math.abs(v) >= 10 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(1) : v.toFixed(2));

/**
 * Violins (density + median / IQR bar + jittered points) for any number of
 * groups; groups sharing a `cluster` key sit together (e.g. one patient's
 * states). Points are drawn when a group has <= maxPoints values. Plain SVG.
 *
 * groups: [{ key, label, sublabel?, color, values: number[], cluster? }]
 * domain: [min, max] (default 0 .. max value), yTitle, format(v) for ticks.
 * Under each violin: n and the share of values above zero (expression detection) when showDetected.
 */
export default function Violins({ groups, height = 240, domain = null, yTitle = "", maxPoints = 400, showDetected = false, onPick = null }) {
  const [ref, width] = useContainerWidth(600);
  const theme = usePlotTheme();
  const [hover, setHover] = useState(null);
  const M = { left: 46, right: 8, top: 10, bottom: showDetected ? 54 : 40 };
  const plotH = height - M.top - M.bottom;
  const all = groups.flatMap((g) => g.values).filter(Number.isFinite);
  const lo = domain ? domain[0] : Math.min(0, ...all);
  const hi = domain ? domain[1] : Math.max(lo + 1e-9, ...all);
  const y = (v) => M.top + plotH - ((Math.min(Math.max(v, lo), hi) - lo) / (hi - lo || 1)) * plotH;
  // horizontal layout: a gap between clusters
  const gaps = groups.reduce((acc, g, i) => acc + (i > 0 && g.cluster != null && g.cluster !== groups[i - 1].cluster ? 1 : 0), 0);
  const unit = (width - M.left - M.right) / Math.max(1, groups.length + gaps * 0.6);
  let cursor = M.left;
  const slots = groups.map((g, i) => {
    if (i > 0 && g.cluster != null && g.cluster !== groups[i - 1].cluster) cursor += unit * 0.6;
    const cx = cursor + unit / 2;
    cursor += unit;
    return cx;
  });
  const half = Math.min(unit * 0.42, 46);
  const pts = Array.from({ length: 48 }, (_, k) => lo + ((hi - lo) * k) / 47);
  const ticks = Array.from({ length: 5 }, (_, k) => lo + ((hi - lo) * k) / 4);
  // cluster labels (patients) under their groups
  const clusterSpans = [];
  groups.forEach((g, i) => {
    if (g.cluster == null) return;
    const last = clusterSpans[clusterSpans.length - 1];
    if (last && last.key === g.cluster) last.x1 = slots[i];
    else clusterSpans.push({ key: g.cluster, x0: slots[i], x1: slots[i] });
  });
  return (
    <div ref={ref} style={{ width: "100%" }}>
      <svg width={width} height={height + (clusterSpans.length ? 16 : 0)} role="img" aria-label={yTitle}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={M.left} x2={width - M.right} y1={y(v)} y2={y(v)} stroke={theme.grid} />
            <text x={M.left - 6} y={y(v) + 4} textAnchor="end" fontSize={TYPE.tick} fill={theme.muted}>
              {fmt(v)}
            </text>
          </g>
        ))}
        <text x={12} y={M.top + plotH / 2} transform={`rotate(-90 12 ${M.top + plotH / 2})`} textAnchor="middle" fontSize={TYPE.tick} fill={theme.textSecondary}>
          {yTitle}
        </text>
        {groups.map((g, i) => {
          const v = g.values.filter(Number.isFinite);
          const cx = slots[i];
          if (!v.length) {
            return (
              <text key={g.key} x={cx} y={M.top + plotH / 2} textAnchor="middle" fontSize={TYPE.tick} fill={theme.faint}>
                –
              </text>
            );
          }
          // all values equal (e.g. per-cell PSI all 0 or all 1): no density to draw, a flat bar at the value
          const flat = Math.max(...v) - Math.min(...v) < 1e-9;
          const d = flat ? pts.map(() => 0) : kernelDensity(v, pts, (hi - lo) / 40);
          const dmax = Math.max(...d) || 1;
          const path = flat
            ? `M${(cx - half * 0.8).toFixed(1)},${(y(v[0]) - 2).toFixed(1)}h${(half * 1.6).toFixed(1)}v4h${(-half * 1.6).toFixed(1)}Z`
            :
            pts.map((p, k) => `${k ? "L" : "M"}${(cx - (d[k] / dmax) * half).toFixed(1)},${y(p).toFixed(1)}`).join("") +
            pts
              .slice()
              .reverse()
              .map((p, k) => `L${(cx + (d[pts.length - 1 - k] / dmax) * half).toFixed(1)},${y(p).toFixed(1)}`)
              .join("") +
            "Z";
          const q = quartiles(v);
          const det = v.filter((x) => x > 0).length / v.length;
          const dim = hover != null && hover !== g.key;
          return (
            <g key={g.key} opacity={dim ? 0.45 : 1} onMouseEnter={() => setHover(g.key)} onMouseLeave={() => setHover(null)} onClick={() => onPick && onPick(g)} style={{ cursor: onPick ? "pointer" : undefined }}>
              <path d={path} fill={g.color} fillOpacity={0.35} stroke={g.color} strokeWidth={1} />
              {v.length <= maxPoints &&
                v.map((x, k) => (
                  <circle key={k} cx={cx + (((k * 2654435761) % 1000) / 1000 - 0.5) * half * 0.9} cy={y(x)} r={1.6} fill={g.color} fillOpacity={0.7} />
                ))}
              <line x1={cx} x2={cx} y1={y(q.q1)} y2={y(q.q3)} stroke={theme.text} strokeWidth={3} strokeOpacity={0.7} />
              <circle cx={cx} cy={y(q.median)} r={3} fill={theme.panel} stroke={theme.text} />
              <text x={cx} y={height - M.bottom + 14} textAnchor="middle" fontSize={TYPE.tick} fill={theme.text}>
                {`${g.label}`.length > 14 ? `${`${g.label}`.slice(0, 13)}…` : g.label}
              </text>
              <text x={cx} y={height - M.bottom + 27} textAnchor="middle" fontSize={TYPE.tick} fill={theme.muted}>
                {`n=${v.length}`}
              </text>
              {showDetected && (
                <text x={cx} y={height - M.bottom + 40} textAnchor="middle" fontSize={TYPE.tick} fill={theme.muted}>
                  {`${Math.round(det * 100)}% >0`}
                </text>
              )}
              <title>{`${g.cluster != null ? `${g.cluster} · ` : ""}${g.label}: n=${v.length}, median ${fmt(q.median)} (IQR ${fmt(q.q1)}–${fmt(q.q3)})${showDetected ? `, ${Math.round(det * 100)}% above 0` : ""}`}</title>
            </g>
          );
        })}
        {clusterSpans.length > 1 &&
          clusterSpans.map((c) => (
            <g key={c.key}>
              <line x1={c.x0 - half * 0.8} x2={c.x1 + half * 0.8} y1={height + 2} y2={height + 2} stroke={theme.border} />
              <text x={(c.x0 + c.x1) / 2} y={height + 14} textAnchor="middle" fontSize={TYPE.tick} fontWeight={600} fill={theme.textSecondary}>
                {c.key}
              </text>
            </g>
          ))}
      </svg>
    </div>
  );
}
