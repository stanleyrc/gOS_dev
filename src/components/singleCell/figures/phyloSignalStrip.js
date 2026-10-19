import React, { useCallback, useMemo, useState } from "react";
import { Checkbox, Select, Space, Typography } from "antd";
import FigureCanvas, { useFigureStyleName } from "./figureCanvas";
import { textRole } from "./figureKit";
import useContainerWidth from "../useContainerWidth";
import { figureStyle, isPaperStyle } from "../../../helpers/singleCell/figureStyle";
import { paperAmpColor } from "../../../helpers/singleCell/paperPalette";
import { geneSetColor } from "../../../helpers/singleCell/figures";
import { Z_ONE_SIDED, Z_TICKS, phyloSignalColumns, phyloSignalGeneSets, zTransform } from "../../../helpers/singleCell/paperPanels";

const { Text } = Typography;
const SHAPES = ["circle", "triangle", "square", "diamond", "triangleDown", "plus", "cross", "hex"];

function shape(ctx, kind, x, y, r) {
  ctx.beginPath();
  if (kind === "triangle" || kind === "triangleDown") {
    const d = kind === "triangle" ? 1 : -1;
    ctx.moveTo(x, y - d * r * 1.2);
    ctx.lineTo(x + r * 1.1, y + d * r * 0.8);
    ctx.lineTo(x - r * 1.1, y + d * r * 0.8);
    ctx.closePath();
  } else if (kind === "square") ctx.rect(x - r * 0.9, y - r * 0.9, r * 1.8, r * 1.8);
  else if (kind === "diamond") {
    ctx.moveTo(x, y - r * 1.25);
    ctx.lineTo(x + r * 1.1, y);
    ctx.lineTo(x, y + r * 1.25);
    ctx.lineTo(x - r * 1.1, y);
    ctx.closePath();
  } else if (kind === "hex") {
    for (let k = 0; k < 6; k += 1) {
      const a = (Math.PI / 3) * k;
      if (k) ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
      else ctx.moveTo(x + r, y);
    }
    ctx.closePath();
  } else if (kind === "plus" || kind === "cross" || kind === "star") {
    const w = r * 0.45;
    ctx.save();
    ctx.translate(x, y);
    if (kind === "cross") ctx.rotate(Math.PI / 4);
    ctx.rect(-r, -w, 2 * r, 2 * w);
    ctx.rect(-w, -r, 2 * w, 2 * r);
    ctx.restore();
  } else ctx.arc(x, y, r, 0, 2 * Math.PI);
}

/**
 * Fig 3E from the exported phylogenetic signal (<patient>/phylo_signal.json,
 * Moran's I z, 1 / patristic distance weights): one column per variable
 * (sequencing depth | amplicon walks | somatic VAF), one point per patient
 * (or per walk), shape = patient, bar = median, dashed line = one-sided
 * p 0.05. Click an amplicon point to open that walk in the patient figure.
 * signals: [{ patient, data }].
 */
export default function PhyloSignalStrip({ signals, onSelectWalk }) {
  const [ref, measured] = useContainerWidth(520);
  const st = figureStyle(useFigureStyleName());
  const paper = isPaperStyle(st);
  const geneSets = useMemo(() => phyloSignalGeneSets(signals), [signals]);
  const [genes, setGenes] = useState(null);
  const shownGenes = useMemo(() => genes || (geneSets.some((g) => g.geneSet === "EGFR") ? ["EGFR"] : geneSets.slice(0, 1).map((g) => g.geneSet)), [genes, geneSets]);
  const [controls, setControls] = useState(["Seq. depth", "Mean somatic VAF"]);
  // the paper: manually reviewed walks, controls of the patients with the amplicon
  const [amplifiedOnly, setAmplifiedOnly] = useState(true);
  const { columns, missing } = useMemo(() => phyloSignalColumns(signals, { controls, geneSets: shownGenes, curatedOnly: true, amplifiedOnly }), [signals, controls, shownGenes, amplifiedOnly]);
  const patients = useMemo(() => [...new Set(columns.flatMap((c) => c.points.map((p) => p.patient)))].sort(), [columns]);
  const shapeOf = useCallback((p) => SHAPES[patients.indexOf(p) % SHAPES.length], [patients]);
  const LEG = 92; // patient shape legend, drawn in the canvas so it exports with the panel
  const width = Math.max(360, Math.min(measured, 140 + LEG + columns.length * 120));
  const height = 300;
  const plot = { x0: 56, x1: width - LEG - 8, y0: 10, y1: height - 44 };
  const zs = columns.flatMap((c) => c.points.map((p) => p.z));
  const zLo = Math.min(-0.5, ...zs);
  const zHi = Math.max(5, ...zs);
  const tLo = zTransform(zLo) - 0.05;
  const tHi = zTransform(zHi) + 0.05;
  const sy = useCallback((z) => plot.y1 - ((zTransform(z) - tLo) / (tHi - tLo)) * (plot.y1 - plot.y0), [plot.y0, plot.y1, tLo, tHi]);
  const colW = (plot.x1 - plot.x0) / Math.max(1, columns.length);
  // paper colours (fig3_lib panel_E): depth dark grey, EGFR ecDNA purple, somatic VAF brown
  const colorOf = useCallback(
    (col, pt) => {
      if (col.kind === "control") return paper ? (col.key === "c:Mean somatic VAF" ? "#9C6119" : "#3A3A3A") : "#7f7f7f";
      if (paper) return pt.geneSet === "EGFR" ? "#4B2C91" : paperAmpColor(pt.geneSet);
      return geneSetColor(pt.geneSet);
    },
    [paper]
  );
  const pos = useMemo(() => {
    // deterministic spread within a column: points sorted by z, alternate sides
    const out = new Map();
    columns.forEach((col, ci) => {
      const cx = plot.x0 + colW * (ci + 0.5);
      [...col.points].sort((a, b) => a.z - b.z).forEach((p, k) => out.set(p, cx + (k % 2 ? 1 : -1) * Math.min(colW * 0.25, 4 + ((k * 7) % 17))));
    });
    return out;
  }, [columns, colW, plot.x0]);

  const draw = useCallback(
    (ctx, c) => {
      const hits = [];
      const { x0, x1, y0, y1 } = plot;
      // axis
      ctx.strokeStyle = c.text;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x0 + 0.5, y0);
      ctx.lineTo(x0 + 0.5, y1);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      textRole(ctx, c, "tick", "text");
      ctx.textAlign = "right";
      Z_TICKS.filter((z) => z >= zLo - 0.01 && z <= zHi + 0.01).forEach((z) => {
        const y = sy(z);
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x0 - 3, y);
        ctx.stroke();
        ctx.fillText(`${z}`, x0 - 5, y);
      });
      textRole(ctx, c, "head", "text");
      ctx.save();
      ctx.translate(14, (y0 + y1) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.fillText("Moran's I (z)", 0, 0);
      ctx.restore();
      // one-sided p = 0.05
      ctx.strokeStyle = paper ? "#D62728" : c.danger || "#d62728";
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x0, sy(Z_ONE_SIDED));
      ctx.lineTo(x1, sy(Z_ONE_SIDED));
      ctx.stroke();
      ctx.setLineDash([]);
      columns.forEach((col, ci) => {
        const cx = x0 + colW * (ci + 0.5);
        // median bar
        if (Number.isFinite(col.median)) {
          ctx.strokeStyle = colorOf(col, col.points[0]);
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(cx - colW * 0.3, sy(col.median));
          ctx.lineTo(cx + colW * 0.3, sy(col.median));
          ctx.stroke();
          ctx.lineWidth = 1;
        }
        col.points.forEach((p) => {
          const x = pos.get(p);
          const y = sy(p.z);
          ctx.fillStyle = colorOf(col, p);
          shape(ctx, shapeOf(p.patient), x, y, st.markerR * 0.95);
          ctx.fill();
          hits.push({ x0: x - 6, x1: x + 6, y0: y - 6, y1: y + 6, col, p });
        });
        textRole(ctx, c, "label", "text");
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(col.label, cx, y1 + 6);
        textRole(ctx, c, "caption");
        ctx.fillText(`${col.points.length} ${col.kind === "walk" ? "walks" : "patients"}`, cx, y1 + 22);
        ctx.textBaseline = "middle";
      });
      // legend: patient shapes
      const lx = x1 + 18;
      textRole(ctx, c, "label", "text");
      ctx.textAlign = "left";
      patients.forEach((pt, k) => {
        const y = y0 + 8 + k * 16;
        ctx.fillStyle = c.text;
        shape(ctx, shapeOf(pt), lx, y, st.markerR * 0.85);
        ctx.fill();
        ctx.fillText(pt, lx + 10, y);
      });
      return hits;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columns, width, sy, colW, pos, colorOf, shapeOf, st, paper, zLo, zHi, patients]
  );

  const controlOptions = ["Seq. depth", "Ploidy", "SNVs / cell", "Mean somatic VAF"].map((k) => ({ value: k, label: k === "Mean somatic VAF" ? "Somatic VAF" : k }));
  return (
    <div ref={ref}>
      <Space size={6} wrap style={{ marginBottom: 4 }}>
        <Text type="secondary">Amplicons</Text>
        <Select size="small" mode="multiple" style={{ minWidth: 160 }} value={shownGenes} onChange={(v) => setGenes(v)} options={geneSets.map((g) => ({ value: g.geneSet, label: `${g.geneSet} (${g.patients})` }))} />
        <Text type="secondary">Controls</Text>
        <Select size="small" mode="multiple" style={{ minWidth: 200 }} value={controls} onChange={setControls} options={controlOptions} />
        <Checkbox checked={amplifiedOnly} onChange={(e) => setAmplifiedOnly(e.target.checked)}>
          only patients with the amplicon
        </Checkbox>
      </Space>
      <FigureCanvas
        width={width}
        height={height}
        draw={draw}
        ariaLabel="Fig 3E phylogenetic signal"
        tooltip={(h) => [`${h.p.patient} · ${h.p.label}`, ["Moran's I z", h.p.z.toFixed(2)], h.p.source ? ["depth", h.p.source] : null, ["p (perm.)", h.p.p ?? "–"], ["cells on tree", h.p.n ?? "–"], h.p.walkId ? "click to open the walk" : null].filter(Boolean)}
        onClick={(h) => h.p.walkId && onSelectWalk?.(h.p.patient, h.p.walkId, h.p.geneSet)}
      />
      <div className="sc-fig-caption">
        Points: patients (amplicons: each manually reviewed walk). Dashed: z = 1.645 (one-sided p = 0.05). From phylo_signal.json (permutation null, weights 1 / patristic distance).
        {missing.map((m) => ` ${m.key} not available for ${m.patients.join(", ")} (not recorded).`).join("")}
      </div>
    </div>
  );
}
