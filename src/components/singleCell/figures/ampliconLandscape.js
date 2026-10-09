import React, { useCallback, useMemo } from "react";
import FigureCanvas, { fitText, jitter, useFigureStyleName } from "./figureCanvas";
import { axisDepth, drawBar, drawGroups, drawXAxis, textRole } from "./figureKit";
import { figureStyle } from "../../../helpers/singleCell/figureStyle";
import useContainerWidth from "../useContainerWidth";
import { geneSetColor, logDensity, quantiles } from "../../../helpers/singleCell/figures";

const LO = 1;
const HI = 300;
const TICKS = [1, 2, 5, 10, 20, 50, 100, 200];
const lx = (v, x0, x1) => x0 + ((Math.log10(Math.min(HI, Math.max(LO, v))) - Math.log10(LO)) / (Math.log10(HI) - Math.log10(LO))) * (x1 - x0);
const pct = (f) => `${Math.round(100 * f)}%`;

/**
 * Fig 3A: per patient, one row per amplicon gene set: per-cell copies
 * (violin + cells as dots, log axis) and the number of walk structures.
 * per: [{ patient, cellIds, groups }]; onSelect({ patient, key, cell? }).
 */
export function AmpliconViolins({ per, selected, onSelect }) {
  const [ref, measured] = useContainerWidth(700);
  const width = Math.max(420, measured);
  const styleName = useFigureStyleName();
  const st = figureStyle(styleName);
  const ROW = Math.round(30 * st.rowScale);
  const TOP = 6;
  const PAT = 78;
  const LAB = 112;
  const BAR = 92;
  const rows = useMemo(() => per.flatMap((p) => p.groups.map((g, i) => ({ p, g, first: i === 0, n: p.groups.length }))), [per]);
  const plotH = rows.length * ROW;
  const height = TOP + plotH + axisDepth({ st }, true) + 2;
  const vx0 = PAT + LAB + 14;
  const vx1 = width - BAR - 26;
  const bx0 = width - BAR;
  const bx1 = width - 22;
  const maxWalks = Math.max(1, ...rows.map((r) => r.g.walks.length));

  const draw = useCallback(
    (ctx, c) => {
      const hits = [];
      const yAxis = TOP + plotH;
      const groups = [];
      rows.forEach((r, i) => r.first && groups.push({ y0: TOP + i * ROW, y1: TOP + (i + r.n) * ROW, r }));
      drawGroups(ctx, c, groups, 0, width);
      drawXAxis(ctx, c, { ticks: TICKS.map((v) => ({ v, x: lx(v, vx0, vx1) })), x0: vx0, x1: vx1, y: yAxis, at: "bottom", title: "Copies per cell (log scale)", gridFrom: TOP, gridTo: yAxis });
      const wStep = maxWalks > 8 ? 4 : maxWalks > 4 ? 2 : 1;
      const wTicks = [];
      for (let v = 0; v <= maxWalks; v += wStep) wTicks.push({ v, x: bx0 + (v / maxWalks) * (bx1 - bx0) });
      drawXAxis(ctx, c, { ticks: wTicks, x0: bx0, x1: bx1, y: yAxis, at: "bottom", title: "Walks" });
      groups.forEach(({ y0, y1, r }) => {
        textRole(ctx, c, "group");
        ctx.textAlign = "left";
        ctx.fillText(r.p.patient, 2, (y0 + y1) / 2);
        hits.push({ x0: 0, y0, x1: PAT, y1, kind: "patient", p: r.p });
      });
      rows.forEach((r, i) => {
        const y = TOP + i * ROW;
        const cy = y + ROW / 2;
        const color = geneSetColor(r.g.key);
        const isSel = selected && selected.patient === r.p.patient && selected.key === r.g.key;
        if (isSel) {
          ctx.fillStyle = c.selectFill;
          ctx.fillRect(PAT, y + 1, width - PAT, ROW - 2);
        }
        ctx.textAlign = "right";
        textRole(ctx, c, "label", "text");
        ctx.fillText(fitText(ctx, r.g.key, LAB - 6), PAT + LAB, cy - 6);
        textRole(ctx, c, "caption");
        ctx.fillText(`${r.g.nCells} cells · ${pct(r.g.fraction)}`, PAT + LAB, cy + 7);
        // violin
        const vals = Array.from(r.g.cn).filter((v) => v >= 1);
        const dens = logDensity(vals, LO, HI, 64);
        const half = ROW * 0.4;
        ctx.beginPath();
        for (let k = 0; k < dens.length; k += 1) {
          const x = vx0 + (k / (dens.length - 1)) * (vx1 - vx0);
          if (k === 0) ctx.moveTo(x, cy - dens[k] * half);
          else ctx.lineTo(x, cy - dens[k] * half);
        }
        for (let k = dens.length - 1; k >= 0; k -= 1) ctx.lineTo(vx0 + (k / (dens.length - 1)) * (vx1 - vx0), cy + dens[k] * half);
        ctx.closePath();
        ctx.globalAlpha = st.areaAlpha;
        ctx.fillStyle = color;
        ctx.fill();
        ctx.globalAlpha = 1;
        hits.push({ x0: PAT, y0: y, x1: width, y1: y + ROW, kind: "group", p: r.p, g: r.g, q: quantiles(vals) });
        // cells as dots inside the outline
        ctx.fillStyle = c.dark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.38)";
        r.p.cellIds.forEach((id, k) => {
          const v = r.g.cn[k];
          if (!(v >= 1)) return;
          const x = lx(v, vx0, vx1);
          const d = dens[Math.round(((x - vx0) / (vx1 - vx0)) * (dens.length - 1))] || 0.2;
          const yy = cy + jitter(k) * 2 * half * Math.max(0.25, d) * 0.85;
          ctx.fillRect(x - 0.8, yy - 0.8, 1.6, 1.6);
          hits.push({ x0: x - 3, y0: yy - 3, x1: x + 3, y1: yy + 3, kind: "cell", p: r.p, g: r.g, cell: id, cn: v });
        });
        // median and interquartile range
        const [q1, med, q3] = quantiles(vals);
        if (Number.isFinite(med)) {
          ctx.strokeStyle = c.text;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(lx(q1, vx0, vx1), cy);
          ctx.lineTo(lx(q3, vx0, vx1), cy);
          ctx.stroke();
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(lx(med, vx0, vx1), cy, 3.2, 0, 2 * Math.PI);
          ctx.fillStyle = c.panel;
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.lineWidth = 1;
        }
        // number of structures
        const bw = (r.g.walks.length / maxWalks) * (bx1 - bx0);
        const bh = Math.max(4, ROW * st.barThin * 0.6);
        drawBar(ctx, c, bx0, cy - bh / 2, bw, bh, color);
        textRole(ctx, c, "tick", "textSecondary");
        ctx.textAlign = "left";
        ctx.fillText(`${r.g.walks.length}`, bx0 + bw + 4, cy);
      });
      return hits;
    },
    [rows, width, plotH, vx0, vx1, bx0, bx1, maxWalks, selected, ROW, st]
  );

  const tooltip = (h) => {
    if (h.kind === "cell") return [h.cell, ["Patient", h.p.patient], ["Amplicon", h.g.key], ["Copies", h.cn.toFixed(1)]];
    if (h.kind === "group")
      return [
        `${h.p.patient} · ${h.g.key}`,
        ["Cells", `${h.g.nCells} of ${h.p.cellIds.length} (${pct(h.g.fraction)})`],
        ["Median copies", Number.isFinite(h.q[1]) ? `${h.q[1].toFixed(1)} (IQR ${h.q[0].toFixed(1)}–${h.q[2].toFixed(1)})` : "–"],
        ["Walks", h.g.walks.map((w) => w.label || w.name || w.id).join(", ")],
      ];
    if (h.kind === "patient") return [h.p.patient, ["Amplicon sets", h.p.groups.length]];
    return null;
  };
  if (!rows.length) return <div ref={ref} />;
  return (
    <div ref={ref}>
      <FigureCanvas
        width={width}
        height={height}
        draw={draw}
        tooltip={tooltip}
        ariaLabel="Amplicon copies per cell by patient and gene set"
        onClick={(h) => h.kind !== "patient" && onSelect?.({ patient: h.p.patient, key: h.g.key, cell: h.cell })}
      />
      <div className="sc-fig-caption">Rows are the driver-gene sets of the ecDNA walks; copies are summed over the set&apos;s walks. Line: interquartile range; open dot: median. Click a row to open it below.</div>
    </div>
  );
}

/**
 * Fig 3B: per patient, the combinations of amplicon gene sets present in the
 * same cell (dots + connecting line) and the percent of cells with each.
 * onSelect({ patient, combo }) marks those cells in the patient view.
 */
export function AmpliconUpset({ per, maxCombos = 6, selected, onSelect }) {
  const [ref, measured] = useContainerWidth(600);
  const width = Math.max(360, measured);
  const styleName = useFigureStyleName();
  const st = figureStyle(styleName);
  const ROW = Math.round(22 * st.rowScale);
  const PAT = 78;
  const sets = useMemo(() => {
    const all = new Set(per.flatMap((p) => p.groups.map((g) => g.key)));
    return [...all].sort((a, b) => a.split("+").length - b.split("+").length || a.localeCompare(b));
  }, [per]);
  const blocks = useMemo(() => per.map((p) => ({ p, combos: p.combos.filter((c) => c.n >= 2).slice(0, maxCombos) })).filter((b) => b.combos.length), [per, maxCombos]);
  const nRows = blocks.reduce((s, b) => s + b.combos.length, 0);
  const HEAD = Math.min(124, 22 + 7.4 * Math.max(4, ...sets.map((s) => s.length)));
  const colW = Math.max(16, Math.min(24, (width - PAT - 190) / Math.max(1, sets.length)));
  const mx0 = PAT + 6;
  const bx0 = mx0 + sets.length * colW + 16;
  const bx1 = width - 44;
  const plotH = nRows * ROW;
  const height = HEAD + plotH + axisDepth({ st }, true) + 2;

  const draw = useCallback(
    (ctx, c) => {
      const hits = [];
      const yAxis = HEAD + plotH;
      const groups = [];
      let i = 0;
      blocks.forEach((b) => {
        groups.push({ y0: HEAD + i * ROW, y1: HEAD + (i + b.combos.length) * ROW, b });
        i += b.combos.length;
      });
      drawGroups(ctx, c, groups, 0, width);
      // set names, rotated, in their colour
      sets.forEach((s, j) => {
        ctx.save();
        ctx.translate(mx0 + (j + 0.5) * colW, HEAD - 6);
        ctx.rotate(-Math.PI / 2);
        textRole(ctx, c, "label");
        ctx.font = ctx.font.replace(/^\d+ /, "500 ");
        ctx.textAlign = "left";
        ctx.fillStyle = geneSetColor(s) === "#9B8AAE" ? c.textSecondary : geneSetColor(s);
        ctx.fillText(s, 0, 0);
        ctx.restore();
      });
      drawXAxis(ctx, c, { ticks: [0, 25, 50, 75, 100].map((v) => ({ v, x: bx0 + (v / 100) * (bx1 - bx0) })), x0: bx0, x1: bx1, y: yAxis, at: "bottom", title: "Cells with the combination", percent: "points", gridFrom: HEAD, gridTo: yAxis });
      groups.forEach(({ y0, y1, b }) => {
        textRole(ctx, c, "group");
        ctx.textAlign = "left";
        ctx.fillText(b.p.patient, 2, (y0 + y1) / 2);
      });
      i = 0;
      blocks.forEach((b) => {
        b.combos.forEach((combo) => {
          const y = HEAD + i * ROW;
          const cy = y + ROW / 2;
          const isSel = selected && selected.patient === b.p.patient && selected.combo === combo.keys.join("|");
          if (isSel) {
            ctx.fillStyle = c.selectFill;
            ctx.fillRect(PAT, y + 1, width - PAT, ROW - 2);
          }
          const idx = combo.keys.map((k) => sets.indexOf(k)).filter((v) => v >= 0);
          if (idx.length > 1) {
            ctx.strokeStyle = c.text;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(mx0 + (Math.min(...idx) + 0.5) * colW, cy);
            ctx.lineTo(mx0 + (Math.max(...idx) + 0.5) * colW, cy);
            ctx.stroke();
            ctx.lineWidth = 1;
          }
          sets.forEach((s, j) => {
            const on = combo.keys.includes(s);
            ctx.fillStyle = on ? c.text : c.empty;
            ctx.beginPath();
            ctx.arc(mx0 + (j + 0.5) * colW, cy, on ? 4 : 2.6, 0, 2 * Math.PI);
            ctx.fill();
          });
          const f = combo.n / Math.max(1, b.p.cellIds.length);
          const bh = Math.max(4, ROW * st.barThin);
          drawBar(ctx, c, bx0, cy - bh / 2, f * (bx1 - bx0), bh, combo.keys.length === 1 ? geneSetColor(combo.keys[0]) : "#9B8AAE");
          textRole(ctx, c, "tick", "textSecondary");
          ctx.textAlign = "left";
          ctx.fillText(`${pct(f)}`, bx0 + f * (bx1 - bx0) + 4, cy);
          hits.push({ x0: PAT, y0: y, x1: width, y1: y + ROW, p: b.p, combo, f });
          i += 1;
        });
      });
      return hits;
    },
    [sets, blocks, plotH, width, colW, mx0, bx0, bx1, HEAD, selected, ROW, st]
  );
  if (!nRows) return <div ref={ref} />;
  return (
    <div ref={ref}>
      <FigureCanvas
      width={width}
      height={height}
      draw={draw}
      ariaLabel="Co-occurrence of amplicon gene sets in cells"
      tooltip={(h) => [`${h.p.patient} · ${h.combo.keys.join(" + ")}`, ["Cells", `${h.combo.n} (${pct(h.f)})`], ["Click", "mark these cells below"]]}
      onClick={(h) => onSelect?.({ patient: h.p.patient, combo: h.combo.keys.join("|"), cells: h.combo.cells, label: h.combo.keys.join(" + ") })}
    />
    </div>
  );
}
