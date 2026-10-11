import React, { useCallback, useMemo } from "react";
import FigureCanvas, { fitText, jitter } from "./figureCanvas";
import { textRole } from "./figureKit";
import useContainerWidth from "../useContainerWidth";
import { quantiles } from "../../../helpers/singleCell/figures";
import { mannWhitney, niceTicks, pStars } from "../../../helpers/singleCell/figureMath";
import { selectMode } from "./cellSelection";

const PAD = { left: 44, right: 10, top: 18, bottom: 54 };
const H = 330;

/**
 * Fig 4 (right), live: copies per carrier cell of the patient's main ecDNA
 * variants as boxes with the cells as dots, and rank-sum brackets between
 * the focused variant and the others (stars as in the paper). Click a box to
 * select its carriers, a dot to select its cell; selected cells are ringed.
 */
export default function VariantCopiesBox({ walks = [], order = [], focusId, colorOf, selected, onSelect, onFocus }) {
  const [ref, measured] = useContainerWidth(420);
  const width = Math.max(300, measured);
  const groups = useMemo(
    () =>
      walks.map((w) => {
        const pts = [];
        order.forEach((id) => {
          const v = Number(w.cells?.[id]);
          if (v >= 1) pts.push({ id, v });
        });
        const vals = pts.map((p) => p.v);
        return { w, pts, vals, q: quantiles(vals, [0, 0.25, 0.5, 0.75, 1]) };
      }),
    [walks, order]
  );
  const fi = Math.max(0, groups.findIndex((g) => g.w.id === focusId));
  const tests = useMemo(
    () =>
      groups
        .map((g, k) => (k === fi ? null : { k, ...mannWhitney(groups[fi]?.vals || [], g.vals) }))
        .filter((t) => t && Number.isFinite(t.p))
        .slice(0, 4),
    [groups, fi]
  );
  const ymax = Math.max(4, ...groups.map((g) => g.q[4] || 0));
  const top = PAD.top + tests.length * 14;
  const y0 = H - PAD.bottom;
  const sy = useCallback((v) => y0 - (v / ymax) * (y0 - top), [y0, top, ymax]);
  const bw = (width - PAD.left - PAD.right) / Math.max(1, groups.length);
  const cx = useCallback((k) => PAD.left + (k + 0.5) * bw, [bw]);

  const draw = useCallback(
    (ctx, c) => {
      const hits = [];
      // axis
      textRole(ctx, c, "tick");
      ctx.textAlign = "right";
      niceTicks(0, ymax, 5).forEach((v) => {
        ctx.fillStyle = c.grid;
        ctx.fillRect(PAD.left, Math.round(sy(v)), width - PAD.left - PAD.right, 1);
        textRole(ctx, c, "tick");
        ctx.textAlign = "right";
        ctx.fillText(`${v}`, PAD.left - 5, sy(v));
      });
      ctx.save();
      ctx.translate(12, (top + y0) / 2);
      ctx.rotate(-Math.PI / 2);
      textRole(ctx, c, "head", "text");
      ctx.textAlign = "center";
      ctx.fillText("Amplicon copies (carriers)", 0, 0);
      ctx.restore();
      ctx.strokeStyle = c.dark ? "#8c8c8c" : "#262626";
      ctx.strokeRect(PAD.left + 0.5, top - 6.5, width - PAD.left - PAD.right - 1, y0 - top + 7);
      groups.forEach((g, k) => {
        const x = cx(k);
        const col = colorOf ? colorOf(g.w.id) : "#1677ff";
        const half = Math.min(26, bw * 0.3);
        if (g.vals.length) {
          const [mn, q1, med, q3, mx] = g.q;
          ctx.strokeStyle = c.dark ? "#d9d9d9" : "#262626";
          ctx.beginPath();
          ctx.moveTo(x, sy(mn));
          ctx.lineTo(x, sy(q1));
          ctx.moveTo(x, sy(q3));
          ctx.lineTo(x, sy(mx));
          ctx.stroke();
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = col;
          ctx.fillRect(x - half, sy(q3), 2 * half, Math.max(1, sy(q1) - sy(q3)));
          ctx.globalAlpha = 1;
          ctx.strokeRect(x - half + 0.5, sy(q3) + 0.5, 2 * half - 1, Math.max(1, sy(q1) - sy(q3)));
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x - half, sy(med));
          ctx.lineTo(x + half, sy(med));
          ctx.stroke();
          ctx.lineWidth = 1;
          hits.push({ x0: x - half, x1: x + half, y0: sy(q3), y1: sy(q1), kind: "box", g });
        }
        // cells
        g.pts.forEach((p, i) => {
          const px = x + jitter(i + k * 977) * half * 1.5;
          const py = sy(p.v);
          const isSel = selected?.has(p.id);
          ctx.beginPath();
          ctx.arc(px, py, isSel ? 3 : 2, 0, 2 * Math.PI);
          ctx.fillStyle = c.dark ? "rgba(240,240,240,0.75)" : "rgba(20,20,20,0.7)";
          ctx.fill();
          if (isSel) {
            ctx.strokeStyle = c.dark ? "#69b1ff" : "#1677ff";
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.lineWidth = 1;
          }
          hits.push({ x0: px - 3, x1: px + 3, y0: py - 3, y1: py + 3, kind: "cell", p, g });
        });
        // label
        textRole(ctx, c, "label", "text");
        ctx.fillStyle = col;
        ctx.font = ctx.font.replace(/^(\d+ )?/, k === fi ? "700 " : "500 ");
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(fitText(ctx, g.w.label || g.w.name || `walk ${g.w.id}`, bw - 4), x, y0 + 6);
        textRole(ctx, c, "tick");
        ctx.textBaseline = "top";
        ctx.textAlign = "center";
        ctx.fillText(`(${g.vals.length})`, x, y0 + 22);
        ctx.textBaseline = "middle";
        hits.push({ x0: x - bw / 2, x1: x + bw / 2, y0: y0 + 4, y1: y0 + 36, kind: "label", g });
      });
      // brackets: focused vs each other variant
      tests.forEach((t, j) => {
        const y = PAD.top + j * 14 + 4;
        const a = cx(fi);
        const b = cx(t.k);
        ctx.strokeStyle = c.text;
        ctx.beginPath();
        ctx.moveTo(a, y + 4);
        ctx.lineTo(a, y);
        ctx.lineTo(b, y);
        ctx.lineTo(b, y + 4);
        ctx.stroke();
        textRole(ctx, c, "label", "text");
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(pStars(t.p), (a + b) / 2, y + 1);
        ctx.textBaseline = "middle";
        hits.push({ x0: Math.min(a, b), x1: Math.max(a, b), y0: y - 8, y1: y + 4, kind: "test", t });
      });
      return hits;
    },
    [groups, tests, fi, ymax, sy, width, top, y0, bw, cx, colorOf, selected]
  );
  if (!groups.length) return <div ref={ref} className="sc-fig-empty">No ecDNA variants with carriers.</div>;
  return (
    <div ref={ref}>
      <FigureCanvas
        width={width}
        height={H}
        draw={draw}
        ariaLabel="Amplicon copies per ecDNA variant"
        tooltip={(h) => {
          const name = (g) => g.w.label || g.w.name || `walk ${g.w.id}`;
          if (h.kind === "cell") return [h.p.id, [name(h.g), `${h.p.v.toFixed(1)} copies`], ["Click", "select this cell (Cmd adds)"]];
          if (h.kind === "test") return [`${name(groups[fi])} vs ${name(groups[h.t.k])}`, ["Wilcoxon rank-sum p", h.t.p < 1e-4 ? h.t.p.toExponential(1) : h.t.p.toFixed(4)]];
          const [, q1, med, q3] = h.g.q;
          return [name(h.g), ["Carriers", h.g.vals.length], ["Median (IQR)", `${med?.toFixed(0)} (${q1?.toFixed(0)}–${q3?.toFixed(0)})`], ["Click", h.kind === "label" ? "focus this variant" : "select its carriers"]];
        }}
        onClick={(h, event) => {
          const name = (g) => g.w.label || g.w.name || `walk ${g.w.id}`;
          if (h.kind === "cell") onSelect?.([h.p.id], { label: h.p.id, mode: selectMode(event) });
          else if (h.kind === "box") onSelect?.(h.g.pts.map((p) => p.id), { label: `${name(h.g)} carriers`, mode: selectMode(event) });
          else if (h.kind === "label") onFocus?.(h.g.w.id);
        }}
      />
    </div>
  );
}
