import React, { useCallback, useMemo } from "react";
import FigureCanvas, { fitText, font, jitter } from "./figureCanvas";
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
  const ROW = 30;
  const HEAD = 30;
  const PAT = 74;
  const LAB = 118;
  const BAR = 96;
  const rows = useMemo(() => per.flatMap((p) => p.groups.map((g, i) => ({ p, g, first: i === 0, n: p.groups.length }))), [per]);
  const height = HEAD + rows.length * ROW + 22;
  const vx0 = PAT + LAB + 8;
  const vx1 = width - BAR - 18;
  const bx0 = width - BAR;
  const maxWalks = Math.max(1, ...rows.map((r) => r.g.walks.length));

  const draw = useCallback(
    (ctx, c) => {
      const hits = [];
      ctx.font = font(12, 600);
      ctx.fillStyle = c.text;
      ctx.textAlign = "center";
      ctx.fillText("Copies per cell (log)", (vx0 + vx1) / 2, 9);
      ctx.fillText("Walks", bx0 + BAR / 2, 9);
      ctx.font = font(10);
      ctx.fillStyle = c.muted;
      TICKS.forEach((v) => {
        const x = lx(v, vx0, vx1);
        ctx.fillText(`${v}`, x, HEAD - 8);
        ctx.strokeStyle = c.grid;
        ctx.beginPath();
        ctx.moveTo(x + 0.5, HEAD);
        ctx.lineTo(x + 0.5, HEAD + rows.length * ROW);
        ctx.stroke();
      });
      const wStep = maxWalks > 8 ? 4 : maxWalks > 4 ? 2 : 1;
      for (let v = 0; v <= maxWalks; v += wStep) ctx.fillText(`${v}`, bx0 + (v / maxWalks) * (BAR - 18), HEAD - 8);
      let band = 0;
      rows.forEach((r, i) => {
        const y = HEAD + i * ROW;
        const cy = y + ROW / 2;
        if (r.first) {
          if (band % 2 === 0) {
            ctx.fillStyle = c.band;
            ctx.fillRect(0, y, width, r.n * ROW);
          }
          band += 1;
          ctx.font = font(14, 600);
          ctx.fillStyle = c.text;
          ctx.textAlign = "left";
          ctx.fillText(r.p.patient, 4, y + (r.n * ROW) / 2);
          hits.push({ x0: 0, y0: y, x1: PAT, y1: y + r.n * ROW, kind: "patient", p: r.p });
        }
        const color = geneSetColor(r.g.key);
        const isSel = selected && selected.patient === r.p.patient && selected.key === r.g.key;
        if (isSel) {
          ctx.strokeStyle = c.text;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(PAT + 1, y + 1, width - PAT - 2, ROW - 2);
          ctx.lineWidth = 1;
        }
        ctx.textAlign = "right";
        ctx.font = font(12, 600);
        ctx.fillStyle = c.text;
        ctx.fillText(fitText(ctx, r.g.key, LAB - 6), PAT + LAB, cy - 5);
        ctx.font = font(10);
        ctx.fillStyle = c.muted;
        ctx.fillText(`${r.g.nCells} cells · ${pct(r.g.fraction)}`, PAT + LAB, cy + 8);
        // violin
        const vals = Array.from(r.g.cn).filter((v) => v >= 1);
        const dens = logDensity(vals, LO, HI, 64);
        const half = ROW * 0.42;
        ctx.beginPath();
        for (let k = 0; k < dens.length; k += 1) {
          const x = vx0 + (k / (dens.length - 1)) * (vx1 - vx0);
          if (k === 0) ctx.moveTo(x, cy - dens[k] * half);
          else ctx.lineTo(x, cy - dens[k] * half);
        }
        for (let k = dens.length - 1; k >= 0; k -= 1) ctx.lineTo(vx0 + (k / (dens.length - 1)) * (vx1 - vx0), cy + dens[k] * half);
        ctx.closePath();
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = color;
        ctx.fill();
        ctx.globalAlpha = 1;
        const [q1, med, q3] = quantiles(vals);
        if (Number.isFinite(med)) {
          ctx.strokeStyle = c.text;
          ctx.strokeRect(lx(q1, vx0, vx1), cy - 3, Math.max(1, lx(q3, vx0, vx1) - lx(q1, vx0, vx1)), 6);
          ctx.fillStyle = c.text;
          ctx.fillRect(lx(med, vx0, vx1) - 1, cy - 5, 2, 10);
        }
        hits.push({ x0: PAT, y0: y, x1: width, y1: y + ROW, kind: "group", p: r.p, g: r.g, q: [q1, med, q3] });
        // cells as dots inside the outline
        ctx.fillStyle = c.dark ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.6)";
        r.p.cellIds.forEach((id, k) => {
          const v = r.g.cn[k];
          if (!(v >= 1)) return;
          const x = lx(v, vx0, vx1);
          const d = dens[Math.round(((x - vx0) / (vx1 - vx0)) * (dens.length - 1))] || 0.2;
          const yy = cy + jitter(k) * 2 * half * Math.max(0.25, d) * 0.9;
          ctx.fillRect(x - 1, yy - 1, 2, 2);
          hits.push({ x0: x - 3, y0: yy - 3, x1: x + 3, y1: yy + 3, kind: "cell", p: r.p, g: r.g, cell: id, cn: v });
        });
        // number of structures
        const bw = (r.g.walks.length / maxWalks) * (BAR - 18);
        ctx.fillStyle = color;
        ctx.fillRect(bx0, y + 6, bw, ROW - 12);
        ctx.font = font(11);
        ctx.fillStyle = c.text;
        ctx.textAlign = "left";
        ctx.fillText(`${r.g.walks.length}`, bx0 + bw + 3, cy);
      });
      ctx.font = font(11);
      ctx.fillStyle = c.muted;
      ctx.textAlign = "left";
      ctx.fillText("Rows: driver-gene sets of the ecDNA walks; copies = sum over the set's walks. Click a row to open it below.", PAT, height - 9);
      return hits;
    },
    [rows, width, height, vx0, vx1, bx0, maxWalks, selected]
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
  const ROW = 20;
  const PAT = 74;
  const sets = useMemo(() => {
    const all = new Set(per.flatMap((p) => p.groups.map((g) => g.key)));
    return [...all].sort((a, b) => a.split("+").length - b.split("+").length || a.localeCompare(b));
  }, [per]);
  const blocks = useMemo(() => per.map((p) => ({ p, combos: p.combos.filter((c) => c.n >= 2).slice(0, maxCombos) })).filter((b) => b.combos.length), [per, maxCombos]);
  const nRows = blocks.reduce((s, b) => s + b.combos.length, 0);
  const HEAD = Math.min(110, 18 + 7 * Math.max(4, ...sets.map((s) => s.length)));
  const colW = Math.max(14, Math.min(26, (width - PAT - 170) / Math.max(1, sets.length)));
  const mx0 = PAT + 6;
  const bx0 = mx0 + sets.length * colW + 12;
  const bx1 = width - 40;
  const height = HEAD + nRows * ROW + 8;

  const draw = useCallback(
    (ctx, c) => {
      const hits = [];
      ctx.font = font(11, 600);
      sets.forEach((s, j) => {
        ctx.save();
        ctx.translate(mx0 + (j + 0.5) * colW, HEAD - 6);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "left";
        ctx.fillStyle = geneSetColor(s) === "#9B8AAE" ? c.text : geneSetColor(s);
        ctx.fillText(s, 0, 0);
        ctx.restore();
      });
      ctx.font = font(12, 600);
      ctx.fillStyle = c.text;
      ctx.textAlign = "center";
      ctx.fillText("Percent of cells", (bx0 + bx1) / 2, 10);
      ctx.font = font(10);
      ctx.fillStyle = c.muted;
      [0, 25, 50, 75, 100].forEach((v) => {
        const x = bx0 + (v / 100) * (bx1 - bx0);
        ctx.fillText(`${v}`, x, HEAD - 8);
        ctx.strokeStyle = c.grid;
        ctx.beginPath();
        ctx.moveTo(x + 0.5, HEAD);
        ctx.lineTo(x + 0.5, HEAD + nRows * ROW);
        ctx.stroke();
      });
      let i = 0;
      blocks.forEach((b, bi) => {
        const y0 = HEAD + i * ROW;
        if (bi % 2 === 0) {
          ctx.fillStyle = c.band;
          ctx.fillRect(0, y0, width, b.combos.length * ROW);
        }
        ctx.font = font(13, 600);
        ctx.fillStyle = c.text;
        ctx.textAlign = "left";
        ctx.fillText(b.p.patient, 4, y0 + (b.combos.length * ROW) / 2);
        b.combos.forEach((combo) => {
          const y = HEAD + i * ROW;
          const cy = y + ROW / 2;
          const idx = combo.keys.map((k) => sets.indexOf(k)).filter((v) => v >= 0);
          sets.forEach((s, j) => {
            const on = combo.keys.includes(s);
            ctx.fillStyle = on ? c.text : c.empty;
            ctx.beginPath();
            ctx.arc(mx0 + (j + 0.5) * colW, cy, on ? 4.5 : 3.5, 0, 2 * Math.PI);
            ctx.fill();
          });
          if (idx.length > 1) {
            ctx.strokeStyle = c.text;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(mx0 + (Math.min(...idx) + 0.5) * colW, cy);
            ctx.lineTo(mx0 + (Math.max(...idx) + 0.5) * colW, cy);
            ctx.stroke();
            ctx.lineWidth = 1;
          }
          const f = combo.n / Math.max(1, b.p.cellIds.length);
          ctx.fillStyle = combo.keys.length === 1 ? geneSetColor(combo.keys[0]) : "#9B8AAE";
          ctx.fillRect(bx0, y + 3, f * (bx1 - bx0), ROW - 6);
          ctx.font = font(10);
          ctx.fillStyle = c.text;
          ctx.textAlign = "left";
          ctx.fillText(`${pct(f)}`, bx0 + f * (bx1 - bx0) + 3, cy);
          const isSel = selected && selected.patient === b.p.patient && selected.combo === combo.keys.join("|");
          if (isSel) {
            ctx.strokeStyle = c.text;
            ctx.strokeRect(PAT + 1, y + 1, width - PAT - 2, ROW - 2);
          }
          hits.push({ x0: PAT, y0: y, x1: width, y1: y + ROW, p: b.p, combo, f });
          i += 1;
        });
      });
      return hits;
    },
    [sets, blocks, nRows, width, colW, mx0, bx0, bx1, HEAD, selected]
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
