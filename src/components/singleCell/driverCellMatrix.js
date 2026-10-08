import React, { useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Button, Card, Checkbox, Space, Tooltip, Typography } from "antd";
import { TableOutlined, ZoomInOutlined, ZoomOutOutlined } from "@ant-design/icons";
import useContainerWidth from "./useContainerWidth";
import useTreeView from "./useTreeView";
import TreeTop from "./treeTop";
import SvgExportButton from "./svgExportButton";
import singleCellActions from "../../redux/singleCell/actions";
import filteredEventsActions from "../../redux/filteredEvents/actions";
import { cladeFitScore } from "../../helpers/singleCell/cladeFit";
import { eventTooltipLines } from "../../helpers/singleCell/cohortStats";
import { Swatches } from "./cohort/charts";

const { Text } = Typography;
const CLASS_COLORS = { amp: "#D7191C", homdel: "#2C7BB6", fusion: "#7B3294", trunc: "#1A1A1A", splice: "#E6AB02", missense: "#1B9E77", other: "#8c8c8c" };
const ROW_H = 24;
const LABEL_W = 240;
const RIGHT_W = 90;
const STRIP_H = 12;
const TREE_H = 130;

/**
 * Driver alterations (rows) x cells in tree order (columns) under the
 * phylogeny drawn leaves-down. Zoom into a clade (click it in the tree, or
 * Cmd/Ctrl-wheel over the matrix), or into the current selection; a filled
 * cell = the cell carries the alteration. Rows are ordered trunk-first with
 * the fraction of tumor cells and the clade fit at the right.
 */
export default function DriverCellMatrix({ drivers }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const [ref, width] = useContainerWidth(1000);
  const { order, treeLayout, cellById } = useTreeView();
  const { cloneColors, selectedCellIds, hoveredCellId, layout } = useSelector((s) => s.SingleCell);
  const [hoverRange, setHoverRange] = useState(null);
  const [win, setWin] = useState(null); // [firstCol, lastCol] of the visible cells
  const [zoomOnClick, setZoomOnClick] = useState(true);
  const svgRef = useRef(null);
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
  const leafClones = useMemo(() => order.map((id) => cellById.get(id)?.clone_id ?? null), [order, cellById]);
  if (!order.length || !rows.length) return null;

  const n = order.length;
  const [c0, c1] = win && win[1] >= win[0] ? [Math.max(0, win[0]), Math.min(n - 1, win[1])] : [0, n - 1];
  const nVis = c1 - c0 + 1;
  const matW = Math.max(200, width - LABEL_W - RIGHT_W - 8);
  const cellW = matW / nVis;
  const xOf = (i) => LABEL_W + (i - c0) * cellW;
  const top = (treeLayout ? TREE_H + 6 : 0) + STRIP_H + 8;
  const height = top + rows.length * ROW_H + (cellW >= 56 ? 14 : 4);
  const selected = new Set(selectedCellIds);
  const selectedCols = new Set(selectedCellIds.map((id) => col.get(id)).filter((c) => c != null));
  const hoverCol = hoveredCellId != null ? col.get(hoveredCellId) : null;
  const pct = d3.format(".0%");
  const select = (ids, e) => dispatch(singleCellActions.updateSelection(e?.shiftKey || e?.metaKey || e?.ctrlKey ? [...new Set([...selectedCellIds, ...ids])] : ids));
  const zoomTo = (a, b) => setWin(b - a + 1 >= n ? null : [a, b]);
  const zoomSelection = () => {
    if (!selectedCols.size) return;
    zoomTo(Math.min(...selectedCols), Math.max(...selectedCols));
  };
  const onWheel = (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < LABEL_W) return;
    const anchor = c0 + ((x - LABEL_W) / matW) * nVis;
    const factor = Math.exp(e.deltaY * 0.002);
    const span = Math.round(Math.max(8, Math.min(n, nVis * factor)));
    let a = Math.round(anchor - ((anchor - c0) / nVis) * span);
    a = Math.max(0, Math.min(n - span, a));
    zoomTo(a, Math.min(n - 1, a + span - 1));
  };
  // clone blocks (contiguous runs) for separators and labels
  const blocks = [];
  leafClones.forEach((c, i) => {
    const last = blocks[blocks.length - 1];
    if (last && last.clone === c) last.last = i;
    else blocks.push({ clone: c, first: i, last: i });
  });
  const visibleBlocks = blocks.filter((b) => b.last >= c0 && b.first <= c1);

  return (
    <Card
      size="small"
      title={<Space><TableOutlined />{t("components.single-cell.report.matrix-title")}</Space>}
      extra={
        <Space wrap>
          <Checkbox checked={zoomOnClick} onChange={(e) => setZoomOnClick(e.target.checked)}>{t("components.single-cell.report.matrix-zoom-click")}</Checkbox>
          <Button size="small" icon={<ZoomInOutlined />} disabled={!selectedCols.size} onClick={zoomSelection}>{t("components.single-cell.report.matrix-zoom-selection")}</Button>
          <Button size="small" icon={<ZoomOutOutlined />} disabled={!win} onClick={() => setWin(null)}>{t("components.single-cell.report.matrix-all", { count: n })}</Button>
          <Tooltip title={t("components.single-cell.toolbar.clip-help")}>
            <Checkbox checked={Boolean(layout.clipBranches)} onChange={(e) => dispatch(singleCellActions.updateLayout({ clipBranches: e.target.checked }))}>
              {t("components.single-cell.toolbar.clip")}
            </Checkbox>
          </Tooltip>
          <SvgExportButton containerRef={ref} name="drivers-by-cell" />
        </Space>
      }
    >
      <div ref={ref} onMouseLeave={() => { setHoverRange(null); dispatch(singleCellActions.updateHover(null)); }}>
        {win && <Text type="secondary" style={{ fontSize: 12 }}>{t("components.single-cell.report.matrix-window", { shown: nVis, total: n })}</Text>}
        <svg ref={svgRef} width={LABEL_W + matW + RIGHT_W} height={height} style={{ display: "block" }} onWheel={onWheel}>
          <defs>
            <clipPath id="dcm-clip">
              <rect x={LABEL_W} y={0} width={matW} height={height} />
            </clipPath>
          </defs>
          {treeLayout && (
            <g clipPath="url(#dcm-clip)">
              <TreeTop
                layout={treeLayout}
                cellW={cellW}
                height={TREE_H}
                left={LABEL_W - c0 * cellW}
                leafClones={leafClones}
                cloneColors={cloneColors}
                selectedCols={selectedCols}
                hoverCol={hoverCol}
                onSelectRange={([a, b], e) => {
                  select(order.slice(a, b + 1), e);
                  if (zoomOnClick && b > a) zoomTo(a, b);
                }}
                onHover={(node) => {
                  setHoverRange(node.isLeaf ? null : [node.firstLeaf, node.lastLeaf]);
                  dispatch(singleCellActions.updateHover(node.isLeaf ? order[node.firstLeaf] : null));
                }}
              />
            </g>
          )}
          {hoverRange && (
            <rect x={Math.max(LABEL_W, xOf(hoverRange[0]))} y={0} width={Math.max(0, Math.min(LABEL_W + matW, xOf(hoverRange[1] + 1)) - Math.max(LABEL_W, xOf(hoverRange[0])))} height={height} fill="rgba(250,84,28,0.10)" pointerEvents="none" />
          )}
          <g transform={`translate(0,${treeLayout ? TREE_H + 6 : 0})`} clipPath="url(#dcm-clip)">
            {visibleBlocks.map((b) => {
              const x0 = Math.max(LABEL_W, xOf(b.first));
              const x1 = Math.min(LABEL_W + matW, xOf(b.last + 1));
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
                  {x1 - x0 > 46 && (
                    <text x={(x0 + x1) / 2} y={STRIP_H / 2} dy="0.35em" textAnchor="middle" fontSize={10} fill="#fff" fontWeight={600} pointerEvents="none">
                      {b.clone ?? "–"}
                    </text>
                  )}
                  <title>{`${b.clone ?? "unassigned"} · ${b.last - b.first + 1} cells`}</title>
                </g>
              );
            })}
          </g>
          <text x={LABEL_W - 8} y={(treeLayout ? TREE_H + 6 : 0) + STRIP_H - 2} textAnchor="end" fontSize={10} fill="#8c8c8c">{t("components.single-cell.heatmap.strip-clone")}</text>
          {hoverCol != null && hoverCol >= c0 && hoverCol <= c1 && <rect x={xOf(hoverCol)} y={0} width={Math.max(1, cellW)} height={height} fill="rgba(22,119,255,0.18)" pointerEvents="none" />}
          {rows.map((r, k) => {
            const y = top + k * ROW_H;
            return (
              <g key={r.label}>
                <rect x={0} y={y} width={LABEL_W + matW + RIGHT_W} height={ROW_H} fill={k % 2 ? "#fafafa" : "transparent"} />
                <rect x={6} y={y + 4} width={8} height={ROW_H - 8} rx={2} fill={CLASS_COLORS[r.class]} style={{ cursor: "pointer" }} onClick={(e) => select([...r.carriers], e)}>
                  <title>{t("components.single-cell.report.matrix-select")}</title>
                </rect>
                {/* SVG text only reacts on its glyphs: a transparent hit area over the whole label column opens the popup */}
                <rect x={18} y={y} width={LABEL_W - 18} height={ROW_H} fill="transparent" pointerEvents="all" style={{ cursor: "pointer" }} onClick={() => dispatch(filteredEventsActions.selectFilteredEvent(r.event, "plots"))}>
                  <title>{[r.label, ...eventTooltipLines(r.event), t("components.single-cell.report.matrix-click")].join("\n")}</title>
                </rect>
                <text
                  x={20}
                  y={y + ROW_H / 2}
                  dy="0.35em"
                  fontSize={12}
                  fill="#1677ff"
                  style={{ cursor: "pointer" }}
                  onClick={() => dispatch(filteredEventsActions.selectFilteredEvent(r.event, "plots"))}
                >
                  {r.label.length > 34 ? `${r.label.slice(0, 33)}…` : r.label}
                  <title>{[r.label, ...eventTooltipLines(r.event), ...(Number.isFinite(r.fit.score) ? [`clade F1 ${r.fit.score.toFixed(2)} (best clade ${r.fit.clade} cells)`] : []), t("components.single-cell.report.matrix-click")].join("\n")}</title>
                </text>
                <g clipPath="url(#dcm-clip)">
                  {order.slice(c0, c1 + 1).map((id, j) => {
                    const i = c0 + j;
                    if (!r.carriers.has(id)) return null;
                    return (
                      <rect
                        key={id}
                        x={xOf(i) + (cellW > 4 ? 0.5 : 0)}
                        y={y + 3}
                        width={Math.max(1, cellW - (cellW > 4 ? 1 : 0))}
                        height={ROW_H - 6}
                        rx={cellW > 6 ? 2 : 0}
                        fill={CLASS_COLORS[r.class]}
                        fillOpacity={selected.size && !selected.has(id) ? 0.3 : 0.95}
                        style={{ cursor: "pointer" }}
                        onClick={(e) => select([id], e)}
                        onMouseEnter={() => dispatch(singleCellActions.updateHover(id))}
                      >
                        <title>{`${id}\n${r.label}`}</title>
                      </rect>
                    );
                  })}
                  {visibleBlocks.slice(1).map((b) => (
                    <line key={`sep-${b.first}`} x1={xOf(b.first)} x2={xOf(b.first)} y1={y} y2={y + ROW_H} stroke="#bfbfbf" strokeDasharray="2 2" />
                  ))}
                </g>
                <text x={LABEL_W + matW + 8} y={y + ROW_H / 2} dy="0.35em" fontSize={11} fill={Number.isFinite(r.fit.score) && r.fit.score < 0.5 ? "#cf1322" : "#8c8c8c"}>
                  {`${pct(r.fraction)}${Number.isFinite(r.fit.score) ? ` · ${r.fit.score.toFixed(2)}` : ""}`}
                </text>
              </g>
            );
          })}
          {cellW >= 56 &&
            order.slice(c0, c1 + 1).map((id, j) => (
              <text key={id} x={xOf(c0 + j) + cellW / 2} y={height - 3} textAnchor="middle" fontSize={9} fill="#8c8c8c">
                {id.replace(/^.*?_(MR_?\d+)_/, "$1 ")}
              </text>
            ))}
        </svg>
        <Swatches style={{ marginTop: 6 }} items={Object.entries(CLASS_COLORS).filter(([k]) => k !== "other" && rows.some((r) => r.class === k)).map(([k, c]) => ({ key: k, color: c, label: t(`components.single-cell.cohort.class-${k}`) }))} />
        <Text type="secondary" style={{ fontSize: 12 }}>{t("components.single-cell.report.matrix-help2")}</Text>
      </div>
    </Card>
  );
}
