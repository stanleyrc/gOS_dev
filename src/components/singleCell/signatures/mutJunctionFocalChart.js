import React from "react";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import { fmtRate, fmtRr, rateTop } from "../../../helpers/singleCell/mutJunctionsFocal";
import usePlotTheme from "../usePlotTheme";
import useContainerWidth from "../useContainerWidth";

const H = 210;
const M = { l: 48, r: 12, t: 14, b: 58 };

/**
 * SNVs per callable Mb on the cis (fused) and trans side of junction breakends, per distance bin: paired bars with
 * exact Poisson 95% whiskers and the same-chromosome background as a dashed line. series = focalSeries(...).
 * Clicking a bin (or one bar) calls onPick({ bin, side }).
 */
export default function MutJunctionFocalChart({ series, onPick = null, picked = null, ariaLabel = "SNV rate on the cis and trans side of junction breakends by distance" }) {
  const theme = usePlotTheme();
  const [ref, width] = useContainerWidth(600);
  const W = Math.max(320, width);
  const top = rateTop(series);
  const sy = (v) => H - M.b - (Math.min(v, top) / top) * (H - M.t - M.b);
  const gw = (W - M.l - M.r) / Math.max(1, series.length);
  const ticks = [0, top / 2, top];
  const colour = { cis: theme.accent, trans: theme.magenta };
  return (
    <div ref={ref} style={{ width: "100%" }}>
      <svg width={W} height={H} role="img" aria-label={ariaLabel}>
        <title>{ariaLabel}</title>
        <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} stroke={theme.axis} />
        <line x1={M.l} x2={M.l} y1={M.t} y2={H - M.b} stroke={theme.axis} />
        {ticks.map((v) => (
          <g key={v}>
            <line x1={M.l - 4} x2={M.l} y1={sy(v)} y2={sy(v)} stroke={theme.axis} />
            <text x={M.l - 7} y={sy(v)} dy="0.35em" textAnchor="end" fontSize={TYPE.tick} fill={theme.muted}>{fmtRate(v)}</text>
          </g>
        ))}
        <text x={12} y={(M.t + H - M.b) / 2} transform={`rotate(-90 12 ${(M.t + H - M.b) / 2})`} textAnchor="middle" fontSize={TYPE.tick} fill={theme.textSecondary}>SNVs / callable Mb</text>
        {series.map((s, i) => {
          const x0 = M.l + i * gw;
          const bw = gw * 0.3;
          const isPicked = picked && picked.bin === s.label;
          const bar = (sd, j) => {
            const v = s[sd];
            const x = x0 + gw * 0.18 + j * (bw + gw * 0.04);
            const cx = x + bw / 2;
            const sel = isPicked && (!picked.side || picked.side === sd);
            return (
              <g key={sd} style={{ cursor: onPick ? "pointer" : "default" }} onClick={(e) => { e.stopPropagation(); if (onPick) onPick({ bin: s.label, side: sd }); }}>
                <title>{`${s.label}, ${sd}: ${v.k} SNVs over ${(v.L / 1e3).toFixed(1)} callable kb = ${fmtRate(v.rate)}/Mb (95% CI ${fmtRate(v.lo)}-${fmtRate(v.hi)}); expected from background ${(sd === "cis" ? s.expCis : s.expTrans)?.toFixed(2) ?? "n/a"}`}</title>
                {v.L > 0 && v.rate != null ? (
                  <>
                    <rect x={x} y={sy(v.rate)} width={bw} height={Math.max(v.k > 0 ? 1.5 : 0, H - M.b - sy(v.rate))} fill={colour[sd]} opacity={sel ? 1 : 0.8} stroke={sel ? theme.text : "none"} rx={1} />
                    <line x1={cx} x2={cx} y1={sy(v.lo ?? 0)} y2={sy(v.hi ?? 0)} stroke={theme.text} strokeWidth={1.1} />
                    {(v.hi ?? 0) > top ? (
                      <path d={`M${cx - 4},${M.t + 5} L${cx},${M.t - 1} L${cx + 4},${M.t + 5} z`} fill={theme.text} />
                    ) : (
                      <line x1={cx - 3} x2={cx + 3} y1={sy(v.hi ?? 0)} y2={sy(v.hi ?? 0)} stroke={theme.text} />
                    )}
                    <text x={cx + 5} y={sy(v.rate) - 3} textAnchor="start" fontSize={TYPE.tick - 1} fill={theme.muted}>{v.k}</text>
                  </>
                ) : (
                  <text x={cx} y={H - M.b - 4} textAnchor="middle" fontSize={TYPE.tick - 1} fill={theme.faint}>n/c</text>
                )}
                <rect x={x} y={M.t} width={bw} height={H - M.b - M.t} fill="transparent" />
              </g>
            );
          };
          const bgY = s.bg != null ? sy(s.bg) : null;
          return (
            <g key={s.label} onClick={() => onPick && onPick({ bin: s.label, side: null })} style={{ cursor: onPick ? "pointer" : "default" }}>
              {isPicked && <rect x={x0 + 2} y={M.t} width={gw - 4} height={H - M.b - M.t} fill={theme.selectFill} />}
              {bar("cis", 0)}
              {bar("trans", 1)}
              {bgY != null && <line x1={x0 + gw * 0.1} x2={x0 + gw * 0.9} y1={bgY} y2={bgY} stroke={theme.warn} strokeDasharray="4 3" strokeWidth={1.4} />}
              <text x={x0 + gw / 2} y={H - M.b + 14} textAnchor="middle" fontSize={TYPE.tick} fill={theme.textSecondary}>{s.label}</text>
              <text x={x0 + gw / 2} y={H - M.b + 28} textAnchor="middle" fontSize={TYPE.tick - 1} fill={theme.muted}>{`cis/trans ${fmtRr(s.cisTrans).split(" ")[0]}`}</text>
              <text x={x0 + gw / 2} y={H - M.b + 41} textAnchor="middle" fontSize={TYPE.tick - 1} fill={theme.muted}>{`${s.cis.k} / ${s.trans.k} SNVs`}</text>
            </g>
          );
        })}
      </svg>
      <div style={{ fontSize: TYPE.tick, color: theme.muted }}>
        <span style={{ display: "inline-block", width: 10, height: 10, background: colour.cis, marginRight: 4 }} />
        cis (fused side)
        <span style={{ display: "inline-block", width: 10, height: 10, background: colour.trans, margin: "0 4px 0 14px" }} />
        trans (other side)
        <span style={{ display: "inline-block", width: 16, borderTop: `2px dashed ${theme.warn}`, margin: "0 5px 3px 14px" }} />
        background (same chromosome, &gt; 50 kb from breakends); whiskers 95% CI (arrow = runs above the axis); numbers = SNVs; n/c = no callable bases. Click a bar to list its SNVs.
      </div>
    </div>
  );
}
