import React, { useCallback, useMemo } from "react";
import FigureCanvas, { jitter, useFigureStyleName } from "./figureCanvas";
import { textRole } from "./figureKit";
import { selectMode } from "./cellSelection";
import useContainerWidth from "../useContainerWidth";
import { figureStyle, isPaperStyle } from "../../../helpers/singleCell/figureStyle";
import { PAPER_COMBO, paperAmpColor } from "../../../helpers/singleCell/paperPalette";
import { geneSetColor } from "../../../helpers/singleCell/figures";
import { quantiles } from "../../../helpers/singleCell/figures";
import { classCombinations, linearKde, upsetColumns } from "../../../helpers/singleCell/paperPanels";

const CN_MAX = 210; // the paper clips the copy-number axis at 210 (ticks 0-200)
const CN_TICKS = [0, 50, 100, 150, 200];
const BAND = "#E9E9E9";

const useColors = () => {
  const st = figureStyle(useFigureStyleName());
  const paper = isPaperStyle(st);
  const colorOf = useCallback((cls) => (paper ? paperAmpColor(cls) : `${cls}`.includes("+") ? "#9B8AAE" : geneSetColor(cls)), [paper]);
  return { st, paper, colorOf };
};

function patientBands(rows) {
  const out = [];
  rows.forEach((r, i) => {
    const last = out[out.length - 1];
    if (last && last.patient === r.patient) last.r1 = i;
    else out.push({ patient: r.patient, r0: i, r1: i });
  });
  return out;
}

/**
 * Fig 3A (paper definition): per patient, one row per amplicon class (per-cell
 * amplified gene cluster, CN >= 10): copy-number violin (linear, 0-200) with
 * box and cells, and the number of graph-level amplicon structures.
 * Drag along a violin to select cells in that copy range; click a cell dot
 * for that cell; click the row label / bar for the class carriers.
 * data: parseAmpliconStructures output.
 */
export function AmpliconClassViolins({ data, selection, onSelectCells, onSelectClass }) {
  const [ref, measured] = useContainerWidth(700);
  const width = Math.max(460, Math.min(measured, 760));
  const { st, colorOf } = useColors();
  const ROW = 30;
  const TOP = 44;
  const PAT = 70;
  const LAB = 118;
  const BARW = 130;
  const rows = useMemo(() => data.patients.flatMap((p) => p.classes.map((c) => ({ patient: p.patient, ...c }))), [data]);
  const height = TOP + rows.length * ROW + 8;
  const vx0 = PAT + LAB + 10;
  const vx1 = width - BARW - 18;
  const bx0 = width - BARW;
  const bx1 = width - 22;
  const maxS = Math.max(1, ...rows.map((r) => r.nStructures || 0));
  const sx = useCallback((v) => vx0 + (Math.min(CN_MAX, Math.max(0, v)) / CN_MAX) * (vx1 - vx0), [vx0, vx1]);
  const inv = (x) => ((x - vx0) / (vx1 - vx0)) * CN_MAX;
  const bxs = (v) => bx0 + (v / (maxS * 1.15)) * (bx1 - bx0);
  const geo = useMemo(() => rows.map((r) => ({ kde: linearKde(r.cn, 0, CN_MAX, 72), q: quantiles(r.cn.filter(Number.isFinite), [0.25, 0.5, 0.75]) })), [rows]);
  const selKey = selection ? `${selection.patient}:${selection.cells.size}` : "";

  const draw = useCallback(
    (ctx, c) => {
      const hits = [];
      const y0 = TOP;
      const y1 = TOP + rows.length * ROW;
      // patient bands (alternate grey), patient names, divider
      patientBands(rows).forEach((b, k) => {
        if (k % 2 === 0) {
          ctx.fillStyle = c.dark ? "#2a2a2a" : BAND;
          ctx.fillRect(0, y0 + b.r0 * ROW, width, (b.r1 - b.r0 + 1) * ROW);
        }
        textRole(ctx, c, "label", "text");
        ctx.textAlign = "left";
        ctx.fillText(b.patient, 4, y0 + ((b.r0 + b.r1 + 1) / 2) * ROW);
      });
      ctx.strokeStyle = c.text;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(PAT + 0.5, y0);
      ctx.lineTo(PAT + 0.5, y1);
      ctx.stroke();
      // headers and top axes
      textRole(ctx, c, "head", "text");
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("Gene(s) in amplicon", PAT + LAB / 2, 16);
      ctx.fillText("Copy number", (vx0 + vx1) / 2, 16);
      ctx.fillText("Amplicon structures", (bx0 + bx1) / 2, 16);
      textRole(ctx, c, "tick", "text");
      const axis = (x0, x1, ticks, scale) => {
        ctx.strokeStyle = c.text;
        ctx.beginPath();
        ctx.moveTo(x0, y0 - 0.5);
        ctx.lineTo(x1, y0 - 0.5);
        ctx.stroke();
        ticks.forEach((t) => {
          const x = scale(t);
          ctx.beginPath();
          ctx.moveTo(x, y0);
          ctx.lineTo(x, y0 - 3);
          ctx.stroke();
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillText(`${t}`, x, y0 - 5);
        });
      };
      axis(vx0, vx1, CN_TICKS, sx);
      const sTicks = [];
      const step = maxS > 10 ? 5 : maxS > 5 ? 2 : 1;
      for (let t = 0; t <= maxS * 1.1; t += step) sTicks.push(t);
      axis(bx0, bx1, sTicks, bxs);
      ctx.textBaseline = "middle";
      const sel = selection?.cells;
      rows.forEach((r, i) => {
        const cy = y0 + i * ROW + ROW / 2;
        const col = colorOf(r.cls);
        // label: class and cell count
        textRole(ctx, c, "label", "text");
        ctx.textAlign = "right";
        ctx.fillText(r.cls, PAT + LAB, cy - 4);
        textRole(ctx, c, "caption");
        ctx.fillText(`(${r.nCells})`, PAT + LAB, cy + 8);
        hits.push({ x0: PAT, x1: PAT + LAB + 4, y0: cy - ROW / 2, y1: cy + ROW / 2, kind: "row", r });
        // violin (scale = width)
        const half = ROW * 0.42;
        const kd = geo[i].kde;
        ctx.beginPath();
        kd.forEach((p, k) => (k ? ctx.lineTo(sx(p.x), cy - p.d * half) : ctx.moveTo(sx(p.x), cy - p.d * half)));
        for (let k = kd.length - 1; k >= 0; k -= 1) ctx.lineTo(sx(kd[k].x), cy + kd[k].d * half);
        ctx.closePath();
        ctx.fillStyle = col;
        ctx.globalAlpha = st.areaAlpha;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "#262626";
        ctx.lineWidth = 0.4;
        ctx.stroke();
        // cells
        r.cn.forEach((v, k) => {
          if (!Number.isFinite(v)) return;
          const on = sel && selection.patient === r.patient && sel.has(r.cells[k]);
          ctx.fillStyle = on ? "#1677ff" : c.dark ? "#ddd" : "#262626";
          ctx.globalAlpha = on ? 1 : 0.55;
          ctx.fillRect(sx(v) - (on ? 1.4 : 0.8), cy + jitter(k) * half * 0.9 - (on ? 1.4 : 0.8), on ? 2.8 : 1.6, on ? 2.8 : 1.6);
        });
        ctx.globalAlpha = 1;
        // box: IQR and median
        const [q1, q2, q3] = geo[i].q;
        if (Number.isFinite(q2)) {
          ctx.strokeStyle = "#262626";
          ctx.lineWidth = 0.6;
          ctx.strokeRect(sx(q1), cy - 3, Math.max(1, sx(q3) - sx(q1)), 6);
          ctx.beginPath();
          ctx.moveTo(sx(q2), cy - 3);
          ctx.lineTo(sx(q2), cy + 3);
          ctx.stroke();
        }
        hits.push({ x0: vx0, x1: vx1, y0: cy - ROW / 2, y1: cy + ROW / 2, kind: "violin", r });
        // structures bar
        if (r.nStructures != null) {
          ctx.fillStyle = col;
          ctx.fillRect(bx0, cy - ROW * 0.33, bxs(r.nStructures) - bx0, ROW * 0.66);
          textRole(ctx, c, "tick", "text");
          ctx.textAlign = "left";
          ctx.fillText(`${r.nStructures}`, bxs(r.nStructures) + 3, cy);
        } else {
          textRole(ctx, c, "caption");
          ctx.textAlign = "left";
          ctx.fillText("not available", bx0 + 2, cy);
        }
        hits.push({ x0: bx0, x1: bx1, y0: cy - ROW / 2, y1: cy + ROW / 2, kind: "row", r });
      });
      return hits;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, geo, width, sx, colorOf, st, selKey, maxS]
  );

  const rowAt = (y) => rows[Math.floor((y - TOP) / ROW)] || null;
  return (
    <div ref={ref}>
      <FigureCanvas
        width={width}
        height={height}
        draw={draw}
        ariaLabel="Fig 3A amplicon classes and structures"
        tooltip={(h) => {
          const n = h.r.cells.length;
          const [, med] = quantiles(h.r.cn.filter(Number.isFinite), [0.25, 0.5]);
          return [`${h.r.patient} · ${h.r.cls}`, ["cells", `${n}`], ["median CN", Number.isFinite(med) ? med.toFixed(0) : "–"], ["amplicon structures", h.r.nStructures ?? "not available"], h.kind === "violin" ? "drag along the violin to select a copy range" : "click to select the class's cells"];
        }}
        onClick={(h, event) => onSelectClass?.(h.r.patient, h.r.cls, h.r.cells, event)}
        onDragStart={(x, y) => {
          const r = rowAt(y);
          if (!r || x < vx0 || x > vx1) return null;
          const i = rows.indexOf(r);
          return { mode: "band-x", x0: vx0, x1: vx1, y0: TOP + i * ROW, y1: TOP + (i + 1) * ROW };
        }}
        onDragEnd={({ a, b }, event) => {
          const r = rowAt(a[1]);
          if (!r) return;
          const lo = inv(Math.min(a[0], b[0]));
          const hi = inv(Math.max(a[0], b[0]));
          const ids = r.cells.filter((id, k) => r.cn[k] >= lo && r.cn[k] <= hi);
          if (ids.length) onSelectCells?.(r.patient, ids, { label: `${ids.length} ${r.cls} cells, CN ${Math.round(lo)}-${Math.round(hi)}`, mode: selectMode(event) });
        }}
      />
      <div className="sc-fig-caption">
        Classes: per-cell amplified gene clusters (JaBbA graphs, mean CN ≥ 10, ≥ 5 cells). Structures: graph-level amplicon structures (cells clustered by the Jaccard distance of their ALT junctions, cut 0.25).
        {data.notAvailable.length ? ` No amplicon clusters: ${data.notAvailable.map((x) => x.patient).join(", ")}.` : ""} Copy number axis clipped at {CN_MAX}.
      </div>
    </div>
  );
}

/**
 * Fig 3B (paper definition): combinations of amplicon classes per cell (upset),
 * share of the patient's tumour cells with copy-number profiles. Click a row to
 * select those cells.
 */
export function AmpliconClassUpset({ data, onSelectCells }) {
  const [ref, measured] = useContainerWidth(560);
  const { colorOf, paper } = useColors();
  const blocks = useMemo(() => classCombinations(data.patients).filter((b) => b.rows.length), [data]);
  const cols = useMemo(() => upsetColumns(blocks), [blocks]);
  const rows = useMemo(() => blocks.flatMap((b) => b.rows.map((r) => ({ patient: b.patient, ...r }))), [blocks]);
  const width = Math.max(420, Math.min(measured, 640));
  const ROW = 20;
  const PAT = 72;
  const COL = 18;
  const HEAD = 120;
  const ux0 = PAT + 10;
  const ux1 = ux0 + cols.length * COL;
  const bx0 = ux1 + 16;
  const bx1 = width - 30;
  const height = HEAD + rows.length * ROW + 10;
  const bxs = (v) => bx0 + (Math.min(110, v) / 110) * (bx1 - bx0);

  const draw = useCallback(
    (ctx, c) => {
      const hits = [];
      patientBands(rows).forEach((b, k) => {
        if (k % 2 === 0) {
          ctx.fillStyle = c.dark ? "#2a2a2a" : BAND;
          ctx.fillRect(0, HEAD + b.r0 * ROW, width, (b.r1 - b.r0 + 1) * ROW);
        }
        textRole(ctx, c, "label", "text");
        ctx.textAlign = "right";
        ctx.fillText(b.patient, PAT, HEAD + ((b.r0 + b.r1 + 1) / 2) * ROW);
      });
      // column labels (rotated) and headers
      textRole(ctx, c, "tick", "text");
      cols.forEach((k, j) => {
        ctx.save();
        ctx.translate(ux0 + (j + 0.5) * COL, HEAD - 6);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "left";
        ctx.fillText(k, 0, 0);
        ctx.restore();
      });
      textRole(ctx, c, "head", "text");
      ctx.textAlign = "center";
      ctx.fillText("Percent of cells", (bx0 + bx1) / 2, 10);
      // percent axis
      textRole(ctx, c, "tick", "text");
      ctx.strokeStyle = c.text;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(bx0, HEAD - 0.5);
      ctx.lineTo(bxs(100), HEAD - 0.5);
      ctx.stroke();
      [0, 25, 50, 75, 100].forEach((t) => {
        ctx.beginPath();
        ctx.moveTo(bxs(t), HEAD);
        ctx.lineTo(bxs(t), HEAD - 3);
        ctx.stroke();
        ctx.textAlign = "center";
        ctx.fillText(`${t}`, bxs(t), HEAD - 10);
      });
      rows.forEach((r, i) => {
        const cy = HEAD + i * ROW + ROW / 2;
        const xs = r.classes.map((k) => ux0 + (cols.indexOf(k) + 0.5) * COL);
        cols.forEach((_, j) => {
          ctx.beginPath();
          ctx.arc(ux0 + (j + 0.5) * COL, cy, 3.2, 0, 2 * Math.PI);
          ctx.fillStyle = c.dark ? "#555" : "#D4D4D4";
          ctx.fill();
        });
        if (xs.length > 1) {
          ctx.strokeStyle = c.text;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(Math.min(...xs), cy);
          ctx.lineTo(Math.max(...xs), cy);
          ctx.stroke();
        }
        xs.forEach((x) => {
          ctx.beginPath();
          ctx.arc(x, cy, 3.8, 0, 2 * Math.PI);
          ctx.fillStyle = c.text;
          ctx.fill();
        });
        ctx.fillStyle = r.classes.length > 1 ? (paper ? PAPER_COMBO : "#9B8AAE") : colorOf(r.classes[0]);
        ctx.fillRect(bx0, cy - ROW * 0.34, bxs(r.pct) - bx0, ROW * 0.68);
        textRole(ctx, c, "caption", "textSecondary");
        ctx.textAlign = "left";
        ctx.fillText(`${r.n}`, bxs(r.pct) + 3, cy);
        hits.push({ x0: ux0, x1: width, y0: cy - ROW / 2, y1: cy + ROW / 2, r });
      });
      return hits;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, cols, width, colorOf, paper, bx0, bx1, ux0]
  );
  if (!rows.length) return null;
  return (
    <div ref={ref}>
      <FigureCanvas
        width={width}
        height={height}
        draw={draw}
        ariaLabel="Fig 3B amplicon combinations per cell"
        tooltip={(h) => [`${h.r.patient} · ${h.r.classes.join(" + ")}`, ["cells", h.r.n], ["of tumour cells", `${h.r.pct.toFixed(1)}%`], "click to select these cells"]}
        onClick={(h, event) => onSelectCells?.(h.r.patient, h.r.cells, { label: `cells with ${h.r.classes.join(" + ")}`, mode: selectMode(event) })}
      />
      <div className="sc-fig-caption">Combinations in ≥ 1% of tumour cells (≥ 2 cells), up to 5 per patient; numbers = cells; bars = % of the patient&apos;s tumour cells with a copy-number profile.</div>
    </div>
  );
}
