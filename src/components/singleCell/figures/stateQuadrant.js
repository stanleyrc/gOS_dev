import React, { useCallback, useMemo, useState } from "react";
import { Empty, Select, Space, Typography } from "antd";
import FigureCanvas, { useFigureStyleName } from "./figureCanvas";
import { FigureLegend, textRole } from "./figureKit";
import { selectMode } from "./cellSelection";
import useContainerWidth from "../useContainerWidth";
import { figureStyle, formatTick, isPaperStyle, linearTicks } from "../../../helpers/singleCell/figureStyle";
import { PAPER_STATE } from "../../../helpers/singleCell/paperPalette";
import { cellsInLasso, quadrantOf, symmetricExtent } from "../../../helpers/singleCell/paperPanels";

const { Text } = Typography;
const QUADS = [
  { key: "OPC", label: "OPC-like", qx: -1, qy: 1 },
  { key: "NPC", label: "NPC-like", qx: 1, qy: 1 },
  { key: "AC", label: "AC-like", qx: -1, qy: -1 },
  { key: "MES", label: "MES-like", qx: 1, qy: -1 },
];
// non-paper styles keep the app's state colours
const APP_STATE = { AC: "#e8a33d", MES: "#d9534f", NPC: "#4c6fd1", OPC: "#4caf6a" };

const tint = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/**
 * Fig 1d: Neftel two-dimensional cell-state representation of every
 * malignant RNA cell (module scores from _cohort/rna/state_scores.json).
 * Hover a cell for its scores; lasso cells to select them (the patient with
 * most lassoed cells; matched to DNA cells by id); filter to one patient.
 * points: parseStateScores output; dnaIds: patient -> Set of DNA cell ids.
 */
export default function StateQuadrant({ points, dnaIds, selected, onSelect, height: hProp = 420 }) {
  const [ref, measured] = useContainerWidth(520);
  const [patient, setPatient] = useState("all");
  const st = figureStyle(useFigureStyleName());
  const paper = isPaperStyle(st);
  const colors = paper ? PAPER_STATE : APP_STATE;
  const shown = useMemo(() => (patient === "all" ? points : points.filter((p) => p.patient === patient)), [points, patient]);
  const patients = useMemo(() => [...new Set(points.map((p) => p.patient))].sort(), [points]);
  const [xMin, xMax] = useMemo(() => symmetricExtent(points.map((p) => p.x)), [points]);
  const [yMin, yMax] = useMemo(() => symmetricExtent(points.map((p) => p.y)), [points]);
  const width = Math.max(320, Math.min(measured, 560));
  const height = Math.min(hProp, Math.round(width * 0.86));
  const plot = { x0: 64, x1: width - 10, y0: 8, y1: height - 46 };
  const sx = useCallback((v) => plot.x0 + ((v - xMin) / (xMax - xMin)) * (plot.x1 - plot.x0), [plot.x0, plot.x1, xMin, xMax]);
  const sy = useCallback((v) => plot.y1 - ((v - yMin) / (yMax - yMin)) * (plot.y1 - plot.y0), [plot.y0, plot.y1, yMin, yMax]);
  const inv = (x, y) => [xMin + ((x - plot.x0) / (plot.x1 - plot.x0)) * (xMax - xMin), yMin + ((plot.y1 - y) / (plot.y1 - plot.y0)) * (yMax - yMin)];
  const selKey = selected ? `${selected.patient}:${selected.cells.size}` : "";

  const draw = useCallback(
    (ctx, c) => {
      const { x0, x1, y0, y1 } = plot;
      const cx = sx(0);
      const cy = sy(0);
      // quadrant tints and labels
      QUADS.forEach((q) => {
        ctx.fillStyle = tint(colors[q.key], c.dark ? 0.12 : 0.08);
        const xa = q.qx < 0 ? x0 : cx;
        const ya = q.qy > 0 ? y0 : cy;
        ctx.fillRect(xa, ya, q.qx < 0 ? cx - x0 : x1 - cx, q.qy > 0 ? cy - y0 : y1 - cy);
      });
      // points (selection drawn last, ringed)
      const sel = selected?.cells;
      const r = Math.max(1.6, st.markerR * 0.55);
      ctx.globalAlpha = sel ? 0.35 : 0.75;
      shown.forEach((p) => {
        if (sel && selected.patient === p.patient && sel.has(p.cell)) return;
        ctx.beginPath();
        ctx.arc(sx(p.x), sy(p.y), r, 0, 2 * Math.PI);
        ctx.fillStyle = colors[p.state] || colors[quadrantOf(p.x, p.y)] || "#888";
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      if (sel) {
        shown.forEach((p) => {
          if (selected.patient !== p.patient || !sel.has(p.cell)) return;
          ctx.beginPath();
          ctx.arc(sx(p.x), sy(p.y), r + 0.8, 0, 2 * Math.PI);
          ctx.fillStyle = colors[p.state] || "#888";
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = c.text;
          ctx.stroke();
        });
      }
      // dashed zero lines, frame
      ctx.strokeStyle = c.textSecondary || c.muted;
      ctx.lineWidth = 0.8;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(cx, y0);
      ctx.lineTo(cx, y1);
      ctx.moveTo(x0, cy);
      ctx.lineTo(x1, cy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = c.text;
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
      // quadrant names
      QUADS.forEach((q) => {
        ctx.font = `700 ${Math.round(width / 28)}px ${st.fontFamily || "sans-serif"}`;
        ctx.fillStyle = colors[q.key];
        ctx.textAlign = q.qx < 0 ? "left" : "right";
        ctx.textBaseline = q.qy > 0 ? "top" : "bottom";
        ctx.fillText(q.label, q.qx < 0 ? x0 + 8 : x1 - 8, q.qy > 0 ? y0 + 6 : y1 - 6);
      });
      // axes
      textRole(ctx, c, "tick", "text");
      ctx.strokeStyle = c.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      linearTicks(xMin, xMax, 5).forEach((v) => {
        const x = sx(v);
        ctx.beginPath();
        ctx.moveTo(x, y1);
        ctx.lineTo(x, y1 + 3);
        ctx.stroke();
        ctx.fillText(formatTick(v), x, y1 + 5);
      });
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      linearTicks(yMin, yMax, 5).forEach((v) => {
        const y = sy(v);
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x0 - 3, y);
        ctx.stroke();
        ctx.fillText(formatTick(v), x0 - 5, y);
      });
      textRole(ctx, c, "head", "text");
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("Relative meta-module score (log2)", (x0 + x1) / 2, height - 4);
      ctx.save();
      ctx.translate(14, (y0 + y1) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textBaseline = "middle";
      ctx.fillText("Stem-like vs differentiated score", 0, 0);
      ctx.restore();
      return [];
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown, width, height, sx, sy, colors, st, selKey, xMin, xMax, yMin, yMax]
  );

  // nearest point under the cursor (within 6 px)
  const hitTest = useCallback(
    (x, y) => {
      let best = null;
      let bd = 36;
      shown.forEach((p) => {
        const d = (sx(p.x) - x) ** 2 + (sy(p.y) - y) ** 2;
        if (d < bd) {
          bd = d;
          best = p;
        }
      });
      return best;
    },
    [shown, sx, sy]
  );

  if (!points.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="not available (_cohort/rna/state_scores.json not exported)" />;
  const fmt = (v) => (Number.isFinite(v) ? v.toFixed(2) : "–");
  return (
    <div ref={ref}>
      <Space size={6} style={{ marginBottom: 4 }}>
        <Text type="secondary">Patient</Text>
        <Select size="small" style={{ width: 120 }} value={patient} onChange={setPatient} options={[{ value: "all", label: `All (${patients.length})` }, ...patients.map((p) => ({ value: p, label: p }))]} />
      </Space>
      <FigureCanvas
        width={width}
        height={height}
        draw={draw}
        hitTest={hitTest}
        ariaLabel="Fig 1d cell-state quadrant"
        tooltip={(p) => [p.cell, ["Patient", p.patient], ["State", `${p.state}-like`], ["x · D", `${fmt(p.x)} · ${fmt(p.y)}`], ["MES · AC", `${fmt(p.scores.MES)} · ${fmt(p.scores.AC)}`], ["OPC · NPC", `${fmt(p.scores.OPC)} · ${fmt(p.scores.NPC)}`], dnaIds?.[p.patient]?.has(p.cell) ? "click to select (DNA cell)" : "no DNA profile for this cell"]}
        onClick={(p, event) => dnaIds?.[p.patient]?.has(p.cell) && onSelect?.(p.patient, [p.cell], { label: `${p.cell}`, mode: selectMode(event) })}
        onDragStart={(x, y) => (x >= plot.x0 && x <= plot.x1 && y >= plot.y0 && y <= plot.y1 ? { mode: "lasso", ...plot } : null)}
        onDragEnd={({ path }, event) => {
          const groups = cellsInLasso(shown, path.map(([x, y]) => inv(x, y)));
          const g = groups[0];
          if (!g) return;
          const ids = g.cells.filter((id) => dnaIds?.[g.patient]?.has(id));
          if (ids.length) onSelect?.(g.patient, ids, { label: `${ids.length} ${g.patient} cells lassoed in the state quadrant`, mode: selectMode(event) });
        }}
      />
      <FigureLegend items={["AC", "MES", "NPC", "OPC"].map((k) => ({ key: k, color: colors[k], label: `${k}-like` }))} />
      <div className="sc-fig-caption">
        {shown.length.toLocaleString()} malignant cells{patient === "all" ? `, ${patients.length} patients` : ` (${patient})`}; 4 merged Seurat modules (state = arg-max). Lasso selects the DNA-profiled cells of the patient with most lassoed cells.
      </div>
    </div>
  );
}
