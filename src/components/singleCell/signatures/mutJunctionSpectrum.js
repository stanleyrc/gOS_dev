import React from "react";
import { SBS96, SBS_COLORS } from "../../../helpers/singleCell/signatures";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import usePlotTheme from "../usePlotTheme";
import useContainerWidth from "../useContainerWidth";

const ROW_H = 46;
const L = 120;
const SUBS = ["C>A", "C>G", "C>T", "T>A", "T>C", "T>G"];

/**
 * SBS96 spectra as proportions: near-junction cis SNVs, trans SNVs and the background windows, plus the cis minus
 * background difference. spectra = helpers mutJunctionsContinuous.spectra(...).
 */
export default function MutJunctionSpectrum({ spectra }) {
  const theme = usePlotTheme();
  const [ref, width] = useContainerWidth(700);
  const W = Math.max(420, width);
  const bw = (W - L - 8) / 96;
  const rows = [
    { key: "cis", label: `cis (n=${spectra.cis.n})`, v: spectra.cis.frac },
    { key: "trans", label: `trans (n=${spectra.trans.n})`, v: spectra.trans.frac },
    { key: "background", label: `background (n=${spectra.background.n})`, v: spectra.background.frac },
    { key: "diff", label: "cis - background", v: spectra.cis.frac.map((x, i) => (spectra.cis.n ? x - spectra.background.frac[i] : 0)), signed: true },
  ];
  const H = rows.length * (ROW_H + 8) + 24;
  return (
    <div ref={ref} style={{ width: "100%" }}>
      <svg width={W} height={H} role="img" aria-label="SBS96 spectra of near-junction SNVs and background">
        <title>SBS96 spectra: cis, trans, background and difference</title>
        {SUBS.map((s, j) => (
          <g key={s}>
            <rect x={L + j * 16 * bw} y={2} width={16 * bw - 1} height={8} fill={SBS_COLORS[s]} />
            <text x={L + (j + 0.5) * 16 * bw} y={20} textAnchor="middle" fontSize={TYPE.tick} fill={theme.textSecondary}>{s}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const y = 24 + i * (ROW_H + 8);
          const mx = Math.max(1e-9, ...r.v.map((x) => Math.abs(x)));
          const base = r.signed ? y + ROW_H / 2 : y + ROW_H;
          const scale = r.signed ? ROW_H / 2 / mx : ROW_H / mx;
          return (
            <g key={r.key}>
              <text x={L - 6} y={y + ROW_H / 2} dy="0.35em" textAnchor="end" fontSize={TYPE.tick} fill={theme.text}>{r.label}</text>
              <line x1={L} x2={W - 8} y1={base} y2={base} stroke={theme.axis} />
              {r.v.map((x, k) => {
                const h = x * scale;
                return (
                  <rect key={k} x={L + k * bw} y={h >= 0 ? base - h : base} width={Math.max(0.5, bw - 0.6)} height={Math.abs(h)} fill={SBS_COLORS[SBS96[k].slice(2, 5)]}>
                    <title>{`${r.label} ${SBS96[k]}: ${(100 * x).toFixed(1)}%`}</title>
                  </rect>
                );
              })}
              <text x={W - 10} y={y + 8} textAnchor="end" fontSize={TYPE.tick - 1} fill={theme.muted}>{r.signed ? `+/-${(100 * mx).toFixed(0)}%` : `max ${(100 * mx).toFixed(0)}%`}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
