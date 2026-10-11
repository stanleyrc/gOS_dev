import React, { useCallback, useMemo } from "react";
import FigureCanvas, { fitText } from "./figureCanvas";
import { textRole } from "./figureKit";
import useContainerWidth from "../useContainerWidth";
import { geneSetColor, isNormalClone } from "../../../helpers/singleCell/figures";
import { selectMode } from "./cellSelection";

const PAD = { left: 40, right: 8, top: 10, bottom: 54 };

/**
 * Fig 4F: proportion of each clade's cells carrying each amplicon (copies >=
 * minCn). Click a bar to select those carriers.
 */
export default function CladeCarrierBars({ cells, groups = [], minCn = 1, cloneColors = {}, selected, onSelect, height = 300, minCells = 3 }) {
  const [ref, measured] = useContainerWidth(380);
  const width = Math.max(260, measured);
  const data = useMemo(() => {
    const byClone = new Map();
    cells.forEach((c) => {
      if (isNormalClone(c.clone_id) || c.clone_id == null) return;
      if (!byClone.has(c.clone_id)) byClone.set(c.clone_id, []);
      byClone.get(c.clone_id).push(c.cell_id);
    });
    const clones = [...byClone.entries()].filter(([, ids]) => ids.length >= minCells).sort((a, b) => `${a[0]}`.localeCompare(`${b[0]}`, undefined, { numeric: true }));
    const idx = groups.map((g) => new Map(g.cellIds.map((id, i) => [id, g.cn[i]])));
    return clones.map(([clone, ids]) => ({
      clone,
      n: ids.length,
      bars: groups.map((g, k) => {
        const carriers = ids.filter((id) => (idx[k].get(id) || 0) >= minCn);
        return { g, carriers, f: carriers.length / ids.length };
      }),
    }));
  }, [cells, groups, minCn, minCells]);

  const x0 = PAD.left;
  const x1 = width - PAD.right;
  const y0 = PAD.top;
  const y1 = height - PAD.bottom;
  const slot = (x1 - x0) / Math.max(1, data.length);
  const bw = Math.max(4, Math.min(28, (slot * 0.8) / Math.max(1, groups.length)));
  const barX = (i, k) => x0 + i * slot + (slot - bw * groups.length) / 2 + k * bw;
  const sy = (f) => y1 - f * (y1 - y0);

  const draw = useCallback(
    (ctx, c) => {
      textRole(ctx, c, "tick");
      ctx.textAlign = "right";
      [0, 0.25, 0.5, 0.75, 1].forEach((f) => {
        ctx.fillStyle = c.grid;
        ctx.fillRect(x0, Math.round(sy(f)), x1 - x0, 1);
        textRole(ctx, c, "tick");
        ctx.textAlign = "right";
        ctx.fillText(f.toFixed(2), x0 - 4, sy(f));
      });
      const sel = selected?.size ? selected : null;
      data.forEach((d, i) => {
        d.bars.forEach((b, k) => {
          const x = barX(i, k);
          const h = y1 - sy(b.f);
          ctx.fillStyle = geneSetColor(b.g.key);
          ctx.globalAlpha = sel && !b.carriers.some((id) => sel.has(id)) ? 0.35 : 1;
          ctx.fillRect(x + 1, sy(b.f), bw - 2, h);
          ctx.globalAlpha = 1;
        });
        // clade label with its colour
        ctx.fillStyle = cloneColors[d.clone] || "#8c8c8c";
        ctx.fillRect(x0 + i * slot + slot * 0.1, y1 + 4, slot * 0.8, 4);
        textRole(ctx, c, "label", "text");
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(fitText(ctx, `${d.clone}`.replace(/^clone[\s_-]*/i, ""), slot - 2), x0 + i * slot + slot / 2, y1 + 11);
        textRole(ctx, c, "caption");
        ctx.textBaseline = "top";
        ctx.textAlign = "center";
        ctx.fillText(slot >= 34 ? `n=${d.n}` : `${d.n}`, x0 + i * slot + slot / 2, y1 + 25);
        ctx.textBaseline = "middle";
      });
      ctx.strokeStyle = c.axis || c.muted;
      ctx.beginPath();
      ctx.moveTo(x0 + 0.5, y0);
      ctx.lineTo(x0 + 0.5, y1);
      ctx.lineTo(x1, y1 + 0.5);
      ctx.stroke();
      ctx.save();
      ctx.translate(10, (y0 + y1) / 2);
      ctx.rotate(-Math.PI / 2);
      textRole(ctx, c, "head");
      ctx.textAlign = "center";
      ctx.fillText("Proportion of cells", 0, 0);
      ctx.restore();
      ctx.save();
      textRole(ctx, c, "caption");
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("Clone (n cells)", x0, y1 + 36);
      ctx.restore();
      const hits = [];
      data.forEach((d, i) => d.bars.forEach((b, k) => hits.push({ x0: barX(i, k), x1: barX(i, k) + bw, y0: Math.min(sy(b.f), y1 - 6), y1, d, b })));
      return hits;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, width, height, selected, cloneColors, bw, slot]
  );
  if (!data.length || !groups.length) return <div ref={ref} />;
  return (
    <div ref={ref}>
      <FigureCanvas
        width={width}
        height={height}
        draw={draw}
        ariaLabel="Proportion of each clade's cells carrying each amplicon"
        tooltip={(h) => [`${h.d.clone} · ec${h.b.g.key}`, ["Carriers", `${h.b.carriers.length} of ${h.d.n} (${Math.round(100 * h.b.f)}%)`], ["Click", "select the carriers"]]}
        onClick={(h, event) => h.b.carriers.length && onSelect?.(h.b.carriers, { label: `ec${h.b.g.key} carriers in ${h.d.clone}`, mode: selectMode(event) })}
      />
      <div className="sc-fig-keys">
        {groups.map((g) => (
          <span key={g.key} className="sc-fig-key">
            <span className="sc-fig-swatch" style={{ background: geneSetColor(g.key) }} />
            {`ec${g.key}`}
          </span>
        ))}
      </div>
    </div>
  );
}
