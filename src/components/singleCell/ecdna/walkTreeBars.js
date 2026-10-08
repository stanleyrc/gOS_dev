import React, { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Card, Empty, Segmented, Slider, Space, Typography } from "antd";
import { ApartmentOutlined } from "@ant-design/icons";
import PhylogenyCanvas from "../phylogenyCanvas";
import useContainerWidth from "../useContainerWidth";
import usePixelRatio from "../usePixelRatio";
import useTreeView from "../useTreeView";
import SvgExportButton from "../svgExportButton";
import singleCellActions from "../../../redux/singleCell/actions";
import { cutTree, labelRuns } from "../../../helpers/singleCell/treeGroups";
import { Swatches } from "../cohort/charts";

const { Text } = Typography;
const TREE_WIDTH = 220;
const LABEL_W = 120;
const GAP = 8;

/**
 * Copies of the selected walks along the phylogeny: per cell (one stacked
 * bar per leaf), per clone or per clade (k cuts) as mean copies, so the
 * dominant ecDNA species of each part of the tree is visible. Click a bar
 * or a tree node to select those cells.
 */
export default function WalkTreeBars({ walks, colorOf }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const [ref, width] = useContainerWidth(1000);
  const pixelRatio = usePixelRatio();
  const { order, treeLayout, cellById } = useTreeView();
  const { cloneColors, selectedCellIds, hoveredCellId, layout } = useSelector((s) => s.SingleCell);
  const [mode, setMode] = useState("cells");
  const [k, setK] = useState(6);
  const [unit, setUnit] = useState("copies");
  const [layoutMode, setLayoutMode] = useState("separate");
  const [hoverRange, setHoverRange] = useState(null);
  const height = layout.walkTreeHeight || 520;
  const nRows = order.length;
  const rowH = nRows ? height / nRows : 0;
  const leafClones = useMemo(() => order.map((id) => cellById.get(id)?.clone_id ?? null), [order, cellById]);
  const rowOf = useMemo(() => new Map(order.map((id, i) => [id, i])), [order]);
  const selectedRows = useMemo(() => new Set(selectedCellIds.map((id) => rowOf.get(id)).filter((r) => r != null)), [selectedCellIds, rowOf]);
  const hoverRow = hoveredCellId != null && rowOf.has(hoveredCellId) ? rowOf.get(hoveredCellId) : null;
  const groups = useMemo(() => {
    if (mode === "cells") return order.map((id, i) => ({ key: id, label: id, first: i, last: i, clone: leafClones[i] }));
    if (mode === "clones") return labelRuns(leafClones).map((r) => ({ ...r, key: `${r.label}:${r.first}`, clone: r.label }));
    return treeLayout ? cutTree(treeLayout, k).map((c, i) => ({ ...c, key: `cut:${c.node}`, label: `${t("components.single-cell.bars.clade")} ${i + 1}`, clone: null })) : [];
  }, [mode, order, leafClones, treeLayout, k, t]);
  const values = useMemo(
    () =>
      groups.map((g) => {
        const ids = order.slice(g.first, g.last + 1);
        const per = walks.map((w) => d3.mean(ids, (id) => Number(w.cells[id]) || 0) || 0);
        const tot = d3.sum(per);
        return { per, tot, carriers: walks.map((w) => ids.filter((id) => (Number(w.cells[id]) || 0) > 0).length), n: ids.length };
      }),
    [groups, order, walks]
  );
  if (!treeLayout || !order.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.tree.none")} />;
  if (!walks.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.ecdna.none-selected")} />;
  const barsW = Math.max(240, width - TREE_WIDTH - GAP - LABEL_W - 30);
  // rotated (-30°) lane titles: room for the longest one
  const HEADER_H = Math.min(90, 22 + 0.5 * 7 * Math.min(26, Math.max(4, ...walks.map((w) => w.label.length))));
  const maxTot = d3.max(values, (v) => v.tot) || 1;
  const x = d3.scaleLinear().domain([0, unit === "copies" ? maxTot : 1]).range([0, barsW]);
  // separate lanes: one small-multiple per walk with its own copy scale
  const laneGap = 14;
  const laneW = Math.max(60, (barsW - laneGap * (walks.length - 1)) / Math.max(1, walks.length));
  const laneMax = walks.map((w, j) => d3.max(values, (v) => v.per[j]) || 1);
  const laneX = walks.map((w, j) => d3.scaleLinear().domain([0, laneMax[j]]).range([0, laneW]));
  const laneLeft = (j) => LABEL_W + j * (laneW + laneGap);
  const share = (id) => dispatch(singleCellActions.updateHover(id));
  const select = (g, e) => {
    const ids = order.slice(g.first, g.last + 1);
    dispatch(singleCellActions.updateSelection(e.metaKey || e.ctrlKey || e.shiftKey ? [...new Set([...selectedCellIds, ...ids])] : ids));
  };
  return (
    <Card
      size="small"
      title={<Space><ApartmentOutlined />{t("components.single-cell.ecdna.tree-title")}</Space>}
      extra={
        <Space wrap>
          <Segmented size="small" value={mode} onChange={setMode} options={[{ value: "cells", label: t("components.single-cell.bars.per-cell") }, { value: "clones", label: t("components.single-cell.bars.per-clone") }, { value: "cut", label: t("components.single-cell.bars.per-clade") }]} />
          {mode === "cut" && <Slider min={2} max={12} value={k} onChange={setK} style={{ width: 90, margin: "0 6px" }} />}
          <Segmented size="small" value={layoutMode} onChange={setLayoutMode} options={[{ value: "separate", label: t("components.single-cell.ecdna.layout-separate") }, { value: "stacked", label: t("components.single-cell.ecdna.layout-stacked") }]} />
          {layoutMode === "stacked" && <Segmented size="small" value={unit} onChange={setUnit} options={[{ value: "copies", label: t("components.single-cell.ecdna.unit-copies") }, { value: "share", label: t("components.single-cell.ecdna.unit-share") }]} />}
          <Text type="secondary">{t("components.single-cell.signatures.height")}</Text>
          <Slider min={240} max={1600} step={20} value={height} onChange={(v) => dispatch(singleCellActions.updateLayout({ walkTreeHeight: v }))} style={{ width: 100, margin: "0 6px" }} />
          <SvgExportButton containerRef={ref} name="ecdna-on-tree" />
        </Space>
      }
    >
      <div ref={ref}>
        {layoutMode === "separate" && (
          <svg width={TREE_WIDTH + GAP + LABEL_W + barsW + 60} height={HEADER_H} style={{ display: "block" }}>
            {walks.map((w, j) => (
              <text key={w.id} transform={`translate(${TREE_WIDTH + GAP + laneLeft(j) + 4},${HEADER_H - 4}) rotate(-30)`} fontSize={12} fontWeight={600} fill={colorOf(w.id)}>
                {w.label.length > 26 ? `${w.label.slice(0, 25)}…` : w.label}
                <title>{`${w.label} · max ${laneMax[j].toFixed(0)} copies`}</title>
              </text>
            ))}
          </svg>
        )}
        <div style={{ display: "flex", gap: GAP, alignItems: "flex-start" }} onMouseLeave={() => share(null)}>
          <PhylogenyCanvas
            layout={treeLayout}
            nRows={nRows}
            width={TREE_WIDTH}
            height={height}
            pixelRatio={pixelRatio}
            leafClones={leafClones}
            cloneColors={cloneColors}
            selectedRows={selectedRows}
            hoverRow={hoverRow}
            hoverRange={hoverRange}
            onSelectRange={([a, b], e) => {
              const ids = order.slice(a, b + 1);
              dispatch(singleCellActions.updateSelection(e.metaKey || e.ctrlKey || e.shiftKey ? [...selectedCellIds, ...ids] : ids));
            }}
            onHoverNode={(node) => {
              if (!node) {
                setHoverRange(null);
                return share(null);
              }
              setHoverRange(node.isLeaf ? null : [node.firstLeaf, node.lastLeaf]);
              return share(node.isLeaf ? order[node.firstLeaf] : null);
            }}
          />
          <svg width={LABEL_W + barsW + 60} height={height + 24}>
            {layoutMode === "separate" &&
              walks.map((w, j) => (
                <g key={`lane-${w.id}`} transform={`translate(${laneLeft(j)},${height + 2})`}>
                  <line x1={0} x2={laneW} y1={2} y2={2} stroke="#d9d9d9" />
                  <text x={0} y={14} fontSize={10} fill="#8c8c8c">0</text>
                  <text x={laneW} y={14} textAnchor="end" fontSize={10} fill="#8c8c8c">{laneMax[j].toFixed(0)}</text>
                  <line x1={0} x2={0} y1={-height - 2} y2={2} stroke="#e8e8e8" />
                </g>
              ))}
            {groups.map((g, i) => {
              const y0 = g.first * rowH;
              const h = (g.last - g.first + 1) * rowH;
              const cy = y0 + h / 2;
              const barH = mode === "cells" ? Math.max(1, h - (h > 3 ? 1 : 0)) : Math.max(6, Math.min(h - 4, 24));
              const v = values[i];
              const denom = unit === "copies" ? 1 : Math.max(1e-9, v.tot);
              let acc = 0;
              const selected = selectedRows.size && d3.range(g.first, g.last + 1).some((r) => selectedRows.has(r));
              return (
                <g key={g.key} style={{ cursor: "pointer" }} onClick={(e) => select(g, e)} onMouseEnter={() => mode === "cells" && share(g.key)}>
                  <rect x={0} y={y0} width={LABEL_W + barsW + 60} height={h} fill={mode === "cells" ? "#fff" : i % 2 ? "#fafafa" : "#f5f5f5"} fillOpacity={selected ? 0.5 : 0.9} />
                  {mode === "cells" && hoverRow === g.first && <rect x={0} y={y0} width={LABEL_W + barsW + 60} height={h} fill="rgba(22,119,255,0.18)" />}
                  <rect x={0} y={y0 + 1} width={5} height={Math.max(1, h - 2)} fill={(g.clone != null && cloneColors[g.clone]) || "#8c8c8c"} />
                  {(mode !== "cells" || h >= 9) && <text x={10} y={cy} dy="0.35em" fontSize={mode === "cells" ? Math.min(10, h - 1) : 11} fill="#262626">{g.label.length > 16 ? `${g.label.slice(0, 15)}…` : g.label}</text>}
                  {layoutMode === "separate" &&
                    walks.map((w, j) => {
                      const val = v.per[j];
                      if (!(val > 0)) return null;
                      return (
                        <g key={w.id}>
                          <rect x={laneLeft(j)} y={cy - barH / 2} width={Math.max(0.5, laneX[j](val))} height={barH} fill={colorOf(w.id)} rx={1} />
                          <title>{`${g.label} · ${w.label}: ${mode === "cells" ? `${val.toFixed(0)} copies` : `mean ${val.toFixed(1)} copies · ${v.carriers[j]}/${v.n} cells`}`}</title>
                        </g>
                      );
                    })}
                  {layoutMode === "stacked" && walks.map((w, j) => {
                    const val = v.per[j] / denom;
                    if (!(val > 0)) return null;
                    const wpx = x(val);
                    const el = (
                      <g key={w.id}>
                        <rect x={LABEL_W + acc} y={cy - barH / 2} width={Math.max(0, wpx - 0.5)} height={barH} fill={colorOf(w.id)} rx={1} />
                        <title>{`${g.label} · ${w.label}: ${mode === "cells" ? `${v.per[j].toFixed(0)} copies` : `mean ${v.per[j].toFixed(1)} copies · ${v.carriers[j]}/${v.n} cells`}`}</title>
                      </g>
                    );
                    acc += wpx;
                    return el;
                  })}
                  {layoutMode === "stacked" && mode !== "cells" && <text x={LABEL_W + acc + 4} y={cy} dy="0.35em" fontSize={9} fill="#8c8c8c">{unit === "copies" ? v.tot.toFixed(0) : `n=${v.n}`}</text>}
                </g>
              );
            })}
            {layoutMode === "stacked" && unit === "copies" && x.ticks(5).map((tk) => (
              <g key={tk} transform={`translate(${LABEL_W + x(tk)},0)`}>
                <line y1={0} y2={height} stroke="#e8e8e8" strokeDasharray="2 3" />
                <text y={height + 12} textAnchor="middle" fontSize={9} fill="#8c8c8c">{tk}</text>
              </g>
            ))}
          </svg>
        </div>
        <Swatches style={{ marginTop: 6 }} items={walks.map((w) => ({ key: w.id, color: colorOf(w.id), label: w.label }))} />
        <Text type="secondary" style={{ fontSize: 12 }}>{t("components.single-cell.ecdna.tree-help")}</Text>
      </div>
    </Card>
  );
}
