import React from "react";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import { SHAPES, sigColor, symlog } from "../../../helpers/singleCell/mutJunctionsContinuous";
import usePlotTheme from "../usePlotTheme";
import useContainerWidth from "../useContainerWidth";

const M = { l: 56, r: 14, t: 10 };
const STRIP_ROW = 16;
const RATE_H = 190;

const fmtKb = (bp) => (Math.abs(bp) >= 1000 ? `${(bp / 1000).toFixed(Math.abs(bp) >= 10000 ? 0 : 1)} kb` : `${bp} bp`);

function Symbol({ shape, x, y, r, fill, stroke }) {
  const open = shape.endsWith("-open");
  const f = open ? "none" : fill;
  const s = open ? fill : stroke;
  const base = shape.replace("-open", "");
  if (base === "square") return <rect x={x - r} y={y - r} width={2 * r} height={2 * r} fill={f} stroke={s} strokeWidth={open ? 1.5 : 0.5} />;
  if (base === "triangle") return <path d={`M${x},${y - r * 1.2} L${x + r * 1.1},${y + r * 0.8} L${x - r * 1.1},${y + r * 0.8} z`} fill={f} stroke={s} strokeWidth={0.5} />;
  if (base === "diamond") return <path d={`M${x},${y - r * 1.3} L${x + r},${y} L${x},${y + r * 1.3} L${x - r},${y} z`} fill={f} stroke={s} strokeWidth={0.5} />;
  if (base === "cross") return <path d={`M${x - r},${y - r} L${x + r},${y + r} M${x - r},${y + r} L${x + r},${y - r}`} stroke={fill} strokeWidth={2} />;
  if (base === "star") return <path d={`M${x},${y - r * 1.3} L${x + r * 0.4},${y - r * 0.3} L${x + r * 1.3},${y - r * 0.3} L${x + r * 0.6},${y + r * 0.3} L${x + r * 0.9},${y + r * 1.3} L${x},${y + r * 0.7} L${x - r * 0.9},${y + r * 1.3} L${x - r * 0.6},${y + r * 0.3} L${x - r * 1.3},${y - r * 0.3} L${x - r * 0.4},${y - r * 0.3} z`} fill={f} stroke={s} strokeWidth={0.5} />;
  return <circle cx={x} cy={y} r={r} fill={f} stroke={s} strokeWidth={open ? 1.5 : 0.5} />;
}

/**
 * Signed distance to the breakend (cis right, trans left): a strip of SNVs (one row per patient, shape by patient,
 * colour by assigned signature) over a rate panel (SNVs per callable kb, raw or CN-adjusted): a kernel-smoothed line per
 * side or bars at the chosen bin size, the CN-matched expected rate as a dashed line and the genome-wide background as a band.
 */
export default function MutJunctionDistancePlot({ points, patients, shapeOrder = null, smooth = null, bins = null, background = null, zoom = 5000, axis = "linear", cn = false, onPoint = null }) {
  const theme = usePlotTheme();
  const [ref, width] = useContainerWidth(700);
  const W = Math.max(360, width);
  const half = (W - M.l - M.r) / 2;
  const cx = M.l + half;
  const px = (x) => {
    const c = Math.max(-zoom, Math.min(zoom, x));
    return axis === "log" ? cx + (symlog(c) / symlog(zoom)) * half : cx + (c / zoom) * half;
  };
  const stripH = Math.max(1, patients.length) * STRIP_ROW + 8;
  const y0 = M.t + stripH + 18;
  const H = y0 + RATE_H + 44;
  const vis = (d) => d <= zoom;
  const rateVals = [];
  if (smooth) smooth.x.forEach((d, i) => vis(d) && rateVals.push(smooth.cis[i], smooth.trans[i], smooth.bgCis[i], smooth.bgTrans[i]));
  if (bins) bins.forEach((b) => b.lo < zoom && rateVals.push(cn ? b.cis.cn.rate : b.cis.rate, cn ? b.trans.cn.rate : b.trans.rate, cn ? b.bgCn : b.bg));
  const bgRow = background ? (cn ? background.cn : background.raw) : null;
  if (bgRow?.hi != null) rateVals.push(bgRow.hi);
  const top = Math.max(1e-3, ...rateVals.filter((v) => Number.isFinite(v))) * 1.15;
  const sy = (v) => y0 + RATE_H - (Math.min(v, top) / top) * RATE_H;
  const xticks = (axis === "log" ? [100, 1000, 5000, 10000, 50000] : [zoom / 2, zoom]).filter((t) => t <= zoom);
  const prow = Object.fromEntries(patients.map((p, i) => [p, i]));
  const shapeOf = (p) => SHAPES[Math.max(0, (shapeOrder || patients).indexOf(p)) % SHAPES.length];
  const line = (xs, ys, sign) =>
    xs
      .map((d, i) => (vis(d) && ys[i] != null ? `${px(sign * d).toFixed(1)},${sy(ys[i]).toFixed(1)}` : null))
      .filter(Boolean)
      .join(" ");
  return (
    <div ref={ref} style={{ width: "100%" }}>
      <svg width={W} height={H} role="img" aria-label="SNVs by signed distance to junction breakends, cis right and trans left">
        <title>SNVs by signed distance to junction breakends (cis = fused side, right; trans = other side, left)</title>
        {/* strip */}
        {patients.map((p, i) => (
          <g key={p}>
            <line x1={M.l} x2={W - M.r} y1={M.t + i * STRIP_ROW + STRIP_ROW / 2} y2={M.t + i * STRIP_ROW + STRIP_ROW / 2} stroke={theme.grid} />
            <Symbol shape={shapeOf(p)} x={10} y={M.t + i * STRIP_ROW + STRIP_ROW / 2} r={4} fill={theme.muted} stroke={theme.muted} />
            <text x={18} y={M.t + i * STRIP_ROW + STRIP_ROW / 2} dy="0.35em" fontSize={TYPE.tick - 1} fill={theme.textSecondary}>{p}</text>
          </g>
        ))}
        {points.filter((p) => Math.abs(p.x) <= zoom).map((p, k) => {
          const row = prow[p.patient] ?? 0;
          const jitter = ((k * 7919) % 9) - 4;
          return (
            <g key={`${p.patient}|${p.snv}|${p.breakend}`} style={{ cursor: onPoint ? "pointer" : "default" }} onClick={() => onPoint && onPoint(p)}>
              <title>{`${p.patient} ${p.snv} (${p.gene || "-"}): ${p.side} ${fmtKb(p.dist)} from ${p.breakend} (${p.cls}); context ${p.context}; signature ${p.sig || "n/a"}${p.sig_post?.[p.sig] != null ? ` (p=${p.sig_post[p.sig].toFixed(2)})` : ""}; CN ${p.cn ?? "n/a"}; carriers shared ${p.n_shared}/${p.n_snv_cells}`}</title>
              <Symbol shape={shapeOf(p.patient)} x={px(p.x)} y={M.t + row * STRIP_ROW + STRIP_ROW / 2 + jitter * 0.6} r={3.6} fill={sigColor(p.sig)} stroke={theme.panel} />
            </g>
          );
        })}
        <line x1={cx} x2={cx} y1={M.t} y2={y0 + RATE_H} stroke={theme.text} strokeDasharray="2 2" />
        <text x={cx - 6} y={y0 - 4} textAnchor="end" fontSize={TYPE.tick} fill={theme.textSecondary}>trans (other side)</text>
        <text x={cx + 6} y={y0 - 4} fontSize={TYPE.tick} fill={theme.textSecondary}>cis (fused side)</text>
        {/* rate panel */}
        <line x1={M.l} x2={W - M.r} y1={y0 + RATE_H} y2={y0 + RATE_H} stroke={theme.axis} />
        <line x1={M.l} x2={M.l} y1={y0} y2={y0 + RATE_H} stroke={theme.axis} />
        {[0, top / 2, top].map((v) => (
          <g key={v}>
            <line x1={M.l - 4} x2={M.l} y1={sy(v)} y2={sy(v)} stroke={theme.axis} />
            <text x={M.l - 6} y={sy(v)} dy="0.35em" textAnchor="end" fontSize={TYPE.tick} fill={theme.muted}>{v >= 1 ? v.toFixed(1) : v.toFixed(3)}</text>
          </g>
        ))}
        <text x={12} y={y0 + RATE_H / 2} transform={`rotate(-90 12 ${y0 + RATE_H / 2})`} textAnchor="middle" fontSize={TYPE.tick} fill={theme.textSecondary}>
          {cn ? "SNVs / diploid-equiv. kb" : "SNVs / callable kb"}
        </text>
        {bgRow?.rate != null && (
          <g>
            <rect x={M.l} y={sy(bgRow.hi)} width={W - M.l - M.r} height={Math.max(1, sy(bgRow.lo) - sy(bgRow.hi))} fill={theme.warn} opacity={0.12} />
            <line x1={M.l} x2={W - M.r} y1={sy(bgRow.rate)} y2={sy(bgRow.rate)} stroke={theme.warn} strokeWidth={1} opacity={0.6} />
          </g>
        )}
        {smooth && (
          <g>
            <polyline points={line(smooth.x, smooth.bgCis, 1)} fill="none" stroke={theme.warn} strokeDasharray="4 3" strokeWidth={1.3} />
            <polyline points={line(smooth.x, smooth.bgTrans, -1)} fill="none" stroke={theme.warn} strokeDasharray="4 3" strokeWidth={1.3} />
            <polyline points={line(smooth.x, smooth.cis, 1)} fill="none" stroke={theme.accent} strokeWidth={2} />
            <polyline points={line(smooth.x, smooth.trans, -1)} fill="none" stroke={theme.magenta} strokeWidth={2} />
          </g>
        )}
        {bins &&
          bins
            .filter((b) => b.lo < zoom)
            .map((b) => {
              const draw = (sd, sign) => {
                const r = cn ? b[sd].cn : b[sd];
                if (r.rate == null) return null;
                const xa = px(sign * b.lo);
                const xb = px(sign * Math.min(b.hi, zoom));
                const x = Math.min(xa, xb) + 1;
                const w = Math.max(1, Math.abs(xb - xa) - 2);
                const mid = x + w / 2;
                return (
                  <g key={sd}>
                    <title>{`${sd} ${fmtKb(b.lo)}-${fmtKb(b.hi)}: ${b[sd].k} SNVs over ${(b[sd].L / 1e3).toFixed(1)} callable kb (mean CN ${b[sd].meanCn?.toFixed(2) ?? "n/a"}); ${r.rate.toFixed(3)}/kb (95% CI ${r.lo.toFixed(3)}-${r.hi.toFixed(3)})`}</title>
                    <rect x={x} y={sy(r.rate)} width={w} height={Math.max(0, y0 + RATE_H - sy(r.rate))} fill={sd === "cis" ? theme.accent : theme.magenta} opacity={0.75} />
                    {w > 6 && <line x1={mid} x2={mid} y1={sy(r.lo)} y2={sy(r.hi)} stroke={theme.text} />}
                  </g>
                );
              };
              const bgv = cn ? b.bgCn : b.bg;
              return (
                <g key={b.lo}>
                  {draw("cis", 1)}
                  {draw("trans", -1)}
                  {bgv != null && (
                    <>
                      <line x1={px(b.lo)} x2={px(Math.min(b.hi, zoom))} y1={sy(bgv)} y2={sy(bgv)} stroke={theme.warn} strokeDasharray="4 3" />
                      <line x1={px(-b.lo)} x2={px(-Math.min(b.hi, zoom))} y1={sy(bgv)} y2={sy(bgv)} stroke={theme.warn} strokeDasharray="4 3" />
                    </>
                  )}
                </g>
              );
            })}
        {[...xticks.map((t) => -t), 0, ...xticks].map((t) => (
          <g key={t}>
            <line x1={px(t)} x2={px(t)} y1={y0 + RATE_H} y2={y0 + RATE_H + 4} stroke={theme.axis} />
            <text x={px(t)} y={y0 + RATE_H + 16} textAnchor="middle" fontSize={TYPE.tick} fill={theme.muted}>{t === 0 ? "0" : fmtKb(Math.abs(t))}</text>
          </g>
        ))}
        <text x={cx} y={y0 + RATE_H + 32} textAnchor="middle" fontSize={TYPE.tick} fill={theme.textSecondary}>distance from the breakpoint ({axis === "log" ? "log scale" : "linear"})</text>
      </svg>
      <div style={{ fontSize: TYPE.tick, color: theme.muted }}>
        <span style={{ display: "inline-block", width: 16, borderTop: `2px solid ${theme.accent}`, margin: "0 4px 3px 0" }} />cis
        <span style={{ display: "inline-block", width: 16, borderTop: `2px solid ${theme.magenta}`, margin: "0 4px 3px 12px" }} />trans
        <span style={{ display: "inline-block", width: 16, borderTop: `2px dashed ${theme.warn}`, margin: "0 4px 3px 12px" }} />expected from the CN-matched background
        <span style={{ display: "inline-block", width: 14, height: 8, background: theme.warn, opacity: 0.25, margin: "0 4px 0 12px" }} />genome background rate (95% CI)
        <span style={{ marginLeft: 12 }}>points: one per SNV x breakend, coloured by assigned signature, shape by patient</span>
      </div>
    </div>
  );
}
