import React, { useCallback, useMemo } from "react";
import FigureCanvas, { fitText, jitter, useFigureStyleName } from "./figureCanvas";
import { axisDepth, drawBar, drawGroups, drawXAxis, textRole } from "./figureKit";
import { figureStyle } from "../../../helpers/singleCell/figureStyle";
import useContainerWidth from "../useContainerWidth";
import { geneSetColor, quantiles } from "../../../helpers/singleCell/figures";
import { logKde, niceLogDomain } from "../../../helpers/singleCell/figureMath";
import { selectMode } from "./cellSelection";

const LOG_TICKS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];
const pct = (f) => `${Math.round(100 * f)}%`;
const ACCENT = "#1677ff";

/** Darker outline for a fill colour. */
function shade(hex, k = 0.72) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  const ch = (s) => Math.round(((v >> s) & 255) * k);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/**
 * Fig 3A: per patient, one row per amplicon gene set: per-cell copies as a
 * smooth violin (log axis) with the cells as dots, a slim box (IQR, open
 * median) and the number of walk structures. Drag across a violin to select
 * the cells in that copy range; click a dot for one cell, a row to open it.
 * per: [{ patient, cellIds, groups }]; selection: { patient, cells } | null.
 */
export function AmpliconViolins({ per, selected, onSelect, selection, onSelectCells }) {
  const [ref, measured] = useContainerWidth(700);
  const width = Math.max(420, measured);
  const styleName = useFigureStyleName();
  const st = figureStyle(styleName);
  const ROW = Math.round(34 * st.rowScale);
  const TOP = 6;
  const PAT = 78;
  const LAB = 112;
  const BAR = 92;
  const rows = useMemo(() => per.flatMap((p) => p.groups.map((g, i) => ({ p, g, first: i === 0, n: p.groups.length }))), [per]);
  const [LO, HI] = useMemo(() => niceLogDomain(rows.flatMap((r) => Array.from(r.g.cn))), [rows]);
  const plotH = rows.length * ROW;
  const height = TOP + plotH + axisDepth({ st }, true) + 2;
  const vx0 = PAT + LAB + 14;
  const vx1 = width - BAR - 26;
  const bx0 = width - BAR;
  const bx1 = width - 22;
  const maxWalks = Math.max(1, ...rows.map((r) => r.g.walks.length));
  const lx = useCallback((v) => vx0 + ((Math.log10(Math.min(HI, Math.max(LO, v))) - Math.log10(LO)) / (Math.log10(HI) - Math.log10(LO))) * (vx1 - vx0), [vx0, vx1, LO, HI]);
  const invLx = useCallback((x) => 10 ** (Math.log10(LO) + ((x - vx0) / (vx1 - vx0)) * (Math.log10(HI) - Math.log10(LO))), [vx0, vx1, LO, HI]);

  // per row: density outline and dot positions (computed once, reused for hover)
  const geo = useMemo(
    () =>
      rows.map((r, i) => {
        const cy = TOP + i * ROW + ROW / 2;
        const half = ROW * 0.42;
        const vals = Array.from(r.g.cn).filter((v) => v >= 1);
        const kde = logKde(vals, { lo: LO, hi: HI, n: 120 });
        const dAt = (x) => {
          const k = Math.round(((x - vx0) / (vx1 - vx0)) * (kde.y.length - 1));
          return kde.y[Math.max(0, Math.min(kde.y.length - 1, k))] || 0;
        };
        const dots = [];
        r.p.cellIds.forEach((id, k) => {
          const v = r.g.cn[k];
          if (!(v >= 1)) return;
          const x = lx(v);
          dots.push({ id, v, x, y: cy + jitter(k) * 2 * half * Math.max(0.18, dAt(x)) * 0.9 });
        });
        return { cy, half, kde, dots, q: quantiles(vals) };
      }),
    [rows, ROW, LO, HI, vx0, vx1, lx]
  );

  const draw = useCallback(
    (ctx, c) => {
      const yAxis = TOP + plotH;
      const groups = [];
      rows.forEach((r, i) => r.first && groups.push({ y0: TOP + i * ROW, y1: TOP + (i + r.n) * ROW, r }));
      drawGroups(ctx, c, groups, 0, width);
      const ticks = LOG_TICKS.filter((v) => v >= LO && v <= HI).map((v) => ({ v, x: lx(v) }));
      drawXAxis(ctx, c, { ticks, x0: vx0, x1: vx1, y: yAxis, at: "bottom", title: "Copies per cell (log scale)", gridFrom: TOP, gridTo: yAxis });
      const wStep = maxWalks > 8 ? 4 : maxWalks > 4 ? 2 : 1;
      const wTicks = [];
      for (let v = 0; v <= maxWalks; v += wStep) wTicks.push({ v, x: bx0 + (v / maxWalks) * (bx1 - bx0) });
      drawXAxis(ctx, c, { ticks: wTicks, x0: bx0, x1: bx1, y: yAxis, at: "bottom", title: "Walks" });
      groups.forEach(({ y0, y1, r }) => {
        textRole(ctx, c, "group");
        ctx.textAlign = "left";
        ctx.fillText(r.p.patient, 2, (y0 + y1) / 2);
      });
      rows.forEach((r, i) => {
        const { cy, half, kde, dots, q } = geo[i];
        const y = TOP + i * ROW;
        const color = geneSetColor(r.g.key);
        const sel = selection && selection.patient === r.p.patient ? selection.cells : null;
        if (selected && selected.patient === r.p.patient && selected.key === r.g.key) {
          ctx.fillStyle = c.selectFill;
          ctx.fillRect(PAT, y + 1, width - PAT, ROW - 2);
        }
        ctx.textAlign = "right";
        textRole(ctx, c, "label", "text");
        ctx.fillText(fitText(ctx, r.g.key, LAB - 6), PAT + LAB, cy - 6);
        textRole(ctx, c, "caption");
        ctx.fillText(`${r.g.nCells} cells · ${pct(r.g.fraction)}`, PAT + LAB, cy + 7);
        // violin: smooth outline from the KDE, closed at both tails
        const xs = kde.x;
        const ys = kde.y;
        const X = (k) => vx0 + ((xs[k] - xs[0]) / (xs[xs.length - 1] - xs[0])) * (vx1 - vx0);
        let k0 = 0;
        let k1 = ys.length - 1;
        while (k0 < k1 && ys[k0] === 0) k0 += 1;
        while (k1 > k0 && ys[k1] === 0) k1 -= 1;
        if (k1 > k0) {
          ctx.beginPath();
          ctx.moveTo(X(k0), cy);
          for (let k = k0; k <= k1; k += 1) ctx.lineTo(X(k), cy - ys[k] * half);
          ctx.lineTo(X(k1), cy);
          for (let k = k1; k >= k0; k -= 1) ctx.lineTo(X(k), cy + ys[k] * half);
          ctx.closePath();
          ctx.globalAlpha = sel ? 0.22 : 0.42;
          ctx.fillStyle = color;
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.lineWidth = 1;
          ctx.lineJoin = "round";
          ctx.strokeStyle = shade(color);
          ctx.stroke();
        }
        // cells: unselected first, selected on top in the accent
        const dotCol = c.dark ? "rgba(255,255,255,0.5)" : "rgba(30,30,30,0.42)";
        ctx.fillStyle = sel ? (c.dark ? "rgba(255,255,255,0.18)" : "rgba(30,30,30,0.16)") : dotCol;
        dots.forEach((d) => {
          if (sel && sel.has(d.id)) return;
          ctx.fillRect(d.x - 0.9, d.y - 0.9, 1.8, 1.8);
        });
        if (sel) {
          ctx.fillStyle = c.dark ? "#69b1ff" : ACCENT;
          dots.forEach((d) => {
            if (!sel.has(d.id)) return;
            ctx.beginPath();
            ctx.arc(d.x, d.y, 2.1, 0, 2 * Math.PI);
            ctx.fill();
          });
        }
        // slim box: IQR bar and open median
        const [q1, med, q3] = q;
        if (Number.isFinite(med)) {
          const bh = Math.max(3, half * 0.22);
          ctx.fillStyle = c.dark ? "rgba(240,240,240,0.9)" : "rgba(25,25,25,0.85)";
          ctx.fillRect(lx(q1), cy - bh / 2, Math.max(1.5, lx(q3) - lx(q1)), bh);
          ctx.beginPath();
          ctx.arc(lx(med), cy, 3, 0, 2 * Math.PI);
          ctx.fillStyle = c.panel;
          ctx.fill();
          ctx.lineWidth = 1.4;
          ctx.strokeStyle = c.dark ? "rgba(240,240,240,0.95)" : "rgba(25,25,25,0.95)";
          ctx.stroke();
          ctx.lineWidth = 1;
        }
        // number of structures
        const bw = (r.g.walks.length / maxWalks) * (bx1 - bx0);
        const bh2 = Math.max(4, ROW * st.barThin * 0.55);
        drawBar(ctx, c, bx0, cy - bh2 / 2, bw, bh2, color);
        textRole(ctx, c, "tick", "textSecondary");
        ctx.textAlign = "left";
        ctx.fillText(`${r.g.walks.length}`, bx0 + bw + 4, cy);
      });
      return [];
    },
    [rows, geo, width, plotH, vx0, vx1, bx0, bx1, maxWalks, selected, selection, ROW, st, LO, HI, lx]
  );

  const rowAt = (y) => {
    const i = Math.floor((y - TOP) / ROW);
    return i >= 0 && i < rows.length ? i : -1;
  };
  const hitTest = (x, y) => {
    const i = rowAt(y);
    if (i < 0) return null;
    const r = rows[i];
    if (x >= vx0 - 4 && x <= vx1 + 4) {
      let best = null;
      let bd = 16;
      geo[i].dots.forEach((d) => {
        const dd = (d.x - x) ** 2 + (d.y - y) ** 2;
        if (dd < bd) {
          bd = dd;
          best = d;
        }
      });
      if (best) return { kind: "cell", p: r.p, g: r.g, cell: best.id, cn: best.v };
    }
    if (x < PAT) return null;
    return { kind: "group", p: r.p, g: r.g, q: geo[i].q };
  };
  const tooltip = (h) => {
    if (h.kind === "cell") return [h.cell, ["Patient", h.p.patient], ["Amplicon", h.g.key], ["Copies", h.cn.toFixed(1)], ["Click", "select this cell"]];
    if (h.kind === "group")
      return [
        `${h.p.patient} · ${h.g.key}`,
        ["Cells", `${h.g.nCells} of ${h.p.cellIds.length} (${pct(h.g.fraction)})`],
        ["Median copies", Number.isFinite(h.q[1]) ? `${h.q[1].toFixed(1)} (IQR ${h.q[0].toFixed(1)}–${h.q[2].toFixed(1)})` : "–"],
        ["Walks", h.g.walks.map((w) => w.label || w.name || w.id).join(", ")],
        ["Drag", "select cells in a copy range"],
      ];
    return null;
  };
  if (!rows.length) return <div ref={ref} />;
  return (
    <div ref={ref}>
      <FigureCanvas
        width={width}
        height={height}
        draw={draw}
        hitTest={hitTest}
        tooltip={tooltip}
        ariaLabel="Amplicon copies per cell by patient and gene set"
        onClick={(h, event) => {
          if (h.kind === "cell") onSelectCells?.(h.p.patient, [h.cell], { label: h.cell, mode: selectMode(event) });
          else onSelect?.({ patient: h.p.patient, key: h.g.key }, event);
        }}
        onDragStart={(x, y) => {
          const i = rowAt(y);
          if (i < 0 || x < vx0 - 6 || x > vx1 + 6) return null;
          return { mode: "band-x", x0: vx0, x1: vx1, y0: TOP + i * ROW + 1, y1: TOP + (i + 1) * ROW - 1, row: i };
        }}
        onDragEnd={({ a, b }, event) => {
          const i = rowAt(a[1]);
          if (i < 0) return;
          const lo = invLx(Math.min(a[0], b[0]));
          const hi = invLx(Math.max(a[0], b[0]));
          const r = rows[i];
          const ids = geo[i].dots.filter((d) => d.v >= lo && d.v <= hi).map((d) => d.id);
          if (ids.length) onSelectCells?.(r.p.patient, ids, { label: `ec${r.g.key} ${lo.toFixed(0)}–${hi.toFixed(0)} copies`, mode: selectMode(event) });
        }}
      />
      <div className="sc-fig-caption">Rows are the driver-gene sets of the ecDNA walks; copies are summed over the set&apos;s walks. Box: interquartile range; open dot: median. Drag along a violin to select cells by copies; click a row to open it below.</div>
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
