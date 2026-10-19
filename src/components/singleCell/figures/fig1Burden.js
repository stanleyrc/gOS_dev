import React, { useCallback, useMemo } from "react";
import FigureCanvas, { jitter, useFigureStyleName } from "./figureCanvas";
import { textRole } from "./figureKit";
import { selectMode } from "./cellSelection";
import useContainerWidth from "../useContainerWidth";
import { figureStyle, formatTick, isPaperStyle, linearTicks } from "../../../helpers/singleCell/figureStyle";
import { PAPER_PATIENT, PAPER_STATE, PAPER_TRUNCAL_COLORS, ramp, rgbHex } from "../../../helpers/singleCell/paperPalette";
import { quantiles } from "../../../helpers/singleCell/figures";
import { mannWhitney } from "../../../helpers/singleCell/figureMath";
import { BURDEN_STATES, fractionAboveMes } from "../../../helpers/singleCell/paperPanels";

const APP_STATE = { AC: "#e8a33d", MES: "#d9534f", NPC: "#4c6fd1", OPC: "#4caf6a" };
const fmtP = (p) => (!Number.isFinite(p) ? "p = –" : p < 1e-3 ? `p = ${p.toExponential(1)}` : `p = ${Number(p.toPrecision(2))}`);

function yAxis(ctx, c, { x, y0, y1, ticks, sy, title, fmt = formatTick }) {
  ctx.strokeStyle = c.text;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(x + 0.5, y0);
  ctx.lineTo(x + 0.5, y1);
  ctx.stroke();
  textRole(ctx, c, "tick", "text");
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ticks.forEach((t) => {
    const y = sy(t);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 3, y);
    ctx.stroke();
    ctx.fillText(fmt(t), x - 5, y);
  });
  textRole(ctx, c, "head", "text");
  ctx.save();
  ctx.translate(12, (y0 + y1) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillText(title, 0, 0);
  ctx.restore();
}

/**
 * Fig 1d: subclonal SNVs per cell (median, IQR) per patient, ordered by the
 * median, over a strip of each patient's truncal SNV count; patients without
 * a per-cell SNV matrix shown as n/a. Click a patient to open it below.
 * rows: [{ patient, med, lo, hi, k, truncal }]; missing: [patient].
 */
export function SubclonalPerPatient({ rows, missing, onSelectPatient }) {
  const [ref, measured] = useContainerWidth(420);
  const width = Math.max(320, Math.min(measured, 460));
  const height = 300;
  const st = figureStyle(useFigureStyleName());
  const sorted = useMemo(() => [...rows].sort((a, b) => a.med - b.med), [rows]);
  const cols = [...sorted.map((r) => r.patient), ...missing];
  const plot = { x0: 52, x1: width - 8, y0: 10, y1: height - 92 };
  const ymax = Math.max(1, ...sorted.map((r) => r.hi)) * 1.08;
  const sy = (v) => plot.y1 - (v / ymax) * (plot.y1 - plot.y0);
  const cw = (plot.x1 - plot.x0) / Math.max(1, cols.length);
  const tr = sorted.map((r) => r.truncal).filter(Number.isFinite);
  const tLo = Math.min(...tr, 1000);
  const tHi = Math.max(...tr, 5000);
  const tcol = useMemo(() => ramp(PAPER_TRUNCAL_COLORS.map((_, k) => tLo + ((tHi - tLo) * k) / 3), PAPER_TRUNCAL_COLORS), [tLo, tHi]);
  const draw = useCallback(
    (ctx, c) => {
      const hits = [];
      yAxis(ctx, c, { x: plot.x0, y0: plot.y0, y1: plot.y1, ticks: linearTicks(0, ymax, 4).filter((t) => t <= ymax), sy, title: "Subclonal SNVs per cell" });
      const stripY = plot.y1 + 6;
      cols.forEach((p, i) => {
        const cx = plot.x0 + cw * (i + 0.5);
        const r = sorted.find((x) => x.patient === p);
        if (r) {
          ctx.strokeStyle = c.text;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(cx, sy(r.lo));
          ctx.lineTo(cx, sy(r.hi));
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(cx, sy(r.med), st.markerR, 0, 2 * Math.PI);
          ctx.fillStyle = c.text;
          ctx.fill();
          ctx.fillStyle = Number.isFinite(r.truncal) ? rgbHex(tcol(r.truncal)) : "#F2F2F2";
          ctx.fillRect(cx - cw * 0.48, stripY, cw * 0.96, 14);
          hits.push({ x0: cx - cw / 2, x1: cx + cw / 2, y0: plot.y0, y1: stripY + 14, r });
        } else {
          ctx.fillStyle = c.dark ? "#333" : "#F2F2F2";
          ctx.fillRect(cx - cw * 0.48, stripY, cw * 0.96, 14);
          textRole(ctx, c, "caption");
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("n/a", cx, stripY + 7);
        }
        textRole(ctx, c, "label", "text");
        ctx.save();
        ctx.translate(cx + 3, stripY + 20);
        ctx.rotate(-Math.PI / 4);
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(p, 0, 0);
        ctx.restore();
      });
      // truncal legend
      const lx = plot.x0 + 90;
      const ly = height - 14;
      textRole(ctx, c, "label", "text");
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText("Truncal SNVs", lx - 6, ly);
      for (let k = 0; k < 60; k += 1) {
        ctx.fillStyle = rgbHex(tcol(tLo + ((tHi - tLo) * k) / 59));
        ctx.fillRect(lx + k * 2, ly - 5, 2.2, 10);
      }
      textRole(ctx, c, "tick", "text");
      ctx.textAlign = "left";
      ctx.fillText(`${formatTick(tLo)} – ${formatTick(tHi)}`, lx + 126, ly);
      return hits;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sorted, missing, width, ymax, cw, st, tcol]
  );
  return (
    <div ref={ref}>
      <FigureCanvas width={width} height={height} draw={draw} ariaLabel="Fig 1d subclonal SNVs per cell" tooltip={(h) => [h.r.patient, ["median (IQR)", `${Math.round(h.r.med)} (${Math.round(h.r.lo)}–${Math.round(h.r.hi)})`], ["tumour cells", h.r.k], ["truncal SNVs", h.r.truncal ?? "–"], "click to open the patient"]} onClick={(h) => onSelectPatient?.(h.r.patient)} />
      <div className="sc-fig-caption">Median and IQR across tumour cells (subclonal sites with genotype 1).{missing.length ? ` No per-cell SNV matrix: ${missing.join(", ")}.` : ""}</div>
    </div>
  );
}

const useStateColors = () => {
  const st = figureStyle(useFigureStyleName());
  return { st, colors: isPaperStyle(st) ? PAPER_STATE : APP_STATE };
};

/**
 * Fig 1f: mutation burden relative to the patient's MES-like median, by cell
 * state (cells as jittered points, boxes, Wilcoxon vs MES). Click a state to
 * select its cells (of the patient with most cells in it). rows: burdenByState output.
 */
export function BurdenByState({ rows, onSelectCells }) {
  const [ref, measured] = useContainerWidth(420);
  const width = Math.max(320, Math.min(measured, 460));
  const height = 320;
  const { st, colors } = useStateColors();
  const plot = { x0: 56, x1: width - 8, y0: 70, y1: height - 40 };
  const rel = rows.map((r) => r.rel);
  const ytop = quantiles(rel, [0.995])[0] || 1.5;
  const ybot = quantiles(rel, [0.002])[0] || 0.5;
  const sy = (v) => plot.y1 - ((v - ybot) / (ytop - ybot)) * (plot.y1 - plot.y0);
  const cw = (plot.x1 - plot.x0) / BURDEN_STATES.length;
  const tests = useMemo(() => BURDEN_STATES.slice(1).map((s) => ({ s, p: mannWhitney(rows.filter((r) => r.state === s).map((r) => r.rel), rows.filter((r) => r.state === "MES").map((r) => r.rel)).p })), [rows]);
  const draw = useCallback(
    (ctx, c) => {
      const hits = [];
      yAxis(ctx, c, { x: plot.x0, y0: plot.y0, y1: plot.y1, ticks: linearTicks(ybot, ytop, 4), sy, title: "Mutation burden / MES median" });
      ctx.save();
      ctx.beginPath();
      ctx.rect(plot.x0 + 1, plot.y0 - 2, plot.x1 - plot.x0, plot.y1 - plot.y0 + 2);
      ctx.clip();
      BURDEN_STATES.forEach((s, i) => {
        const cx = plot.x0 + cw * (i + 0.5);
        const v = rows.filter((r) => r.state === s);
        ctx.fillStyle = colors[s];
        ctx.globalAlpha = 0.55;
        v.forEach((r, k) => ctx.fillRect(cx + jitter(k * 7 + i) * cw * 0.54 - 1, sy(r.rel) - 1, 2, 2));
        ctx.globalAlpha = 1;
        const [q1, q2, q3] = quantiles(v.map((r) => r.rel), [0.25, 0.5, 0.75]);
        if (Number.isFinite(q2)) {
          const bw = cw * 0.55;
          ctx.fillStyle = colors[s];
          ctx.globalAlpha = 0.25;
          ctx.fillRect(cx - bw / 2, sy(q3), bw, sy(q1) - sy(q3));
          ctx.globalAlpha = 1;
          ctx.strokeStyle = c.text;
          ctx.lineWidth = 0.8;
          ctx.strokeRect(cx - bw / 2, sy(q3), bw, sy(q1) - sy(q3));
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(cx - bw / 2, sy(q2));
          ctx.lineTo(cx + bw / 2, sy(q2));
          ctx.stroke();
        }
        hits.push({ x0: cx - cw / 2, x1: cx + cw / 2, y0: plot.y0, y1: plot.y1, s, n: v.length, rows: v });
      });
      ctx.restore();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = c.text;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(plot.x0, sy(1));
      ctx.lineTo(plot.x1, sy(1));
      ctx.stroke();
      ctx.setLineDash([]);
      // brackets vs MES
      const x1m = plot.x0 + cw * 0.5;
      tests.forEach((t, k) => {
        const y = plot.y0 - 8 - k * 20;
        const xi = plot.x0 + cw * (BURDEN_STATES.indexOf(t.s) + 0.5);
        ctx.strokeStyle = c.text;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x1m, y + 4);
        ctx.lineTo(x1m, y);
        ctx.lineTo(xi, y);
        ctx.lineTo(xi, y + 4);
        ctx.stroke();
        textRole(ctx, c, "tick", "text");
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(fmtP(t.p), (x1m + xi) / 2, y - 1);
      });
      textRole(ctx, c, "label", "text");
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      BURDEN_STATES.forEach((s, i) => ctx.fillText(s, plot.x0 + cw * (i + 0.5), plot.y1 + 5));
      textRole(ctx, c, "head", "text");
      ctx.fillText("Cell state", (plot.x0 + plot.x1) / 2, plot.y1 + 21);
      return hits;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, width, colors, st, tests, ytop, ybot]
  );
  const patients = new Set(rows.map((r) => r.patient));
  return (
    <div ref={ref}>
      <FigureCanvas
        width={width}
        height={height}
        draw={draw}
        ariaLabel="Fig 1f mutation burden by cell state"
        tooltip={(h) => [`${h.s}-like`, ["cells", h.n], ...(h.s !== "MES" ? [["vs MES", fmtP(tests.find((t) => t.s === h.s)?.p)]] : []), "click to select these cells (largest patient)"]}
        onClick={(h, event) => {
          const by = new Map();
          h.rows.forEach((r) => by.set(r.patient, [...(by.get(r.patient) || []), r.cell]));
          const [p, ids] = [...by.entries()].sort((a, b) => b[1].length - a[1].length)[0] || [];
          if (p) onSelectCells?.(p, ids, { label: `${ids.length} ${p} ${h.s}-like cells (Fig 1f)`, mode: selectMode(event) });
        }}
      />
      <div className="sc-fig-caption">{rows.length.toLocaleString()} cells, {patients.size} patients (≥ 3 MES-like cells); corrected TMB / the patient&apos;s MES-like median; Wilcoxon vs MES.</div>
    </div>
  );
}

/** Fig 1g: per patient, fraction of each state's cells above the MES-like median (lines). Click a point to select those cells. */
export function FractionAboveMes({ rows, onSelectCells }) {
  const [ref, measured] = useContainerWidth(420);
  const width = Math.max(320, Math.min(measured, 440));
  const height = 320;
  const { st } = useStateColors();
  const paper = isPaperStyle(st);
  const g = useMemo(() => fractionAboveMes(rows), [rows]);
  const patients = [...new Set(g.map((x) => x.patient))];
  const fallback = ["#8c1d1d", "#b07a2b", "#2e7d4f", "#1b8f7a", "#1f6f9f", "#5a55a8", "#b03a9a", "#c0508e", "#7a7a7a"];
  const colOf = (p, k) => (paper ? PAPER_PATIENT[p] : null) || fallback[k % fallback.length];
  const plot = { x0: 56, x1: width - 8, y0: 12, y1: height - 92 };
  const sy = (v) => plot.y1 - v * (plot.y1 - plot.y0);
  const cw = (plot.x1 - plot.x0) / BURDEN_STATES.length;
  const draw = useCallback(
    (ctx, c) => {
      const hits = [];
      yAxis(ctx, c, { x: plot.x0, y0: plot.y0, y1: plot.y1, ticks: [0, 0.25, 0.5, 0.75, 1], sy, title: "Fraction above MES median", fmt: (v) => v.toFixed(2) });
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = c.text;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(plot.x0, sy(0.5));
      ctx.lineTo(plot.x1, sy(0.5));
      ctx.stroke();
      ctx.setLineDash([]);
      patients.forEach((p, k) => {
        const pts = BURDEN_STATES.map((s, i) => ({ s, i, x: g.find((z) => z.patient === p && z.state === s) })).filter((z) => z.x);
        ctx.strokeStyle = colOf(p, k);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        pts.forEach((z, j) => (j ? ctx.lineTo(plot.x0 + cw * (z.i + 0.5), sy(z.x.frac)) : ctx.moveTo(plot.x0 + cw * (z.i + 0.5), sy(z.x.frac))));
        ctx.stroke();
        pts.forEach((z) => {
          const x = plot.x0 + cw * (z.i + 0.5);
          ctx.beginPath();
          ctx.arc(x, sy(z.x.frac), st.markerR * 0.9, 0, 2 * Math.PI);
          ctx.fillStyle = colOf(p, k);
          ctx.fill();
          hits.push({ x0: x - 6, x1: x + 6, y0: sy(z.x.frac) - 6, y1: sy(z.x.frac) + 6, z: z.x });
        });
      });
      textRole(ctx, c, "label", "text");
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      BURDEN_STATES.forEach((s, i) => ctx.fillText(s, plot.x0 + cw * (i + 0.5), plot.y1 + 5));
      textRole(ctx, c, "head", "text");
      ctx.fillText("Cell state", (plot.x0 + plot.x1) / 2, plot.y1 + 21);
      // legend: patients, 3 per row
      textRole(ctx, c, "label", "text");
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      patients.forEach((p, k) => {
        const lx = plot.x0 + (k % 3) * ((plot.x1 - plot.x0) / 3);
        const ly = plot.y1 + 46 + Math.floor(k / 3) * 16;
        ctx.strokeStyle = colOf(p, k);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx + 14, ly);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(lx + 7, ly, 3, 0, 2 * Math.PI);
        ctx.fillStyle = colOf(p, k);
        ctx.fill();
        ctx.fillStyle = c.text;
        ctx.fillText(p, lx + 18, ly);
      });
      return hits;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [g, width, st, paper]
  );
  return (
    <div ref={ref}>
      <FigureCanvas
        width={width}
        height={height}
        draw={draw}
        ariaLabel="Fig 1g fraction above the MES median"
        tooltip={(h) => [`${h.z.patient} · ${h.z.state}-like`, ["above MES median", `${h.z.above} / ${h.z.n}`], "click to select these cells"]}
        onClick={(h, event) => {
          const ids = rows.filter((r) => r.patient === h.z.patient && r.state === h.z.state && r.rel > 1).map((r) => r.cell);
          if (ids.length) onSelectCells?.(h.z.patient, ids, { label: `${ids.length} ${h.z.patient} ${h.z.state}-like cells above the MES median`, mode: selectMode(event) });
        }}
      />
      <div className="sc-fig-caption">Per patient, states with ≥ 3 cells; dashed: half the cells above the MES-like median.</div>
    </div>
  );
}
