import React, { useMemo, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Card, Space, Typography } from "antd";
import { TableOutlined } from "@ant-design/icons";
import useContainerWidth from "./useContainerWidth";
import useTreeView from "./useTreeView";
import SvgExportButton from "./svgExportButton";
import singleCellActions from "../../redux/singleCell/actions";
import { cladeFitScore } from "../../helpers/singleCell/cladeFit";

const { Text } = Typography;
const CLASS_COLORS = { amp: "#D7191C", homdel: "#2C7BB6", fusion: "#7B3294", trunc: "#1A1A1A", splice: "#E6AB02", missense: "#1B9E77", other: "#8c8c8c" };
const ROW_H = 18;
const LABEL_W = 230;
const STRIP_H = 10;

/**
 * Driver alterations (rows) x cells in tree order (columns): a filled cell
 * means the cell carries the alteration. Rows are ordered by where the
 * carriers sit on the tree (trunk first, then deeper clades), with the
 * clade-fit score. Click a row to select its carriers, a column to select
 * the cell; hover highlights the cell across views.
 */
export default function DriverCellMatrix({ drivers }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const [ref, width] = useContainerWidth(1000);
  const svgRef = useRef(null);
  const { order, treeLayout, cellById } = useTreeView();
  const { cloneColors, selectedCellIds, hoveredCellId } = useSelector((s) => s.SingleCell);
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
  if (!order.length || !rows.length) return null;
  const n = order.length;
  const cellW = Math.max(1, (width - LABEL_W - 70) / n);
  const matW = cellW * n;
  const height = STRIP_H + 6 + rows.length * ROW_H;
  const selected = new Set(selectedCellIds);
  const hoverCol = hoveredCellId != null ? col.get(hoveredCellId) : null;
  const pct = d3.format(".0%");

  return (
    <Card
      size="small"
      title={<Space><TableOutlined />{t("components.single-cell.report.matrix-title")}</Space>}
      extra={<SvgExportButton containerRef={ref} name="drivers-by-cell" />}
    >
      <div ref={ref}>
        <svg ref={svgRef} width={LABEL_W + matW + 70} height={height} style={{ display: "block" }}>
          {/* clone strip over the cells */}
          {order.map((id, i) => (
            <rect key={id} x={LABEL_W + i * cellW} y={0} width={Math.max(1, cellW)} height={STRIP_H} fill={cloneColors[cellById.get(id)?.clone_id] || "#d9d9d9"} style={{ cursor: "pointer" }} onClick={() => dispatch(singleCellActions.updateSelection([id]))} onMouseEnter={() => dispatch(singleCellActions.updateHover(id))}>
              <title>{`${id} · ${cellById.get(id)?.clone_id ?? ""}`}</title>
            </rect>
          ))}
          {hoverCol != null && <rect x={LABEL_W + hoverCol * cellW} y={0} width={Math.max(1, cellW)} height={height} fill="rgba(22,119,255,0.18)" pointerEvents="none" />}
          {rows.map((r, k) => {
            const y = STRIP_H + 6 + k * ROW_H;
            return (
              <g key={r.label}>
                <rect x={0} y={y} width={LABEL_W + matW + 70} height={ROW_H} fill={k % 2 ? "#fafafa" : "#ffffff"} />
                <rect x={0} y={y + 3} width={6} height={ROW_H - 6} fill={CLASS_COLORS[r.class]} />
                <text x={12} y={y + ROW_H / 2} dy="0.35em" fontSize={11} fill="#262626" style={{ cursor: "pointer" }} onClick={() => dispatch(singleCellActions.updateSelection([...r.carriers]))}>
                  {r.label.length > 34 ? `${r.label.slice(0, 33)}…` : r.label}
                  <title>{`${r.label}\n${r.cells} cells (${pct(r.fraction)})${Number.isFinite(r.fit.score) ? `\nclade fit ${r.fit.score.toFixed(2)} (best clade ${r.fit.clade} cells)` : ""}\n${t("components.single-cell.report.matrix-click")}`}</title>
                </text>
                {order.map((id, i) =>
                  r.carriers.has(id) ? (
                    <rect key={id} x={LABEL_W + i * cellW} y={y + 2} width={Math.max(1, cellW - (cellW > 3 ? 0.5 : 0))} height={ROW_H - 4} fill={CLASS_COLORS[r.class]} fillOpacity={selected.size && !selected.has(id) ? 0.3 : 0.95} style={{ cursor: "pointer" }} onClick={(e) => dispatch(singleCellActions.updateSelection(e.shiftKey ? [...selectedCellIds, id] : [id]))} onMouseEnter={() => dispatch(singleCellActions.updateHover(id))}>
                      <title>{`${id}\n${r.label}`}</title>
                    </rect>
                  ) : null
                )}
                <text x={LABEL_W + matW + 6} y={y + ROW_H / 2} dy="0.35em" fontSize={10} fill={Number.isFinite(r.fit.score) && r.fit.score < 0.5 ? "#cf1322" : "#8c8c8c"}>
                  {`${pct(r.fraction)}${Number.isFinite(r.fit.score) ? ` · ${r.fit.score.toFixed(2)}` : ""}`}
                </text>
              </g>
            );
          })}
        </svg>
        <Text type="secondary" style={{ fontSize: 12 }}>{t("components.single-cell.report.matrix-help")}</Text>
      </div>
    </Card>
  );
}
