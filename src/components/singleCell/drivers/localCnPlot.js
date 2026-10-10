import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import useContainerWidth from "../useContainerWidth";
import usePlotTheme from "../usePlotTheme";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import { binAt, cnColorer } from "../../../helpers/singleCell/matrix";
import { toLocalPosition } from "../../../helpers/singleCell/driverSummary";
import { CARRIER_COLOR, COMPARATOR_COLOR } from "./useDriverEvidence";

const COLS = 360;
const mean = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN);

/**
 * Copy number of each cell around a locus as one canvas: carriers on top,
 * non-carriers below (rows in the given order), with the mean of each group
 * as lines above and the driver's position marked. Hover reads out the cell,
 * position and copy number.
 * @param lo / hi global window; marks [{ g, label }] positions to mark
 */
export default function LocalCnPlot({ carriers, others, lo, hi, marks = [] }) {
  const cn = useSelector((s) => s.SingleCell.cn);
  const palette = useSelector((s) => s.SingleCell.palette);
  const { chromoBins } = useSelector((s) => s.Settings);
  const theme = usePlotTheme();
  const [ref, width] = useContainerWidth(700);
  const canvasRef = useRef(null);
  const [hover, setHover] = useState(null);
  const data = cn?.status === "ok" ? cn.data : null;
  const M = { left: 86, right: 10, top: 6 };
  const lineH = 90;
  const plotW = Math.max(width - M.left - M.right, 50);
  const grid = useMemo(() => Array.from({ length: COLS }, (_, k) => lo + ((k + 0.5) / COLS) * (hi - lo)), [lo, hi]);
  const rowOf = useMemo(() => new Map((data?.cells || []).map((id, k) => [id, k])), [data]);
  const groups = useMemo(() => {
    if (!data) return null;
    const read = (ids) =>
      ids
        .map((id) => ({ id, row: data.rows[rowOf.get(id)] }))
        .filter((x) => x.row)
        .map(({ id, row }) => ({
          id,
          v: grid.map((g) => {
            const b = binAt(row.binIndex, g);
            return b >= 0 ? row.values[b] : NaN;
          }),
        }));
    return { a: read(carriers), b: read(others) };
  }, [data, rowOf, grid, carriers, others]);
  const nRows = groups ? groups.a.length + groups.b.length : 0;
  const rowH = nRows ? Math.max(1, Math.min(4, Math.floor(320 / nRows))) : 2;
  const heatTop = M.top + lineH + 14;
  const heatH = (nRows + 1) * rowH;
  const H = heatTop + heatH + 26;

  const means = useMemo(() => {
    if (!groups) return null;
    const m = (rows) => grid.map((_, k) => mean(rows.map((r) => r.v[k]).filter(Number.isFinite)));
    return { a: m(groups.a), b: m(groups.b) };
  }, [groups, grid]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !groups) return;
    c.width = COLS;
    c.height = nRows + 1;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(COLS, nRows + 1);
    const px = new Uint32Array(img.data.buffer);
    const color = cnColorer(palette, "total");
    const rows = [...groups.a, null, ...groups.b];
    rows.forEach((r, y) => {
      for (let x = 0; x < COLS; x += 1) px[y * COLS + x] = r ? color(Math.round(r.v[x])) : 0;
    });
    ctx.putImageData(img, 0, 0);
  }, [groups, nRows, palette]);

  if (!data) return <div style={{ fontSize: TYPE.label, color: theme.muted }}>Copy-number profiles are not loaded.</div>;
  const top = Math.max(4, ...means.a.filter(Number.isFinite), ...means.b.filter(Number.isFinite));
  const ymax = top > 12 ? Math.ceil(top / 10) * 10 : Math.ceil(top);
  const x = (g) => M.left + ((g - lo) / (hi - lo)) * plotW;
  const y = (v) => M.top + lineH - (Math.min(v, ymax) / ymax) * lineH;
  const path = (vals) => vals.map((v, k) => (Number.isFinite(v) ? `${k && Number.isFinite(vals[k - 1]) ? "L" : "M"}${x(grid[k]).toFixed(1)},${y(v).toFixed(1)}` : "")).join("");
  const a = toLocalPosition(chromoBins, lo);
  const b = toLocalPosition(chromoBins, hi);
  const mb = (p) => `${(p.pos / 1e6).toFixed(1)} Mb`;
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    const k = Math.floor(((px - M.left) / plotW) * COLS);
    if (k < 0 || k >= COLS) return setHover(null);
    let cell = null;
    if (py >= heatTop) {
      const yy = Math.floor((py - heatTop) / rowH);
      if (yy < groups.a.length) cell = { ...groups.a[yy], group: "carrier" };
      else if (yy > groups.a.length && yy - groups.a.length - 1 < groups.b.length) cell = { ...groups.b[yy - groups.a.length - 1], group: "non-carrier" };
    }
    return setHover({ k, cell, px, py });
  };
  const where = hover ? toLocalPosition(chromoBins, grid[hover.k]) : null;
  const fmt = (v) => (Number.isFinite(v) ? v.toFixed(1) : "–");
  const ticks = ymax > 12 ? [0, ymax / 2, ymax] : Array.from({ length: ymax + 1 }, (_, k) => k).filter((k) => ymax <= 6 || k % 2 === 0);
  return (
    <div ref={ref} style={{ width: "100%", position: "relative" }}>
      <svg width={width} height={H} style={{ position: "absolute", left: 0, top: 0 }} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="copy number around the driver">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} stroke={theme.grid} />
            <text x={M.left - 6} y={y(t) + 4} textAnchor="end" fontSize={TYPE.tick} fill={theme.muted}>
              {t}
            </text>
          </g>
        ))}
        <text x={4} y={M.top + 12} fontSize={TYPE.tick} fill={theme.textSecondary}>
          mean CN
        </text>
        <path d={path(means.b)} fill="none" stroke={COMPARATOR_COLOR} strokeWidth={1.6} />
        <path d={path(means.a)} fill="none" stroke={CARRIER_COLOR} strokeWidth={1.6} />
        <text x={4} y={heatTop + (groups.a.length * rowH) / 2 + 4} fontSize={TYPE.tick} fill={CARRIER_COLOR}>
          {`carriers (${groups.a.length})`}
        </text>
        <text x={4} y={heatTop + (groups.a.length + 1) * rowH + (groups.b.length * rowH) / 2 + 4} fontSize={TYPE.tick} fill={COMPARATOR_COLOR}>
          {`others (${groups.b.length})`}
        </text>
        {marks.map((m) => (
          <g key={`${m.g}-${m.label}`}>
            <line x1={x(m.g)} x2={x(m.g)} y1={M.top} y2={heatTop + heatH} stroke={theme.text} strokeDasharray="3 3" />
            <text x={x(m.g) + 3} y={M.top + 10} fontSize={TYPE.tick} fill={theme.text}>
              {m.label}
            </text>
          </g>
        ))}
        {a && (
          <text x={M.left} y={H - 8} fontSize={TYPE.tick} fill={theme.muted}>
            {`chr${a.chrom}:${mb(a)}`}
          </text>
        )}
        {b && (
          <text x={M.left + plotW} y={H - 8} textAnchor="end" fontSize={TYPE.tick} fill={theme.muted}>
            {`chr${b.chrom}:${mb(b)}`}
          </text>
        )}
        {hover && <line x1={x(grid[hover.k])} x2={x(grid[hover.k])} y1={M.top} y2={heatTop + heatH} stroke={theme.textSecondary} pointerEvents="none" />}
      </svg>
      <canvas ref={canvasRef} style={{ position: "absolute", left: M.left, top: heatTop, width: plotW, height: nRows * rowH + rowH, imageRendering: "pixelated", pointerEvents: "none" }} />
      <div style={{ height: H }} />
      {hover && where && (
        <div style={{ position: "absolute", left: Math.min(hover.px + 12, width - 240), top: Math.max(hover.py - 50, 0), pointerEvents: "none", background: theme.raised, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 4, padding: "2px 8px", fontSize: TYPE.tick, whiteSpace: "nowrap", zIndex: 3 }}>
          <div style={{ fontWeight: 600 }}>{`chr${where.chrom}:${(where.pos / 1e6).toFixed(2)} Mb`}</div>
          {hover.cell ? (
            <div>{`${hover.cell.id} (${hover.cell.group}): CN ${fmt(hover.cell.v[hover.k])}`}</div>
          ) : (
            <>
              <div style={{ color: CARRIER_COLOR }}>{`carriers ${fmt(means.a[hover.k])}`}</div>
              <div style={{ color: COMPARATOR_COLOR }}>{`others ${fmt(means.b[hover.k])}`}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
