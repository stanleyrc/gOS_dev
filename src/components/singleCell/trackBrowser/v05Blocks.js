import React, { useEffect, useMemo, useRef, useState } from "react";
import { Popover, Segmented, Switch } from "antd";
import { bpToPx } from "../../../helpers/singleCell/trackBrowser/locus";
import { formatRate, ratesOfClade } from "../../../helpers/singleCell/trackBrowser/cinEvents";
import { armOf, atacCnInWindow, atacCnMax, genomeLayout, regionsInWindows, residualLanes, residualLines, residualRange } from "../../../helpers/singleCell/trackBrowser/atacV05";
import { COLORS, setupCanvas } from "./draw";

// Spec v0.5 blocks of the track browser: JW-07 clade x plate rates (table), JW-08 atac_residual (clade or time-point
// lanes of region bars with SE) and atac_cn (ATAC-only relative CN per pool, genome CN overlay, genome-wide or windows).

const TIP = { position: "absolute", background: "rgba(255,255,255,0.97)", border: "1px solid #ccc", borderRadius: 4, padding: "4px 8px", fontSize: 12, pointerEvents: "none", whiteSpace: "pre", zIndex: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.15)", maxWidth: 460 };
const tipLeft = (x, width) => Math.max(0, Math.min(x + 14, width - 470));

function BlockHeader({ title, sub, controls, leftW }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 22, fontSize: 12, borderTop: "1px solid #ddd", flexWrap: "wrap" }}>
      <div style={{ width: leftW - 6, textAlign: "right", paddingRight: 6, fontWeight: 600, flex: "none" }}>{title}</div>
      {sub && <div style={{ color: COLORS.muted }}>{sub}</div>}
      {controls}
    </div>
  );
}

/** JW-07 clade x plate whole-chromosome change rates with intervals (clade_rates.json), or "not available (reason)". */
export function CladeRatesBlock({ rates, clades, groupColor, leftW, width }) {
  const plates = useMemo(() => {
    const order = (p) => {
      const m = `${p}`.match(/T(\d+)/);
      return m ? Number(m[1]) * 10 + (`${p}`.endsWith("B") ? 1 : 0) : 999;
    };
    return [...new Set((rates?.rows || []).map((r) => r.plate))].sort((a, b) => order(a) - order(b));
  }, [rates]);
  if (!rates) return null;
  const shown = clades.filter((c) => (rates.rows || []).some((r) => r.clade === c));
  const extra = [...new Set((rates.rows || []).map((r) => r.clade))].filter((c) => !shown.includes(c));
  const rows = [...shown, ...extra];
  return (
    <div style={{ width, fontSize: 12, borderTop: "1px solid #ddd", padding: "3px 0" }}>
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ width: leftW - 6, textAlign: "right", paddingRight: 6, fontWeight: 600, flex: "none" }}>JW-07 rates</div>
        {rates.notAvailable ? (
          <div style={{ color: "#8a5a00" }}>{/^not available/i.test(rates.notAvailable) ? rates.notAvailable : `not available (${rates.notAvailable})`}</div>
        ) : (
          <div style={{ overflowX: "auto", maxWidth: width - leftW }}>
            <div style={{ color: COLORS.muted, marginBottom: 2 }}>{rates.unit || "rate"} per clade x plate: rate [interval] (n cells)</div>
            <table style={{ borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "0 6px" }}>clade</th>
                  {plates.map((p) => <th key={p} style={{ textAlign: "left", padding: "0 6px", fontWeight: 500 }}>{p}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const byPlate = new Map(ratesOfClade(rates, c).map((r) => [r.plate, r]));
                  return (
                    <tr key={c} style={{ borderTop: "1px solid #eee" }}>
                      <td style={{ padding: "0 6px", borderLeft: `5px solid ${groupColor(c)}` }}>{c}</td>
                      {plates.map((p) => {
                        const r = byPlate.get(p);
                        return <td key={p} style={{ padding: "0 6px", whiteSpace: "nowrap", color: r && r.rate != null ? COLORS.ink : COLORS.muted }} title={r && r.p != null ? `per-chromosome probability ${r.p.toPrecision(3)}` : ""}>{r ? formatRate(r) : "–"}</td>;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {(rates.contrast || []).length > 0 && (
              <div style={{ color: COLORS.muted, marginTop: 2 }}>
                {rates.contrast.map((k, i) => {
                  const f = (v) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v).toFixed(2) : "n/a");
                  return <div key={i}>time-point contrast {`${k.late ?? "late"}`.replace(/\+/g, " + ")} minus {`${k.early ?? "early"}`.replace(/\+/g, " + ")}: bias-adjusted {f(k.diff_bias_adjusted)} [{f(k.adj_lo)}, {f(k.adj_hi)}], p {f(k.p_adjusted)}</div>;
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Rate lines for a clade row tooltip. */
export function cladeRateTitle(rates, clade) {
  if (!rates) return "";
  if (rates.notAvailable) return `JW-07 rates: ${/^not available/i.test(rates.notAvailable) ? rates.notAvailable : `not available (${rates.notAvailable})`}`;
  const rows = ratesOfClade(rates, clade);
  if (!rows.length) return `JW-07 rates: not available (no ${clade} row)`;
  return [`JW-07 ${rates.unit || "rate"}:`, ...rows.map((r) => `  ${r.plate}: ${formatRate(r)}`)].join("\n");
}

/**
 * `atac_residual`: one lane per clade (or per time point, SW620 joint) with a bar per region at the region's
 * interval (height = residual, whisker = ± SE); hover gives the residual, SE, n and the region's q values.
 */
export function AtacResidualBlock({ res, slots, geometry, width, by, onBy, groupColor, laneH = 26 }) {
  const ref = useRef(null);
  const [tip, setTip] = useState(null);
  const { trackLeft, leftW } = geometry;
  const lanes = useMemo(() => residualLanes(res, by), [res, by]);
  const hits = useMemo(() => regionsInWindows(res, slots), [res, slots]);
  const range = useMemo(() => residualRange(lanes, hits), [lanes, hits]);
  const height = Math.max(laneH, lanes.length * laneH);
  const hitBoxes = useRef([]);
  useEffect(() => {
    const ctx = setupCanvas(ref.current, width, height);
    if (!ctx) return;
    const boxes = [];
    lanes.forEach((lane, li) => {
      const y0 = li * laneH;
      const mid = y0 + laneH / 2;
      const half = laneH / 2 - 2;
      ctx.fillStyle = lane.key.startsWith("clade:") ? groupColor(lane.label) : "#999";
      ctx.fillRect(leftW - 10, y0 + 2, 6, laneH - 4);
      ctx.fillStyle = COLORS.ink;
      ctx.font = "11px system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(lane.label, leftW - 14, mid);
      slots.forEach((s) => {
        const x0 = trackLeft + s.x0;
        ctx.fillStyle = li % 2 ? "#f6f6f6" : COLORS.band;
        ctx.fillRect(x0, y0, s.width, laneH);
        ctx.strokeStyle = "#c8c8c8";
        ctx.beginPath();
        ctx.moveTo(x0, mid + 0.5);
        ctx.lineTo(x0 + s.width, mid + 0.5);
        ctx.stroke();
      });
      hits.forEach((h) => {
        const v = lane.values?.get(h.region.id);
        const s = slots[h.slot];
        const xa = trackLeft + s.x0 + Math.max(0, bpToPx(s, h.start));
        const xb = Math.max(xa + 2, trackLeft + s.x0 + Math.min(s.width, bpToPx(s, h.end)));
        boxes.push({ x0: xa, x1: xb, y0, y1: y0 + laneH, lane, region: h.region });
        if (!v || v.resid == null) {
          ctx.fillStyle = "#ddd";
          ctx.fillRect(xa, mid - 1, xb - xa, 2);
          return;
        }
        const hh = (Math.min(Math.abs(v.resid), range) / range) * half;
        ctx.fillStyle = v.resid > 0 ? "#b2182b" : "#2166ac";
        ctx.globalAlpha = h.region.kind === "arm" ? 0.45 : 0.85;
        ctx.fillRect(xa, v.resid > 0 ? mid - hh : mid, xb - xa, Math.max(1, hh));
        ctx.globalAlpha = 1;
        if (v.se != null) {
          const xc = (xa + xb) / 2;
          const ya = mid - (Math.max(-range, Math.min(range, v.resid + v.se)) / range) * half;
          const yb = mid - (Math.max(-range, Math.min(range, v.resid - v.se)) / range) * half;
          ctx.strokeStyle = "#222";
          ctx.beginPath();
          ctx.moveTo(xc + 0.5, ya);
          ctx.lineTo(xc + 0.5, yb);
          ctx.moveTo(xc - 2, ya + 0.5);
          ctx.lineTo(xc + 3, ya + 0.5);
          ctx.moveTo(xc - 2, yb + 0.5);
          ctx.lineTo(xc + 3, yb + 0.5);
          ctx.stroke();
        }
      });
    });
    ctx.fillStyle = COLORS.muted;
    ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    if (slots[0]) {
      ctx.fillText(`+${range}`, trackLeft + slots[0].x0 - 3, 1);
      ctx.textBaseline = "bottom";
      ctx.fillText(`−${range}`, trackLeft + slots[0].x0 - 3, height - 1);
    }
    hitBoxes.current = boxes;
  }, [lanes, hits, range, slots, width, height, laneH, trackLeft, leftW, groupColor]);
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const b = hitBoxes.current.find((h) => x >= h.x0 - 2 && x <= h.x1 + 2 && y >= h.y0 && y <= h.y1);
    setTip(b ? { x, y, text: residualLines(res, b.lane, b.region).join("\n") } : null);
  };
  const timeOk = res?.times?.length > 0;
  return (
    <div style={{ position: "relative", width }}>
      <BlockHeader
        leftW={trackLeft}
        title="ATAC residual"
        sub={`${res.unit}; ${hits.length} of ${res.regions.size} regions in view${hits.length ? "" : " (jump to an amplicon or arm)"}`}
        controls={timeOk ? <Segmented size="small" value={by} onChange={onBy} options={[{ label: "by clade", value: "clade" }, { label: "by time point", value: "time" }]} /> : null}
      />
      <canvas ref={ref} style={{ display: "block" }} onMouseMove={onMove} onMouseLeave={() => setTip(null)} />
      {tip && <div style={{ ...TIP, left: tipLeft(tip.x, width), top: tip.y + 36 }}>{tip.text}</div>}
    </div>
  );
}

/**
 * `atac_cn`: per pool, ATAC-only relative CN at 1 Mb (teal ticks; unusable bins skipped) with the genome CN overlay
 * (black) where present, on the shared windows or genome-wide (all chromosomes across the track width). Hover: the
 * bin and its arm (arm table row when the file has one); the arm table is also one click away.
 */
export function AtacCnBlock({ res, slots, geometry, width, genomeWide, onGenomeWide, chromoBins, onJumpChrom, laneH = 72 }) {
  const ref = useRef(null);
  const [tip, setTip] = useState(null);
  const { trackLeft, gapX } = geometry;
  const trackW = Math.max(50, width - trackLeft - gapX);
  const layout = useMemo(() => (genomeWide ? genomeLayout(res, trackW, chromoBins) : []), [genomeWide, res, trackW, chromoBins]);
  const views = useMemo(() => (genomeWide
    ? layout.map((g) => ({ x0: trackLeft + g.x0, width: g.x1 - g.x0, window: { chrom: g.chrom, start: g.start, end: g.end } }))
    : slots.map((s) => ({ x0: trackLeft + s.x0, width: s.width, window: s.window }))), [genomeWide, layout, slots, trackLeft]);
  const ymax = useMemo(() => atacCnMax(res.pools, views.map((v) => v.window)), [res, views]);
  const height = res.pools.length * laneH;
  useEffect(() => {
    const ctx = setupCanvas(ref.current, width, height);
    if (!ctx) return;
    res.pools.forEach((pool, pi) => {
      const y0 = pi * laneH;
      const top = y0 + 6;
      const ph = laneH - 12;
      const yOf = (v) => top + ph * (1 - Math.max(0, Math.min(ymax, v)) / ymax);
      ctx.fillStyle = COLORS.ink;
      ctx.font = "600 11px system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillText(`${pool.id}`, trackLeft - 28, y0 + 4);
      ctx.font = "10px system-ui, sans-serif";
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(pool.n_cells != null ? `${pool.n_cells} cells` : "cells n/a", trackLeft - 28, y0 + 17);
      ctx.fillText(`ticks 0, 1, ${ymax}`, trackLeft - 28, y0 + 30);
      views.forEach((v, k) => {
        ctx.fillStyle = (genomeWide ? k : pi) % 2 ? "#f4f4f4" : COLORS.band;
        ctx.fillRect(v.x0, y0 + 2, v.width, laneH - 4);
        ctx.strokeStyle = "#cfcfcf";
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(v.x0, yOf(1) + 0.5);
        ctx.lineTo(v.x0 + v.width, yOf(1) + 0.5);
        ctx.stroke();
        ctx.setLineDash([]);
        const span = v.window.end - v.window.start + 1;
        const px = (pos) => v.x0 + ((pos - v.window.start) / span) * v.width;
        const bins = atacCnInWindow(pool, v.window);
        bins.forEach((b) => {
          if (!b.usable) return;
          const xa = px(b.start);
          const xb = Math.max(xa + 1, px(b.end));
          if (b.atac != null) {
            ctx.fillStyle = "#1a9a8a";
            ctx.fillRect(xa, yOf(b.atac) - 1, xb - xa, 2.5);
          }
        });
        ctx.strokeStyle = "#111";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        let open = false;
        bins.forEach((b) => {
          if (!b.usable || b.genome == null) {
            open = false;
            return;
          }
          const y = yOf(b.genome);
          if (!open) ctx.moveTo(px(b.start), y);
          else ctx.lineTo(px(b.start), y);
          ctx.lineTo(px(b.end), y);
          open = true;
        });
        ctx.stroke();
        ctx.lineWidth = 1;
        if (genomeWide && v.width > 12 && pi === 0) {
          ctx.fillStyle = COLORS.muted;
          ctx.font = "10px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillText(v.window.chrom, v.x0 + v.width / 2, y0 + 1);
        }
      });
      ctx.fillStyle = COLORS.muted;
      ctx.font = "10px system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      const xl = (views[0]?.x0 ?? trackLeft) - 3;
      [0, 1, ymax].forEach((t) => ctx.fillText(`${t}`, xl, yOf(t)));
    });
  }, [res, views, ymax, width, height, laneH, trackLeft, genomeWide]);
  const at = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const v = views.find((w) => x >= w.x0 && x <= w.x0 + w.width);
    const pool = res.pools[Math.floor(y / laneH)];
    if (!v || !pool) return null;
    const pos = Math.round(v.window.start + ((x - v.x0) / v.width) * (v.window.end - v.window.start + 1));
    return { x, y, v, pool, pos };
  };
  const onMove = (e) => {
    const h = at(e);
    if (!h) return setTip(null);
    const b = atacCnInWindow(h.pool, { chrom: h.v.window.chrom, start: h.pos, end: h.pos })[0];
    const arm = armOf(h.v.window.chrom, h.pos);
    const ar = arm ? res.arms.get(arm) : null;
    const f = (x) => (x == null ? "not available" : x.toFixed(2));
    const lines = [`${h.pool.id} · chr${h.v.window.chrom}:${h.pos.toLocaleString()}`];
    if (b) lines.push(`bin ${b.start.toLocaleString()}-${b.end.toLocaleString()}: ATAC-only ${f(b.atac)} · genome ${f(b.genome)}${b.usable ? "" : " (bin not usable)"}`);
    else lines.push("no bin here");
    if (arm) lines.push(ar ? `arm ${arm}: pooled ${f(ar.pooled_rel_cn)} (SD across cells ${f(ar.sd_cells)}, ${ar.n_bins ?? "?"} bins)` : `arm ${arm}${res.arms.size ? ": not in the arm table" : ""}`);
    lines.push(res.unit);
    if (genomeWide && onJumpChrom) lines.push("click: open this chromosome");
    return setTip({ x: h.x, y: h.y, text: lines.join("\n") });
  };
  const armTable = res.arms.size ? (
    <div style={{ maxHeight: 360, overflowY: "auto", fontSize: 11 }}>
      <table style={{ borderCollapse: "collapse" }}>
        <thead><tr>{["arm", "pooled rel. CN", "SD cells", "bins"].map((h) => <th key={h} style={{ padding: "0 6px", textAlign: "left" }}>{h}</th>)}</tr></thead>
        <tbody>
          {[...res.arms.values()].map((a) => (
            <tr key={a.arm} style={{ borderTop: "1px solid #eee" }}>
              <td style={{ padding: "0 6px" }}>{a.arm}</td>
              <td style={{ padding: "0 6px", color: a.pooled_rel_cn > 1.1 ? "#b2182b" : a.pooled_rel_cn < 0.9 ? "#2166ac" : COLORS.ink }}>{a.pooled_rel_cn != null ? a.pooled_rel_cn.toFixed(2) : "n/a"}</td>
              <td style={{ padding: "0 6px" }}>{a.sd_cells != null ? a.sd_cells.toFixed(2) : "n/a"}</td>
              <td style={{ padding: "0 6px" }}>{a.n_bins ?? "n/a"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : null;
  return (
    <div style={{ position: "relative", width }}>
      <BlockHeader
        leftW={trackLeft}
        title="ATAC-only CN"
        sub={`relative CN (ATAC-only, no ploidy), ${Math.round(res.binSize / 1e6)} Mb bins: teal = ATAC-only${res.hasGenome ? ", black = genome CN (relative)" : ""}`}
        controls={
          <>
            <span><Switch size="small" checked={genomeWide} onChange={onGenomeWide} /> genome-wide</span>
            {armTable && <Popover trigger="click" title="Arm-level ATAC-only CN (pooled)" content={armTable}><a href="#arm-table" onClick={(e) => e.preventDefault()}>arm table ({res.arms.size})</a></Popover>}
          </>
        }
      />
      <canvas ref={ref} style={{ display: "block", cursor: genomeWide ? "pointer" : "default" }} onMouseMove={onMove} onMouseLeave={() => setTip(null)} onClick={(e) => { const h = at(e); if (h && genomeWide && onJumpChrom) onJumpChrom(h.v.window.chrom); }} />
      {tip && <div style={{ ...TIP, left: tipLeft(tip.x, width), top: tip.y + 36 }}>{tip.text}</div>}
    </div>
  );
}
