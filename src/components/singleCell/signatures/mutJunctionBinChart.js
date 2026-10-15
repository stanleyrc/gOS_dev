import React from "react";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import usePlotTheme from "../usePlotTheme";
import useContainerWidth from "../useContainerWidth";

const H = 190;
const M = { l: 44, r: 12, t: 12, b: 46 };

/**
 * Fraction of sites that are APOBEC-like in each distance-to-junction bin: a bar with its 95% Wilson interval and,
 * where available, the callable-site background as a diamond with its interval. series = binSeries(...).
 */
export default function MutJunctionBinChart({ series, ariaLabel = "APOBEC fraction by distance to nearest junction" }) {
  const theme = usePlotTheme();
  const [ref, width] = useContainerWidth(600);
  const W = Math.max(300, width);
  const top = Math.max(0.1, ...series.map((s) => Math.max(s.hi || 0, s.bgHi || 0, s.frac || 0))) * 1.08;
  const sy = (v) => H - M.b - (v / top) * (H - M.t - M.b);
  const bw = (W - M.l - M.r) / Math.max(1, series.length);
  const ticks = [0, top / 2, top];
  return (
    <div ref={ref} style={{ width: "100%" }}>
      <svg width={W} height={H} role="img" aria-label={ariaLabel}>
        <title>{ariaLabel}</title>
        <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} stroke={theme.axis} />
        <line x1={M.l} x2={M.l} y1={M.t} y2={H - M.b} stroke={theme.axis} />
        {ticks.map((v) => (
          <g key={v}>
            <line x1={M.l - 4} x2={M.l} y1={sy(v)} y2={sy(v)} stroke={theme.axis} />
            <text x={M.l - 7} y={sy(v)} dy="0.35em" textAnchor="end" fontSize={TYPE.tick} fill={theme.muted}>{`${(100 * v).toFixed(0)}%`}</text>
          </g>
        ))}
        {series.map((s, i) => {
          const x = M.l + i * bw + bw * 0.18;
          const w = bw * 0.64;
          const cx = x + w / 2;
          return (
            <g key={s.label}>
              <title>{`${s.label}: ${s.k}/${s.n} sites${s.bgFrac != null ? `; callable-site background ${(100 * s.bgFrac).toFixed(1)}% of ${s.bgN}` : ""}`}</title>
              {s.n > 0 && s.frac != null ? (
                <>
                  <rect x={x} y={sy(s.frac)} width={w} height={Math.max(0, H - M.b - sy(s.frac))} fill={theme.accent} opacity={0.85} rx={1} />
                  <line x1={cx} x2={cx} y1={sy(s.lo)} y2={sy(s.hi)} stroke={theme.text} strokeWidth={1.2} />
                  <line x1={cx - 4} x2={cx + 4} y1={sy(s.lo)} y2={sy(s.lo)} stroke={theme.text} />
                  <line x1={cx - 4} x2={cx + 4} y1={sy(s.hi)} y2={sy(s.hi)} stroke={theme.text} />
                </>
              ) : (
                <text x={cx} y={H - M.b - 6} textAnchor="middle" fontSize={TYPE.tick} fill={theme.faint}>no sites</text>
              )}
              {s.bgFrac != null && (
                <g>
                  <line x1={cx + w / 2 + 4} x2={cx + w / 2 + 4} y1={sy(s.bgLo)} y2={sy(s.bgHi)} stroke={theme.warn} />
                  <path d={`M${cx + w / 2 + 4},${sy(s.bgFrac) - 4} l4,4 l-4,4 l-4,-4 z`} fill={theme.warn} />
                </g>
              )}
              <text x={cx} y={H - M.b + 14} textAnchor="middle" fontSize={TYPE.tick} fill={theme.textSecondary}>{s.label}</text>
              <text x={cx} y={H - M.b + 28} textAnchor="middle" fontSize={TYPE.tick} fill={theme.muted}>{`n=${s.n}`}</text>
            </g>
          );
        })}
      </svg>
      <div style={{ fontSize: TYPE.tick, color: theme.muted }}>
        <span style={{ display: "inline-block", width: 10, height: 10, background: theme.accent, marginRight: 4 }} />
        observed (95% CI)
        <span style={{ display: "inline-block", width: 8, height: 8, background: theme.warn, transform: "rotate(45deg)", margin: "0 5px 0 14px" }} />
        callable-site background (genotyped candidate sites in the same bin)
      </div>
    </div>
  );
}
