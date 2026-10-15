import React from "react";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import { fmtRr, logPos } from "../../../helpers/singleCell/mutJunctionsFocal";
import usePlotTheme from "../usePlotTheme";
import useContainerWidth from "../useContainerWidth";

const ROW = 22;
const LABEL_W = 210;
const TEXT_W = 150;
const AX = { min: 0.05, max: 50 };
const TICKS = [0.1, 0.3, 1, 3, 10, 30];

/**
 * Forest plot of the cis/trans rate ratio within 5 kb: one row per patient (square sized by SNV count, 95% CI line;
 * arrows where the interval runs off the axis) and the Mantel-Haenszel pooled row as a diamond. rows = forestRows(...).
 */
export default function MutJunctionForest({ rows, onOpen = null, ariaLabel = "Cis/trans SNV rate ratio within 5 kb of junction breakends, per patient and pooled" }) {
  const theme = usePlotTheme();
  const [ref, width] = useContainerWidth(640);
  const W = Math.max(420, width);
  const x0 = LABEL_W;
  const x1 = W - TEXT_W - 10;
  const H = (rows.length + 1) * ROW + 26;
  const px = (v) => logPos(v, { ...AX, x0, x1 });
  const one = px(1).x;
  const maxN = Math.max(1, ...rows.map((r) => r.kc + r.kt));
  return (
    <div ref={ref} style={{ width: "100%" }}>
      <svg width={W} height={H} role="img" aria-label={ariaLabel}>
        <title>{ariaLabel}</title>
        <line x1={one} x2={one} y1={4} y2={H - 26} stroke={theme.axis} strokeDasharray="3 3" />
        <line x1={x0} x2={x1} y1={H - 26} y2={H - 26} stroke={theme.axis} />
        {TICKS.map((t) => (
          <g key={t}>
            <line x1={px(t).x} x2={px(t).x} y1={H - 26} y2={H - 22} stroke={theme.axis} />
            <text x={px(t).x} y={H - 11} textAnchor="middle" fontSize={TYPE.tick} fill={theme.muted}>{t}</text>
          </g>
        ))}
        <text x={x0} y={H - 1} fontSize={TYPE.tick - 1} fill={theme.muted}>trans higher</text>
        <text x={x1} y={H - 1} textAnchor="end" fontSize={TYPE.tick - 1} fill={theme.muted}>cis higher</text>
        {rows.map((r, i) => {
          const y = (i + 0.5) * ROW + 4;
          const lo = r.lo == null ? { x: x0, clipped: true } : px(r.lo);
          const hi = r.hi == null ? { x: x1, clipped: true } : px(r.hi);
          const est = r.rr == null ? null : px(r.rr);
          const n = r.kc + r.kt;
          const sz = 4 + 6 * Math.sqrt(n / maxN);
          const col = r.pooled ? theme.text : theme.accent;
          return (
            <g key={r.id} style={{ cursor: onOpen && !r.pooled ? "pointer" : "default" }} onClick={() => onOpen && !r.pooled && onOpen(r.id)}>
              <title>{`${r.id}: cis ${r.kc} / trans ${r.kt} SNVs within 5 kb; rate ratio ${fmtRr(r)}${r.p != null ? `, p=${r.p.toPrecision(2)}` : ""}`}</title>
              {r.pooled && <line x1={4} x2={W - 4} y1={y - ROW / 2} y2={y - ROW / 2} stroke={theme.borderSoft} />}
              <text x={4} y={y} dy="0.35em" fontSize={TYPE.body} fontWeight={r.pooled ? 600 : 400} fill={theme.text}>{r.id}</text>
              <text x={LABEL_W - 8} y={y} dy="0.35em" textAnchor="end" fontSize={TYPE.tick} fill={theme.muted}>{`${r.kc} cis / ${r.kt} trans`}</text>
              {n > 0 && (
                <>
                  <line x1={lo.x} x2={hi.x} y1={y} y2={y} stroke={col} strokeWidth={1.4} />
                  {lo.clipped && <path d={`M${x0},${y} l6,-4 l0,8 z`} fill={col} />}
                  {hi.clipped && <path d={`M${x1},${y} l-6,-4 l0,8 z`} fill={col} />}
                  {est &&
                    (r.pooled ? (
                      <path d={`M${est.x - 8},${y} L${est.x},${y - 6} L${est.x + 8},${y} L${est.x},${y + 6} z`} fill={col} />
                    ) : (
                      <rect x={est.x - sz / 2} y={y - sz / 2} width={sz} height={sz} fill={col} />
                    ))}
                </>
              )}
              <text x={W - TEXT_W} y={y} dy="0.35em" fontSize={TYPE.tick} fill={n > 0 ? theme.text : theme.faint}>{n > 0 ? fmtRr(r) : "no SNV within 5 kb"}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
