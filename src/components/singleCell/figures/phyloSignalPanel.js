import React, { useCallback, useMemo } from "react";
import FigureCanvas, { font } from "./figureCanvas";
import useContainerWidth from "../useContainerWidth";
import { niceStep } from "../../../helpers/singleCell/matrix";
import { Swatches } from "../cohort/charts";
import { geneSetColor, isNormalClone, phyloSignal } from "../../../helpers/singleCell/figures";

const CONTROLS = [
  { key: "Seq. depth", field: "qc_depth", color: "#8c8c8c" },
  { key: "Ploidy", field: "ploidy", color: "#595959" },
  { key: "SNVs / cell", field: "snv_count", color: "#262626" },
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
  const ROW = 30;
  const HEAD = 22;
  const PAT = 74;
  const zMax = Math.max(6, ...results.flatMap((r) => r.rows.map((s) => s.z))) * 1.05;
  const zMin = Math.min(-2, ...results.flatMap((r) => r.rows.map((s) => s.z)));
  const x0 = PAT + 8;
  const x1 = width - 16;
  const sx = (z) => x0 + ((z - zMin) / (zMax - zMin)) * (x1 - x0);
  const height = HEAD + results.length * ROW + 20;

  const draw = useCallback(
    (ctx, c) => {
      const hits = [];
      ctx.font = font(10);
      ctx.textAlign = "center";
      ctx.fillStyle = c.muted;
      const step = niceStep((zMax - zMin) / 6);
      for (let z = Math.ceil(zMin / step) * step; z <= zMax + 1e-9; z += step) {
        const x = sx(z);
        ctx.fillText(`${z}`, x, HEAD - 8);
        ctx.strokeStyle = c.grid;
        ctx.beginPath();
        ctx.moveTo(x + 0.5, HEAD);
        ctx.lineTo(x + 0.5, HEAD + results.length * ROW);
        ctx.stroke();
      }
      ctx.strokeStyle = "#cf1322";
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(sx(1.96) + 0.5, HEAD);
      ctx.lineTo(sx(1.96) + 0.5, HEAD + results.length * ROW);
      ctx.stroke();
      ctx.setLineDash([]);
      results.forEach((r, i) => {
        const y = HEAD + i * ROW;
        const cy = y + ROW / 2;
        if (i % 2 === 0) {
          ctx.fillStyle = c.band;
          ctx.fillRect(0, y, width, ROW);
        }
        ctx.font = font(13, 600);
        ctx.fillStyle = c.text;
        ctx.textAlign = "left";
        ctx.fillText(r.p.patient, 4, cy);
        r.rows.forEach((s, k) => {
          const x = sx(s.z);
          const dy = ((k % 3) - 1) * 6;
          const isControl = !s.group;
          ctx.fillStyle = s.color;
          ctx.strokeStyle = c.panel;
          ctx.beginPath();
          if (isControl) ctx.rect(x - 4, cy + dy - 4, 8, 8);
          else ctx.arc(x, cy + dy, 5, 0, 2 * Math.PI);
          ctx.fill();
          ctx.stroke();
          hits.push({ x0: x - 6, y0: cy + dy - 6, x1: x + 6, y1: cy + dy + 6, p: r.p, s });
        });
      });
      ctx.font = font(11);
      ctx.fillStyle = c.muted;
      ctx.textAlign = "center";
      ctx.fillText("Phylogenetic autocorrelation (Moran's I, z vs 199 permutations); dashed line z = 1.96", (x0 + x1) / 2, height - 8);
      return hits;
    },
    [results, width, height, zMin, zMax] // eslint-disable-line react-hooks/exhaustive-deps
  );
  if (!results.length) return <div ref={ref} />;
  const legend = [
    ...CONTROLS.map((v) => ({ key: v.key, color: v.color, label: `${v.key} (control)` })),
    ...[...new Set(results.flatMap((r) => r.rows.filter((s) => s.group).map((s) => s.group.key)))].map((k) => ({ key: k, color: geneSetColor(k), label: `ec${k} walks` })),
  ];
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
      <Swatches items={legend} style={{ marginTop: 4 }} />
    </div>
  );
}
