import React, { useCallback, useMemo } from "react";
import FigureCanvas, { useFigureStyleName } from "./figureCanvas";
import { FigureLegend, axisDepth, drawGroups, drawMarker, drawRefLine, drawXAxis, textRole } from "./figureKit";
import useContainerWidth from "../useContainerWidth";
import { figureStyle, linearTicks } from "../../../helpers/singleCell/figureStyle";
import { geneSetColor, isNormalClone, phyloSignal } from "../../../helpers/singleCell/figures";

const CONTROLS = [
  { key: "Seq. depth", field: "qc_depth", color: "#b4b4b4" },
  { key: "Ploidy", field: "ploidy", color: "#7f7f7f" },
  { key: "SNVs / cell", field: "snv_count", color: "#3d3d3d" },
];

/**
 * Fig 3E generalised: phylogenetic autocorrelation (Moran's I z-score,
 * permutation null) of each amplicon gene set's copies on the patient's tree
 * against technical controls. Amplicons far above the controls are
 * inherited along the tree rather than redrawn in every cell.
 * per: [{ patient, tree, cells, cellIds, groups }].
 */
export default function PhyloSignalPanel({ per, onSelect }) {
  const [ref, measured] = useContainerWidth(600);
  const width = Math.max(320, measured);
  const results = useMemo(
    () =>
      per
        .filter((p) => p.tree)
        .map((p) => {
          const rec = new Map(p.cells.map((c) => [c.cell_id, c]));
          const tumour = p.cellIds.filter((id) => rec.has(id) && !isNormalClone(rec.get(id).clone_id));
          const vars = [
            ...CONTROLS.map((v) => ({ key: v.key, color: v.color, value: (id) => Number(rec.get(id)?.[v.field]) })),
            // each walk on its own: summing a gene set's walks hides clade-specific variants (e.g. short vs long ecEGFR)
            ...p.groups.flatMap((g) => g.walks.map((w) => ({ key: w.label || w.name || `${w.id}`, color: geneSetColor(g.key), group: g, value: (id) => Math.log1p(Number(w.cells?.[id]) || 0) }))),
          ];
          const stats = phyloSignal(p.tree, tumour, vars, { nPerm: 199 });
          return { p, rows: stats.map((s, k) => ({ ...s, color: vars[k].color, group: vars[k].group })).filter((s) => Number.isFinite(s.z)) };
        }),
    [per]
  );
  const styleName = useFigureStyleName();
  const st = figureStyle(styleName);
  const ROW = Math.round(28 * st.rowScale);
  const TOP = 8;
  const PAT = 78;
  const zMax = Math.max(6, ...results.flatMap((r) => r.rows.map((s) => s.z))) * 1.04;
  const zMin = Math.min(-2, ...results.flatMap((r) => r.rows.map((s) => s.z)));
  const x0 = PAT + 10;
  const x1 = width - 12;
  const sx = (z) => x0 + ((z - zMin) / (zMax - zMin)) * (x1 - x0);
  const plotH = results.length * ROW;
  const height = TOP + plotH + axisDepth({ st }, true) + 4;

  const draw = useCallback(
    (ctx, c) => {
      const hits = [];
      const yAxis = TOP + plotH;
      drawGroups(ctx, c, results.map((r, i) => ({ y0: TOP + i * ROW, y1: TOP + (i + 1) * ROW })), 0, width);
      drawXAxis(ctx, c, { ticks: linearTicks(zMin, zMax, 6).map((v) => ({ v, x: sx(v) })), x0, x1, y: yAxis, at: "bottom", title: "Phylogenetic signal (Moran's I z-score)", gridFrom: TOP, gridTo: yAxis });
      drawRefLine(ctx, c, sx(1.96), TOP, yAxis, "p = 0.05");
      results.forEach((r, i) => {
        const cy = TOP + i * ROW + ROW / 2;
        textRole(ctx, c, "group");
        ctx.textAlign = "left";
        ctx.fillText(r.p.patient, 2, cy);
        // spread markers that would overlap: alternate small vertical offsets by x order
        const placed = [];
        [...r.rows].sort((a, b) => a.z - b.z).forEach((s) => {
          const x = sx(s.z);
          const near = placed.filter((q) => Math.abs(q.x - x) < st.markerR * 2.2).length;
          const dy = near ? (near % 2 ? -1 : 1) * Math.ceil(near / 2) * st.markerR * 1.3 : 0;
          placed.push({ x });
          drawMarker(ctx, c, x, cy + dy, s.color, s.group ? "circle" : "square");
          hits.push({ x0: x - 6, y0: cy + dy - 6, x1: x + 6, y1: cy + dy + 6, p: r.p, s });
        });
      });
      return hits;
    },
    [results, width, plotH, zMin, zMax, ROW, st] // eslint-disable-line react-hooks/exhaustive-deps
  );
  if (!results.length) return <div ref={ref} />;
  const walkSets = [...new Set(results.flatMap((r) => r.rows.filter((s) => s.group).map((s) => s.group.key)))];
  return (
    <div ref={ref}>
      <FigureCanvas
        width={width}
        height={height}
        draw={draw}
        ariaLabel="Phylogenetic signal of amplicon copies"
        tooltip={(h) => [`${h.p.patient} · ${h.s.key}${h.s.group ? ` (ec${h.s.group.key})` : ""}`, ["Moran's I", h.s.I.toFixed(3)], ["z", h.s.z.toFixed(2)], ["Permutation p", h.s.p < 0.01 ? "< 0.01" : h.s.p.toFixed(2)], ["Tumour cells", h.s.n]]}
        onClick={(h) => h.s.group && onSelect?.({ patient: h.p.patient, key: h.s.group.key })}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0 28px" }}>
        <FigureLegend title="Controls" items={CONTROLS.map((v) => ({ key: v.key, color: v.color, label: v.key, shape: "square" }))} />
        <FigureLegend title="Amplicon walks" items={walkSets.map((k) => ({ key: k, color: geneSetColor(k), label: `ec${k}` }))} />
      </div>
    </div>
  );
}
