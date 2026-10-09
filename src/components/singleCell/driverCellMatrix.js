import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Button, Card, Checkbox, Space, Tooltip, Typography } from "antd";
import { TableOutlined, ZoomInOutlined, ZoomOutOutlined } from "@ant-design/icons";
import useContainerWidth from "./useContainerWidth";
import usePixelRatio from "./usePixelRatio";
import useTreeView from "./useTreeView";
import TreeTop from "./treeTop";
import SvgExportButton from "./svgExportButton";
import singleCellActions from "../../redux/singleCell/actions";
import filteredEventsActions from "../../redux/filteredEvents/actions";
import { cladeFitScore } from "../../helpers/singleCell/cladeFit";
import { eventTooltipLines } from "../../helpers/singleCell/cohortStats";
import { bufferedColumns, carrierMasks, clampView, drawMatrix, isFullView, matrixHit, panView, viewTransform, wheelFactor, wheelPixels, zoomView } from "../../helpers/singleCell/matrixZoom";
import { Swatches } from "./cohort/charts";
import HintLine, { Provenance } from "./hintLine";
import { INK, TYPE } from "../../helpers/singleCell/plotTheme";

const { Text } = Typography;
const CLASS_COLORS = { amp: "#D7191C", homdel: "#2C7BB6", fusion: "#7B3294", trunc: "#1A1A1A", splice: "#E6AB02", missense: "#1B9E77", other: "#8c8c8c" };
const ROW_H = 24;
const LABEL_W = 240;
const RIGHT_W = 90;
const STRIP_H = 12;
const TREE_H = 160;
const SETTLE_MS = 140; // a wheel gesture commits to React once idle this long

/**
 * Driver alterations (rows) x cells in tree order (columns) under the
 * phylogeny drawn leaves-down. Zoom into a clade (click it in the tree, or
 * Cmd/Ctrl-wheel / pinch over the plot; Shift-wheel or a sideways swipe
 * pans), or into the current selection; a filled cell = the cell carries the
 * alteration. Rows are ordered trunk-first with the fraction of tumor cells
 * and the clade fit at the right.
 *
 * The cells are painted on a canvas. During a wheel gesture the canvas is
 * repainted once per frame and the tree / clone strip (SVG) only get a
 * transform; React re-renders once the gesture settles.
 */
export default function DriverCellMatrix({ drivers }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const [ref, width] = useContainerWidth(1000);
  const dpr = usePixelRatio();
  const { order, treeLayout, cellById } = useTreeView();
  const { cloneColors, selectedCellIds, hoveredCellId, layout } = useSelector((s) => s.SingleCell);
  const [hoverRange, setHoverRange] = useState(null);
  const [view, setView] = useState(null); // committed [v0, v1) column window, null = every cell
  const [zoomOnClick, setZoomOnClick] = useState(true);
  const plotRef = useRef(null); // wraps svg + canvas: the wheel target
  const treeGRef = useRef(null); // the SVG group a gesture transforms
  const canvasRef = useRef(null);
  const tipRef = useRef(null);
  const liveRef = useRef(null); // the view under the gesture (ahead of `view` until it settles)
  const paintRef = useRef({}); // everything paint() needs, refreshed every render
  const frameRef = useRef(0);
  const settleRef = useRef(0);
  const hoverIdRef = useRef(null);
  const col = useMemo(() => new Map(order.map((id, i) => [id, i])), [order]);
  const depthOf = useMemo(() => {
    if (!treeLayout) return () => 0;
    const d = new Int32Array(treeLayout.nodes.length);
    treeLayout.nodes.forEach((n, k) => (d[k] = n.parent >= 0 ? d[n.parent] + 1 : 0));
    return (node) => (node == null ? 99 : d[node]);
  }, [treeLayout]);
  const rows = useMemo(
    () =>
      drivers
        .map((d) => {
          const carriers = `${d.event.cell_ids || ""}`.split(",").filter(Boolean);
          const fit = treeLayout ? cladeFitScore(carriers, treeLayout) : { score: NaN, node: null, clade: 0 };
          return { ...d, carriers: new Set(carriers), fit, depth: depthOf(fit.node) };
        })
        .sort((a, b) => a.depth - b.depth || b.fraction - a.fraction),
    [drivers, treeLayout, depthOf]
  );
  const masks = useMemo(() => carrierMasks(rows, order), [rows, order]);
  const rowColors = useMemo(() => rows.map((r) => CLASS_COLORS[r.class] || CLASS_COLORS.other), [rows]);
  const leafClones = useMemo(() => order.map((id) => cellById.get(id)?.clone_id ?? null), [order, cellById]);
  // clone blocks (contiguous runs) for the strip and the dashed separators
  const blocks = useMemo(() => {
    const out = [];
    leafClones.forEach((c, i) => {
      const last = out[out.length - 1];
      if (last && last.clone === c) last.last = i;
      else out.push({ clone: c, first: i, last: i });
    });
    return out;
  }, [leafClones]);
  const separators = useMemo(() => blocks.slice(1).map((b) => b.first), [blocks]);
  const selectedCols = useMemo(() => new Set(selectedCellIds.map((id) => col.get(id)).filter((c) => c != null)), [selectedCellIds, col]);
  const selectedMask = useMemo(() => {
    if (!selectedCols.size) return null;
    const m = new Uint8Array(order.length);
    selectedCols.forEach((c) => (m[c] = 1));
    return m;
  }, [selectedCols, order]);

  const n = order.length;
  const hasContent = n > 0 && rows.length > 0;
  const matW = Math.max(200, width - LABEL_W - RIGHT_W - 8);
  const matH = rows.length * ROW_H;
  const full = isFullView(view, n);
  const [d0, d1] = full ? [0, Math.max(n, 1)] : view;
  const cellW = matW / (d1 - d0);
  const xOf = (i) => LABEL_W + (i - d0) * cellW;
  const top = (treeLayout ? TREE_H + 6 : 0) + STRIP_H + 8;
  paintRef.current = { n, matW, matH, dpr, drawn: [d0, d1], masks, rowColors, selectedMask, separators };

  // Paint the live view: cells on the canvas, a transform on the SVG tree / strip.
  const paint = useCallback(() => {
    frameRef.current = 0;
    const p = paintRef.current;
    const live = liveRef.current || p.drawn;
    const g = treeGRef.current;
    if (g) {
      const { k, tx } = viewTransform(p.drawn, live, LABEL_W, p.matW);
      if (Math.abs(k - 1) < 1e-9 && Math.abs(tx) < 1e-6) g.removeAttribute("transform");
      else g.setAttribute("transform", `translate(${tx},0) scale(${k},1)`);
    }
    const ctx = canvasRef.current?.getContext?.("2d");
    if (!ctx) return;
    ctx.setTransform(p.dpr, 0, 0, p.dpr, 0, 0);
    drawMatrix(ctx, { masks: p.masks, colors: p.rowColors, selected: p.selectedMask, view: live, width: p.matW, rowH: ROW_H, separators: p.separators });
  }, []);
  // Gesture step: repaint on the next frame, commit to React once idle.
  const moveTo = useCallback(
    (next) => {
      liveRef.current = next;
      if (!frameRef.current) frameRef.current = requestAnimationFrame(paint);
      clearTimeout(settleRef.current);
      settleRef.current = setTimeout(() => setView(isFullView(next, paintRef.current.n) ? null : next), SETTLE_MS);
    },
    [paint]
  );
  // Buttons and clicks jump straight to a view.
  const jumpTo = useCallback((next) => {
    clearTimeout(settleRef.current);
    const count = paintRef.current.n;
    const v = next && !isFullView(next, count) ? clampView(next, count) : null;
    liveRef.current = v || [0, count];
    setView(v);
  }, []);
  // After every render (new view, size, selection, rows) repaint synchronously.
  useLayoutEffect(() => {
    if (!liveRef.current) liveRef.current = [d0, d1];
    paint();
  });
  // a new patient / tree starts unzoomed
  useEffect(() => {
    liveRef.current = null;
    setView(null);
  }, [order]);
  useEffect(
    () => () => {
      cancelAnimationFrame(frameRef.current);
      clearTimeout(settleRef.current);
    },
    []
  );
  // Native, non-passive wheel listener: React's onWheel is passive, so its
  // preventDefault cannot stop Ctrl-wheel from zooming / scrolling the page.
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      const { n: count, matW: w } = paintRef.current;
      const x = e.clientX - el.getBoundingClientRect().left - LABEL_W;
      if (x < 0 || x > w) return;
      const live = liveRef.current || [0, count];
      let next;
      if (e.ctrlKey || e.metaKey) {
        next = zoomView(live, x / w, wheelFactor(e.deltaY, e.deltaMode), count);
      } else {
        // plain vertical scrolling stays the page's; sideways (or Shift) pans a zoomed view
        const dx = e.shiftKey ? e.deltaX || e.deltaY : Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : 0;
        if (!dx || isFullView(live, count)) return;
        next = panView(live, (wheelPixels(dx, e.deltaMode) / w) * (live[1] - live[0]), count);
      }
      e.preventDefault();
      if (tipRef.current) tipRef.current.style.display = "none";
      moveTo(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [hasContent, moveTo]);

  const select = (ids, e) => dispatch(singleCellActions.updateSelection(e?.shiftKey || e?.metaKey || e?.ctrlKey ? [...new Set([...selectedCellIds, ...ids])] : ids));
  const zoomTo = (a, b) => jumpTo([a, b + 1]);
  const hoverCell = useCallback(
    (id) => {
      if (hoverIdRef.current === id) return;
      hoverIdRef.current = id;
      dispatch(singleCellActions.updateHover(id));
    },
    [dispatch]
  );
  // Canvas hit-testing: row / column from the pointer in the live view.
  const hitAt = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const hit = matrixHit(e.clientX - rect.left, e.clientY - rect.top, liveRef.current || [d0, d1], matW, ROW_H, rows.length);
    return hit && hit.col >= 0 && hit.col < n ? { ...hit, carrier: masks[hit.row][hit.col] === 1, x: e.clientX - rect.left, y: e.clientY - rect.top } : null;
  };
  // tooltip and cursor are set on the DOM directly: no React state per mouse move
  const onCanvasMove = (e) => {
    const hit = hitAt(e);
    const tip = tipRef.current;
    canvasRef.current.style.cursor = hit?.carrier ? "pointer" : "default";
    hoverCell(hit ? order[hit.col] : null);
    if (!tip) return;
    if (!hit?.carrier) {
      tip.style.display = "none";
      return;
    }
    tip.textContent = `${order[hit.col]}\n${rows[hit.row].label}`;
    tip.style.display = "block";
    tip.style.left = `${LABEL_W + Math.min(hit.x + 12, matW - 160)}px`;
    tip.style.top = `${top + hit.y + 14}px`;
  };
  const onCanvasLeave = () => {
    if (tipRef.current) tipRef.current.style.display = "none";
  };
  const onCanvasClick = (e) => {
    const hit = hitAt(e);
    if (hit?.carrier) select([order[hit.col]], e);
  };

  // Tree callbacks stay stable so the memoised tree skips hover re-renders.
  const treeHandlers = useRef({});
  treeHandlers.current = {
    onSelectRange: ([a, b], e) => {
      select(order.slice(a, b + 1), e);
      if (zoomOnClick && b > a) zoomTo(a, b);
    },
    onHover: (node) => {
      setHoverRange(node.isLeaf ? null : [node.firstLeaf, node.lastLeaf]);
      hoverCell(node.isLeaf ? order[node.firstLeaf] : null);
    },
  };
  const onTreeSelect = useCallback((range, e) => treeHandlers.current.onSelectRange(range, e), []);
  const onTreeHover = useCallback((node) => treeHandlers.current.onHover(node), []);

  if (!hasContent) return null;

  const nVis = Math.round(d1 - d0);
  const hoverCol = hoveredCellId != null ? col.get(hoveredCellId) : null;
  const height = top + matH + (cellW >= 56 ? 14 : 4);
  const pct = d3.format(".0%");
  const zoomSelection = () => {
    if (!selectedCols.size) return;
    let a = Infinity;
    let b = -Infinity;
    selectedCols.forEach((c) => {
      a = Math.min(a, c);
      b = Math.max(b, c);
    });
    zoomTo(a, b);
  };
  // blocks / cell names one span either side of the view, so a gesture shows them before it settles
  const [b0, b1] = bufferedColumns([d0, d1], n);
  const visibleBlocks = blocks.filter((b) => b.last >= b0 && b.first <= b1);

  return (
    <Card
      size="small"
      title={<Space><TableOutlined />{t("components.single-cell.report.matrix-title")}<Provenance id="driverMatrix" /></Space>}
      extra={
        <Space wrap>
          <Checkbox checked={zoomOnClick} onChange={(e) => setZoomOnClick(e.target.checked)}>{t("components.single-cell.report.matrix-zoom-click")}</Checkbox>
          <Button size="small" icon={<ZoomInOutlined />} disabled={!selectedCols.size} onClick={zoomSelection}>{t("components.single-cell.report.matrix-zoom-selection")}</Button>
          <Button size="small" icon={<ZoomOutOutlined />} disabled={full} onClick={() => jumpTo(null)}>{t("components.single-cell.report.matrix-all", { count: n })}</Button>
          <Tooltip title={t("components.single-cell.toolbar.clip-help")}>
            <Checkbox checked={Boolean(layout.clipBranches)} onChange={(e) => dispatch(singleCellActions.updateLayout({ clipBranches: e.target.checked }))}>
              {t("components.single-cell.toolbar.clip")}
            </Checkbox>
          </Tooltip>
          <SvgExportButton containerRef={ref} name="drivers-by-cell" />
        </Space>
      }
    >
      <div
        ref={ref}
        onMouseLeave={() => {
          setHoverRange(null);
          hoverCell(null);
        }}
      >
        <div ref={plotRef} style={{ position: "relative" }}>
          {/* HTML buttons over the SVG labels: a plain click target for the alteration popup */}
          <div style={{ position: "absolute", left: 18, top, width: LABEL_W - 18, zIndex: 2 }}>
            {rows.map((r) => (
              <button
                key={`btn-${r.label}`}
                type="button"
                title={[r.label, ...eventTooltipLines(r.event), t("components.single-cell.report.matrix-click")].join("\n")}
                onClick={(e) => {
                  e.stopPropagation();
                  dispatch(filteredEventsActions.selectFilteredEvent(r.event, "plots"));
                }}
                style={{ display: "block", width: "100%", height: ROW_H, padding: 0, border: "none", background: "transparent", cursor: "pointer", textAlign: "left" }}
                aria-label={`${t("components.single-cell.report.matrix-click")}: ${r.label}`}
              />
            ))}
          </div>
          {/* overlaid (not in the flow) so zooming never shifts the plot down */}
          {!full && (
            <Text type="secondary" style={{ position: "absolute", right: RIGHT_W, top: 0, zIndex: 3, fontSize: 13, pointerEvents: "none", background: "rgba(255,255,255,0.85)", padding: "0 4px" }}>
              {t("components.single-cell.report.matrix-window", { shown: nVis, total: n })}
            </Text>
          )}
          <svg width={LABEL_W + matW + RIGHT_W} height={height} style={{ display: "block" }}>
            <defs>
              <clipPath id="dcm-clip">
                <rect x={LABEL_W} y={0} width={matW} height={height} />
              </clipPath>
            </defs>
            {/* lines keep their width while a gesture stretches the tree group */}
            <style>{".dcm-plot line { vector-effect: non-scaling-stroke; }"}</style>
            {rows.map((r, k) => (
              <rect key={`bg-${r.label}`} x={0} y={top + k * ROW_H} width={LABEL_W + matW + RIGHT_W} height={ROW_H} fill={k % 2 ? "#fafafa" : "transparent"} />
            ))}
            <g clipPath="url(#dcm-clip)">
              <g ref={treeGRef} className="dcm-plot">
                {treeLayout && (
                  <TreeTop
                    layout={treeLayout}
                    cellW={cellW}
                    height={TREE_H}
                    left={LABEL_W - d0 * cellW}
                    leafClones={leafClones}
                    cloneColors={cloneColors}
                    selectedCols={selectedCols}
                    onSelectRange={onTreeSelect}
                    onHover={onTreeHover}
                  />
                )}
                {hoverRange && <rect x={xOf(hoverRange[0])} y={0} width={Math.max(0, xOf(hoverRange[1] + 1) - xOf(hoverRange[0]))} height={height} fill="rgba(250,84,28,0.10)" pointerEvents="none" />}
                <g transform={`translate(0,${treeLayout ? TREE_H + 6 : 0})`}>
                  {visibleBlocks.map((b) => {
                    const x0 = xOf(b.first);
                    const x1 = xOf(b.last + 1);
                    // label centred on the visible part of the block
                    const lx0 = Math.max(LABEL_W, x0);
                    const lx1 = Math.min(LABEL_W + matW, x1);
                    return (
                      <g
                        key={`${b.clone}-${b.first}`}
                        style={{ cursor: "pointer" }}
                        onClick={(e) => {
                          select(order.slice(b.first, b.last + 1), e);
                          if (zoomOnClick) zoomTo(b.first, b.last);
                        }}
                      >
                        <rect x={x0} y={0} width={Math.max(1, x1 - x0)} height={STRIP_H} fill={cloneColors[b.clone] || "#d9d9d9"} />
                        {lx1 - lx0 > 46 && (
                          <text x={(lx0 + lx1) / 2} y={STRIP_H / 2} dy="0.35em" textAnchor="middle" fontSize={11} fill="#fff" fontWeight={600} pointerEvents="none">
                            {b.clone ?? "–"}
                          </text>
                        )}
                        <title>{`${b.clone ?? "unassigned"} · ${b.last - b.first + 1} cells`}</title>
                      </g>
                    );
                  })}
                </g>
                {hoverCol != null && <rect x={xOf(hoverCol)} y={0} width={Math.max(1, cellW)} height={height} fill="rgba(22,119,255,0.18)" pointerEvents="none" />}
                {cellW >= 56 &&
                  order.slice(b0, b1 + 1).map((id, j) => (
                    <text key={id} x={xOf(b0 + j) + cellW / 2} y={height - 3} textAnchor="middle" fontSize={TYPE.micro} fill={INK.muted}>
                      {id.replace(/^.*?_(MR_?\d+)_/, "$1 ")}
                    </text>
                  ))}
              </g>
            </g>
            <text x={LABEL_W - 8} y={(treeLayout ? TREE_H + 6 : 0) + STRIP_H - 2} textAnchor="end" fontSize={11} fill={INK.muted}>{t("components.single-cell.heatmap.strip-clone")}</text>
            {rows.map((r, k) => {
              const y = top + k * ROW_H;
              return (
                <g key={r.label}>
                  <rect x={6} y={y + 4} width={8} height={ROW_H - 8} rx={2} fill={CLASS_COLORS[r.class]} style={{ cursor: "pointer" }} onClick={(e) => select([...r.carriers], e)}>
                    <title>{t("components.single-cell.report.matrix-select")}</title>
                  </rect>
                  {/* SVG text only reacts on its glyphs: a transparent hit area over the whole label column opens the popup */}
                  <rect x={18} y={y} width={LABEL_W - 18} height={ROW_H} fill="transparent" pointerEvents="all" style={{ cursor: "pointer" }} onClick={() => dispatch(filteredEventsActions.selectFilteredEvent(r.event, "plots"))}>
                    <title>{[r.label, ...eventTooltipLines(r.event), t("components.single-cell.report.matrix-click")].join("\n")}</title>
                  </rect>
                  <text x={20} y={y + ROW_H / 2} dy="0.35em" fontSize={TYPE.label} fill="#1677ff" pointerEvents="none">
                    {r.label.length > 34 ? `${r.label.slice(0, 33)}…` : r.label}
                    <title>{[r.label, ...eventTooltipLines(r.event), ...(Number.isFinite(r.fit.score) ? [`clade F1 ${r.fit.score.toFixed(2)} (best clade ${r.fit.clade} cells)`] : []), t("components.single-cell.report.matrix-click")].join("\n")}</title>
                  </text>
                  <text x={LABEL_W + matW + 8} y={y + ROW_H / 2} dy="0.35em" fontSize={TYPE.tick} fill={Number.isFinite(r.fit.score) && r.fit.score < 0.5 ? "#cf1322" : "#8c8c8c"}>
                    {`${pct(r.fraction)}${Number.isFinite(r.fit.score) ? ` · ${r.fit.score.toFixed(2)}` : ""}`}
                  </text>
                </g>
              );
            })}
          </svg>
          {/* the carrier cells: one canvas instead of an SVG rect per cell */}
          <canvas
            ref={canvasRef}
            width={Math.round(matW * dpr)}
            height={Math.round(matH * dpr)}
            style={{ position: "absolute", left: LABEL_W, top, width: matW, height: matH, zIndex: 1 }}
            onMouseMove={onCanvasMove}
            onMouseLeave={onCanvasLeave}
            onClick={onCanvasClick}
          />
          <div
            ref={tipRef}
            style={{ display: "none", position: "absolute", zIndex: 4, pointerEvents: "none", whiteSpace: "pre", fontSize: 12.5, lineHeight: "15px", padding: "3px 6px", borderRadius: 4, background: "rgba(0,0,0,0.78)", color: "#fff" }}
          />
        </div>
        <Swatches style={{ marginTop: 6 }} items={Object.entries(CLASS_COLORS).filter(([k]) => k !== "other" && rows.some((r) => r.class === k)).map(([k, c]) => ({ key: k, color: c, label: t(`components.single-cell.cohort.class-${k}`) }))} />
        <HintLine text={t("components.single-cell.report.matrix-help2")} />
      </div>
    </Card>
  );
}
