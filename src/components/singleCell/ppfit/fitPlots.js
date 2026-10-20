import React from "react";
import { cnAt, ploidySummary } from "../../../helpers/singleCell/cnFit";

export const BLUE = "#1F5FA8";
export const ORANGE = "#E08A1E";
export const GREY = "#8DA0B3";

/** Integer-fit fraction over a ploidy range, with the fitted and slider ploidy marked. */
export function FitCurve({ width, curve, fitPloidy, ploidy }) {
  const h = 150;
  const ml = 44, mr = 10, mt = 10, mb = 28;
  const lo = curve[0].ploidy;
  const hi = curve[curve.length - 1].ploidy;
  const px = (p) => ml + ((p - lo) / (hi - lo)) * (width - ml - mr);
  const vals = curve.map((c) => c.fit).filter((v) => v != null);
  const ymin = Math.min(0.4, ...vals);
  const ymax = Math.max(0.8, ...vals);
  const py = (v) => mt + (1 - (v - ymin) / (ymax - ymin)) * (h - mt - mb);
  const d = curve.map((c, i) => `${i ? "L" : "M"}${px(c.ploidy).toFixed(1)},${py(c.fit ?? ymin).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={h} style={{ display: "block" }}>
      <line x1={ml} x2={width - mr} y1={py(0.5)} y2={py(0.5)} stroke={GREY} strokeDasharray="3 3" />
      <text x={width - mr} y={py(0.5) - 3} fontSize={10} textAnchor="end" fill={GREY}>chance (0.5)</text>
      <path d={d} fill="none" stroke={BLUE} strokeWidth={1.6} />
      <line x1={px(fitPloidy)} x2={px(fitPloidy)} y1={mt} y2={h - mb} stroke={GREY} strokeDasharray="4 3" />
      <line x1={px(ploidy)} x2={px(ploidy)} y1={mt} y2={h - mb} stroke={ORANGE} strokeWidth={1.6} />
      <line x1={ml} x2={width - mr} y1={h - mb} y2={h - mb} stroke="currentColor" opacity={0.4} />
      {[1, 2, 3, 4, 5, 6].filter((v) => v >= lo && v <= hi).map((v) => (
        <text key={v} x={px(v)} y={h - mb + 14} fontSize={11} textAnchor="middle" fill="currentColor">{v}</text>
      ))}
      {[ymin, 0.5, ymax].map((v) => <text key={v} x={ml - 4} y={py(v) + 4} fontSize={10} textAnchor="end" fill="currentColor">{v.toFixed(2)}</text>)}
      <text x={(ml + width - mr) / 2} y={h - 2} fontSize={11} textAnchor="middle" fill="currentColor">trial ploidy (grey: fitted, orange: slider)</text>
    </svg>
  );
}

/** Observed minor-allele fraction of each allelic segment against the lattice of minor/total for the slider's total CN. */
export function MafPlot({ width, blocks, sol }) {
  const h = 190;
  const ml = 44, mr = 10, mt = 10, mb = 28;
  const pts = blocks.filter((b) => b._cn != null && b.maf != null && (b.n_snps_d2 ?? 0) >= 50);
  const maxCn = Math.max(4, ...pts.map((b) => Math.round(cnAt(sol, b._m)))) + 0.5;
  const px = (c) => ml + (c / maxCn) * (width - ml - mr);
  const py = (v) => mt + (1 - v / 0.5) * (h - mt - mb);
  const lattice = [];
  for (let t = 1; t <= Math.floor(maxCn); t += 1) for (let mi = 0; mi <= Math.floor(t / 2); mi += 1) lattice.push({ t, v: mi / t });
  const span = Math.max(1, ...pts.map((b) => b.x1 - b.x0));
  return (
    <svg width={width} height={h} style={{ display: "block" }}>
      {lattice.map((l) => <line key={`${l.t}-${l.v}`} x1={px(l.t) - 9} x2={px(l.t) + 9} y1={py(l.v)} y2={py(l.v)} stroke={BLUE} strokeWidth={1.6} />)}
      {pts.map((b, i) => {
        const cn = cnAt(sol, b._m);
        return (
          <circle key={i} cx={px(Math.max(0, cn))} cy={py(Math.min(0.5, b.maf))} r={3 + 7 * Math.sqrt((b.x1 - b.x0) / span)} fill={ORANGE} opacity={0.55}>
            <title>{`chr${b.chr}:${b.start}-${b.end}  CN at slider ${cn.toFixed(2)}; observed minor-allele fraction ${b.maf.toFixed(2)}; fitted solution ${b.major_cn}+${b.minor_cn}`}</title>
          </circle>
        );
      })}
      <line x1={ml} x2={width - mr} y1={h - mb} y2={h - mb} stroke="currentColor" opacity={0.4} />
      {Array.from({ length: Math.floor(maxCn) + 1 }, (_, c) => c).map((c) => <text key={c} x={px(c)} y={h - mb + 14} fontSize={11} textAnchor="middle" fill="currentColor">{c}</text>)}
      {[0, 0.25, 0.5].map((v) => <text key={v} x={ml - 4} y={py(v) + 4} fontSize={10} textAnchor="end" fill="currentColor">{v}</text>)}
      <text x={(ml + width - mr) / 2} y={h - 2} fontSize={11} textAnchor="middle" fill="currentColor">copy number at slider (circles: allelic segments, size by length; blue ticks: achievable minor/total)</text>
    </svg>
  );
}

/** Per-cell ploidy of the group against the rest of the patient: jittered strips with medians. */
export function PloidyStrip({ width, groupCells, restCells, label }) {
  const h = 110;
  const ml = 60, mr = 12;
  const all = [...groupCells, ...restCells].map((c) => c.ploidy).filter(Number.isFinite);
  if (!all.length) return null;
  const hi = Math.max(4, Math.ceil(Math.max(...all)));
  const px = (v) => ml + (v / hi) * (width - ml - mr);
  const jit = (k) => ((Math.sin(k * 12.9898) * 43758.5453) % 1 + 1) % 1;
  const row = (cells, y, color, name) => {
    const s = ploidySummary(cells);
    return (
      <g>
        <text x={ml - 6} y={y + 4} fontSize={11} textAnchor="end" fill="currentColor">{name}</text>
        {cells.map((c, i) => Number.isFinite(c.ploidy) && (
          <circle key={c.cell_id} cx={px(c.ploidy)} cy={y - 14 + jit(i) * 28} r={2.4} fill={color} opacity={0.5}>
            <title>{`${c.cell_id}: ploidy ${c.ploidy}`}</title>
          </circle>
        ))}
        {s.median != null && <line x1={px(s.median)} x2={px(s.median)} y1={y - 17} y2={y + 17} stroke={color} strokeWidth={2.5} />}
      </g>
    );
  };
  return (
    <svg width={width} height={h} style={{ display: "block" }}>
      {row(groupCells, 30, ORANGE, label)}
      {row(restCells, 78, GREY, "rest")}
      <line x1={ml} x2={width - mr} y1={h - 14} y2={h - 14} stroke="currentColor" opacity={0.4} />
      {Array.from({ length: hi + 1 }, (_, v) => v).map((v) => <text key={v} x={px(v)} y={h - 2} fontSize={11} textAnchor="middle" fill="currentColor">{v}</text>)}
    </svg>
  );
}

