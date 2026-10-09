import React, { useCallback, useMemo, useState } from "react";
import { Select, Space, Switch, Typography } from "antd";
import FigureCanvas from "./figureCanvas";
import { drawXAxis, textRole } from "./figureKit";
import useContainerWidth from "../useContainerWidth";
import { binAt } from "../../../helpers/singleCell/matrix";
import { isNormalClone } from "../../../helpers/singleCell/figures";
import { contourSegments, fitLine, kde2d, niceTicks, pointInPolygon } from "../../../helpers/singleCell/figureMath";
import { selectMode } from "./cellSelection";

const { Text } = Typography;
const PAD = { left: 46, right: 14, top: 14, bottom: 40 };
const LEVELS = [0.15, 0.4, 0.7];

/** Per-cell values of a variable: "g:<amplicon set>" (walk copies) or "gene:<name>" (segment CN). */
function valuesOf(key, { cellIds, groups, cnById, genePos }) {
  const out = new Float64Array(cellIds.length).fill(NaN);
  if (key?.startsWith("g:")) {
    const g = groups.find((x) => `g:${x.key}` === key);
    if (!g) return out;
    const idx = new Map(g.cellIds.map((id, i) => [id, i]));
    cellIds.forEach((id, i) => {
      const k = idx.get(id);
      if (k != null) out[i] = g.cn[k];
    });
  } else if (key?.startsWith("gene:")) {
    const g = genePos.get(key.slice(5));
    if (!Number.isFinite(g)) return out;
    cellIds.forEach((id, i) => {
      const row = cnById.get(id);
      if (!row) return;
      const b = binAt(row.binIndex, g);
      if (b >= 0) out[i] = row.values[b];
    });
  }
  return out;
}

/**
 * Fig 5E: copies of one amplicon / gene against another, per cell, coloured
 * by clone with density contours and a least-squares slope per clone (ecDNA
 * co-carriage gives a line; an integrated amplicon a tight cluster with a
 * fixed ratio). Lasso cells to select them.
 */
export default function GenePairScatter({ patient, cells, groups = [], cnEntry, genes = [], cloneColors = {}, selected, onSelect, height = 340 }) {
  const [ref, measured] = useContainerWidth(420);
  const width = Math.max(300, measured);
  const genePos = useMemo(() => new Map(genes.map((g) => [g.name, g.g])), [genes]);
  const options = useMemo(
    () => [
      ...groups.map((g) => ({ value: `g:${g.key}`, label: `ec${g.key} copies` })),
      ...(cnEntry?.cellRows?.length ? genes.map((g) => ({ value: `gene:${g.name}`, label: `${g.name} CN` })) : []),
    ],
    [groups, genes, cnEntry]
  );
  const defaults = useMemo(() => {
    const has = (v) => options.some((o) => o.value === v);
    if (has("gene:CDK4") && has("gene:MDM2")) return ["gene:CDK4", "gene:MDM2"];
    if (options.length >= 2) return [options[0].value, options[1].value];
    return [options[0]?.value, options[0]?.value];
  }, [options]);
  const [pick, setPick] = useState({});
  const xKey = options.some((o) => o.value === pick.x) ? pick.x : defaults[0];
  const yKey = options.some((o) => o.value === pick.y) ? pick.y : defaults[1];
  const [contours, setContours] = useState(true);

  const cellIds = useMemo(() => cells.filter((c) => !isNormalClone(c.clone_id)).map((c) => c.cell_id), [cells]);
  const cloneOf = useMemo(() => new Map(cells.map((c) => [c.cell_id, c.clone_id])), [cells]);
  const cnById = useMemo(() => new Map((cnEntry?.cellRows || []).map((c) => [c.cellId, c.row])), [cnEntry]);
  const data = useMemo(() => {
    const ctx = { cellIds, groups, cnById, genePos };
    const xs = valuesOf(xKey, ctx);
    const ys = valuesOf(yKey, ctx);
    const pts = [];
    cellIds.forEach((id, i) => Number.isFinite(xs[i]) && Number.isFinite(ys[i]) && pts.push({ id, x: xs[i], y: ys[i], clone: cloneOf.get(id) }));
    const mx = Math.max(1, ...pts.map((p) => p.x));
    const my = Math.max(1, ...pts.map((p) => p.y));
    const xt = niceTicks(0, mx * 1.05, 5);
    const yt = niceTicks(0, my * 1.05, 5);
    const X1 = Math.max(xt[xt.length - 1], mx * 1.02);
    const Y1 = Math.max(yt[yt.length - 1], my * 1.02);
    // per clone: points, fit, density grid
    const byClone = new Map();
    pts.forEach((p) => {
      const k = p.clone ?? "NA";
      if (!byClone.has(k)) byClone.set(k, []);
      byClone.get(k).push(p);
    });
    const clones = [...byClone.entries()]
      .map(([clone, list]) => ({
        clone,
        list,
        fit: fitLine(list.map((p) => p.x), list.map((p) => p.y)),
        ratio: (() => {
          const r = list.filter((p) => p.x > 0).map((p) => p.y / p.x).sort((a, b) => a - b);
          return r.length ? r[Math.floor(r.length / 2)] : NaN;
        })(),
        grid: list.length >= 8 ? kde2d(list.map((p) => [p.x, p.y]), { x0: 0, x1: X1, y0: 0, y1: Y1, gx: 56, gy: 56 }) : null,
      }))
      .sort((a, b) => b.list.length - a.list.length);
    return { pts, xt, yt, X1, Y1, clones, all: fitLine(pts.map((p) => p.x), pts.map((p) => p.y)) };
  }, [cellIds, groups, cnById, genePos, xKey, yKey, cloneOf]);

  const plot = { x0: PAD.left, x1: width - PAD.right, y0: PAD.top, y1: height - PAD.bottom };
  const sx = useCallback((v) => plot.x0 + (v / data.X1) * (plot.x1 - plot.x0), [plot.x0, plot.x1, data.X1]);
  const sy = useCallback((v) => plot.y1 - (v / data.Y1) * (plot.y1 - plot.y0), [plot.y0, plot.y1, data.Y1]);
  const colorOf = useCallback((clone) => cloneColors[clone] || "#8c8c8c", [cloneColors]);
  const labelOf = (k) => options.find((o) => o.value === k)?.label || "";

  const draw = useCallback(
    (ctx, c) => {
      const { x0, x1, y0, y1 } = plot;
      // axes + grid
      drawXAxis(ctx, c, { ticks: data.xt.map((v) => ({ v, x: sx(v) })), x0, x1, y: y1, at: "bottom", title: labelOf(xKey), gridFrom: y0, gridTo: y1 });
      textRole(ctx, c, "tick");
      ctx.textAlign = "right";
      data.yt.forEach((v) => {
        const y = sy(v);
        ctx.fillStyle = c.grid;
        ctx.fillRect(x0, Math.round(y), x1 - x0, 1);
        textRole(ctx, c, "tick");
        ctx.textAlign = "right";
        ctx.fillText(`${v}`, x0 - 5, y);
      });
      ctx.strokeStyle = c.axis || c.muted;
      ctx.beginPath();
      ctx.moveTo(x0 + 0.5, y0);
      ctx.lineTo(x0 + 0.5, y1);
      ctx.stroke();
      ctx.save();
      ctx.translate(12, (y0 + y1) / 2);
      ctx.rotate(-Math.PI / 2);
      textRole(ctx, c, "head");
      ctx.textAlign = "center";
      ctx.fillText(labelOf(yKey), 0, 0);
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, x1 - x0, y1 - y0);
      ctx.clip();
      // density contours per clone
      if (contours) {
        data.clones.forEach(({ clone, grid }) => {
          if (!grid) return;
          ctx.strokeStyle = colorOf(clone);
          LEVELS.forEach((lv, k) => {
            ctx.globalAlpha = 0.45 + 0.2 * k;
            ctx.lineWidth = 1 + 0.3 * k;
            ctx.beginPath();
            contourSegments(grid, lv).forEach(([xa, ya, xb, yb]) => {
              ctx.moveTo(sx(xa), sy(ya));
              ctx.lineTo(sx(xb), sy(yb));
            });
            ctx.stroke();
          });
          ctx.globalAlpha = 1;
          ctx.lineWidth = 1;
        });
      }
      // overall fit
      if (Number.isFinite(data.all.slope)) {
        ctx.strokeStyle = c.text;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(sx(0), sy(data.all.intercept));
        ctx.lineTo(sx(data.X1), sy(data.all.intercept + data.all.slope * data.X1));
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // points: unselected faded when a selection exists
      const sel = selected?.size ? selected : null;
      data.pts.forEach((p) => {
        if (sel && sel.has(p.id)) return;
        ctx.globalAlpha = sel ? 0.25 : 0.85;
        ctx.fillStyle = colorOf(p.clone);
        ctx.beginPath();
        ctx.arc(sx(p.x), sy(p.y), 2.6, 0, 2 * Math.PI);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      if (sel) {
        data.pts.forEach((p) => {
          if (!sel.has(p.id)) return;
          ctx.fillStyle = colorOf(p.clone);
          ctx.beginPath();
          ctx.arc(sx(p.x), sy(p.y), 3.2, 0, 2 * Math.PI);
          ctx.fill();
          ctx.lineWidth = 1.4;
          ctx.strokeStyle = c.dark ? "#69b1ff" : "#1677ff";
          ctx.stroke();
          ctx.lineWidth = 1;
        });
      }
      ctx.restore();
      // per-clone slope / R² (top left)
      textRole(ctx, c, "caption", "text");
      ctx.textAlign = "left";
      let ty = y0 + 8;
      const fmt = (f) => (Number.isFinite(f.slope) ? `slope ${f.slope.toFixed(2)} · R² ${f.r2.toFixed(2)}` : "");
      ctx.fillText(`All (${data.pts.length}) ${fmt(data.all)}`, x0 + 6, ty);
      data.clones
        .filter((k) => k.list.length >= 5)
        .slice(0, 5)
        .forEach((k) => {
          ty += 14;
          ctx.fillStyle = colorOf(k.clone);
          ctx.fillText(`${k.clone} (${k.list.length}) ${k.fit.r2 > 0.3 ? fmt(k.fit) : `ratio ${Number.isFinite(k.ratio) ? k.ratio.toFixed(2) : "–"}`}`, x0 + 6, ty);
        });
      return [];
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, sx, sy, plot.x0, plot.x1, plot.y0, plot.y1, selected, contours, colorOf, xKey, yKey]
  );

  const hitTest = (x, y) => {
    let best = null;
    let bd = 36;
    data.pts.forEach((p) => {
      const d = (sx(p.x) - x) ** 2 + (sy(p.y) - y) ** 2;
      if (d < bd) {
        bd = d;
        best = p;
      }
    });
    return best;
  };

  if (options.length < 2) return <div ref={ref}><Text type="secondary">Needs two amplicons or amplified genes with copy number.</Text></div>;
  return (
    <div ref={ref}>
      <Space size={6} wrap style={{ marginBottom: 4 }}>
        <Select size="small" style={{ width: 150 }} value={xKey} options={options} onChange={(v) => setPick((p) => ({ ...p, x: v }))} />
        <Text type="secondary">vs</Text>
        <Select size="small" style={{ width: 150 }} value={yKey} options={options} onChange={(v) => setPick((p) => ({ ...p, y: v }))} />
        <Space size={4}>
          <Switch size="small" checked={contours} onChange={setContours} />
          <Text type="secondary">Contours</Text>
        </Space>
      </Space>
      <FigureCanvas
        width={width}
        height={height}
        draw={draw}
        hitTest={hitTest}
        tooltip={(p) => [p.id, ["Clone", p.clone ?? "–"], [labelOf(xKey), p.x.toFixed(1)], [labelOf(yKey), p.y.toFixed(1)]]}
        ariaLabel={`${patient}: ${labelOf(xKey)} against ${labelOf(yKey)} per cell`}
        onClick={(p, event) => onSelect?.([p.id], { label: p.id, mode: selectMode(event) })}
        onDragStart={(x, y) => (x >= plot.x0 && x <= plot.x1 && y >= plot.y0 && y <= plot.y1 ? { mode: "lasso", ...plot } : null)}
        onDragEnd={({ path }, event) => {
          if (path.length < 3) return;
          const ids = data.pts.filter((p) => pointInPolygon(sx(p.x), sy(p.y), path)).map((p) => p.id);
          if (ids.length) onSelect?.(ids, { label: `${ids.length} cells lassoed in ${labelOf(xKey)} vs ${labelOf(yKey)}`, mode: selectMode(event) });
        }}
      />
    </div>
  );
}
