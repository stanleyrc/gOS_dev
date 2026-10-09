import React, { useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Card, Empty, Segmented, Select, Slider, Space, Typography } from "antd";
import { ApartmentOutlined } from "@ant-design/icons";
import PhylogenyCanvas from "../phylogenyCanvas";
import useContainerWidth from "../useContainerWidth";
import usePixelRatio from "../usePixelRatio";
import useTreeView from "../useTreeView";
import SvgExportButton from "../svgExportButton";
import singleCellActions from "../../../redux/singleCell/actions";
import { cutTree, labelRuns } from "../../../helpers/singleCell/treeGroups";
import { walkFamilies } from "../../../helpers/singleCell/walks";
import {
  cellWalkLines,
  cloneSummary,
  columnMax,
  columnValue,
  columnWidths,
  copiesOf,
  groupValues,
  walkColumnBlocks,
} from "../../../helpers/singleCell/walkCopies";
import HintLine from "../hintLine";

const { Text } = Typography;
const TREE_WIDTH = 200;
const STRIP_W = 6; // clone strip, flush against the tree
const COL_X0 = STRIP_W + 2; // first column starts right after the strip
const GAP = 3; // between columns of a family
const BLOCK_GAP = 10; // between families
const FAM_H = 14; // family band in the header
const LABEL_H = 14; // column labels
const HEAD_H = FAM_H + LABEL_H + 2;
const SUM_ROW = 14; // one clone row in the summary
const TOTAL_COLOR = "#595959";
const RARE_OPTIONS = [0, 1, 2, 3, 5, 10];
const heat = (v) => d3.interpolateYlOrRd(0.08 + 0.92 * Math.max(0, Math.min(1, v)));

/**
 * Copies of the selected walks along the phylogeny. Columns are grouped by
 * amplicon family (nested walks): a family total (stacked by walk), one
 * column per common walk and one narrow column for the family's rare walks
 * (a coloured tick per walk present). Column width follows prevalence.
 * Bars or a heatmap; per-column, shared or log scale; rows per cell, clone
 * or clade, with a per-clone summary (carrier % and median copies) below.
 * Cells without walk counts are hatched, not drawn as zero.
 */
export default function WalkTreeBars({ walks, families: familiesProp, colorOf, measured = null }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const [ref, width] = useContainerWidth(1000);
  const plotRef = useRef(null);
  const pixelRatio = usePixelRatio();
  const { order, treeLayout, cellById } = useTreeView();
  const { cloneColors, selectedCellIds, hoveredCellId, layout } = useSelector((s) => s.SingleCell);
  const [mode, setMode] = useState("cells");
  const [k, setK] = useState(6);
  const [view, setView] = useState("bars");
  const [scaleMode, setScaleMode] = useState("column");
  const [rareMax, setRareMax] = useState(3);
  const [hoverRange, setHoverRange] = useState(null);
  const [tip, setTip] = useState(null); // { x, y, row }
  const height = layout.walkTreeHeight || 440;
  const nRows = order.length;
  const rowH = nRows ? height / nRows : 0;
  const leafClones = useMemo(() => order.map((id) => cellById.get(id)?.clone_id ?? null), [order, cellById]);
  const rowOf = useMemo(() => new Map(order.map((id, i) => [id, i])), [order]);
  const selectedRows = useMemo(() => new Set(selectedCellIds.map((id) => rowOf.get(id)).filter((r) => r != null)), [selectedCellIds, rowOf]);
  const hoverRow = hoveredCellId != null && rowOf.has(hoveredCellId) ? rowOf.get(hoveredCellId) : null;
  const hasData = (id) => !measured || measured.has(id);

  const families = useMemo(() => familiesProp || walkFamilies(walks), [familiesProp, walks]);
  const blocks = useMemo(() => walkColumnBlocks(families, order, { rareMax }), [families, order, rareMax]);
  const cols = useMemo(() => blocks.flatMap((b) => b.columns.map((c) => ({ ...c, block: b }))), [blocks]);

  const groups = useMemo(() => {
    let gs;
    if (mode === "cells") gs = order.map((id, i) => ({ key: id, label: id, first: i, last: i, clone: leafClones[i] }));
    else if (mode === "clones") gs = labelRuns(leafClones).map((r) => ({ ...r, key: `${r.label}:${r.first}`, clone: r.label }));
    else gs = treeLayout ? cutTree(treeLayout, k).map((c, i) => ({ ...c, key: `cut:${c.node}`, label: `${t("components.single-cell.bars.clade")} ${i + 1}`, clone: null })) : [];
    return gs.map((g) => {
      const ids = order.slice(g.first, g.last + 1);
      return { ...g, ids, measuredIds: ids.filter(hasData) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, order, leafClones, treeLayout, k, t, measured]);

  // column maxima over the rows shown (cells or group means, measured cells only)
  const maxRows = useMemo(() => groups.filter((g) => g.measuredIds.length).map((g) => ({ ids: g.measuredIds })), [groups]);
  const colMax = useMemo(() => cols.map((c) => Math.max(1e-9, columnMax(c, maxRows))), [cols, maxRows]);
  const sharedMax = Math.max(1e-9, ...cols.map((c, i) => (c.type === "rare" ? 0 : colMax[i])));
  const summary = useMemo(
    () => (mode === "clones" || !nRows ? [] : cloneSummary(blocks, order, (id) => cellById.get(id)?.clone_id, hasData)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [blocks, order, cellById, measured, mode, nRows]
  );

  if (!treeLayout || !order.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.tree.none")} />;
  if (!walks.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.ecdna.none-selected")} />;

  const plotW = Math.max(240, width - TREE_WIDTH - 4);
  const widths = columnWidths(blocks, plotW - COL_X0 - 4, nRows, { gap: GAP, blockGap: BLOCK_GAP });
  const colX = [];
  {
    let x = COL_X0;
    let ci = 0;
    blocks.forEach((b, bi) => {
      if (bi > 0) x += BLOCK_GAP - GAP;
      b.columns.forEach(() => {
        colX.push(x);
        x += widths[ci] + GAP;
        ci += 1;
      });
    });
  }
  const colsRight = colX.length ? colX[colX.length - 1] + widths[widths.length - 1] : COL_X0;
  const svgW = Math.max(colsRight + 4, 240);
  // value -> [0, 1] of the column width / colour ramp
  const frac = (ci, v) => {
    if (!(v > 0)) return 0;
    if (scaleMode === "log") return Math.log1p(v) / Math.log1p(sharedMax);
    return v / (scaleMode === "shared" ? sharedMax : colMax[ci]);
  };
  const colLabel = (c) => (c.type === "total" ? t("components.single-cell.ecdna.tc-total", { family: c.block.label }) : c.type === "rare" ? t("components.single-cell.ecdna.tc-rare-col") : c.walks[0].label);
  const colColor = (c) => (c.type === "walk" ? colorOf(c.walks[0].id) : TOTAL_COLOR);
  const fmt = (v) => (v >= 100 ? d3.format(".0f")(v) : v >= 10 ? d3.format(".0f")(v) : d3.format(".1~f")(v));
  const clip = (s, w, px = 6.2) => {
    const n = Math.max(1, Math.floor(w / px));
    return s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s;
  };

  const share = (id) => dispatch(singleCellActions.updateHover(id));
  const select = (g, e) => {
    const ids = g.ids;
    dispatch(singleCellActions.updateSelection(e.metaKey || e.ctrlKey || e.shiftKey ? [...new Set([...selectedCellIds, ...ids])] : ids));
  };
  const groupAtY = (y) => {
    const row = Math.max(0, Math.min(nRows - 1, Math.floor(y / Math.max(1e-9, rowH))));
    return groups.findIndex((g) => row >= g.first && row <= g.last);
  };
  const onMove = (e) => {
    const r = plotRef.current.getBoundingClientRect();
    const y = e.clientY - r.top;
    const gi = groupAtY(y);
    if (gi < 0) return;
    const box = ref.current.getBoundingClientRect();
    setTip({ x: e.clientX - box.left + 14, y: e.clientY - box.top + 12, gi });
    if (mode === "cells") share(groups[gi].key);
  };
  const onLeave = () => {
    setTip(null);
    share(null);
  };

  const tipLines = () => {
    if (!tip) return [];
    const g = groups[tip.gi];
    if (!g) return [];
    if (mode === "cells") {
      const id = g.key;
      const head = `${id}${g.clone != null ? ` · ${g.clone}` : ""}`;
      if (!hasData(id)) return [head, t("components.single-cell.ecdna.tc-no-data")];
      const lines = cellWalkLines(walks, id).map((r) => ({ color: colorOf(r.id), text: `${r.label}: ${fmt(r.copies)}` }));
      return [head, ...(lines.length ? lines : [t("components.single-cell.ecdna.tc-no-walks")])];
    }
    const head = `${g.label} · ${g.measuredIds.length}/${g.ids.length} cells`;
    const lines = walks
      .map((w) => {
        const carriers = g.measuredIds.filter((id) => copiesOf(w, id) > 0);
        const mean = g.measuredIds.length ? d3.sum(g.measuredIds, (id) => copiesOf(w, id)) / g.measuredIds.length : 0;
        return { w, n: carriers.length, mean };
      })
      .filter((r) => r.n > 0)
      .sort((a, b) => b.mean - a.mean)
      .map((r) => ({ color: colorOf(r.w.id), text: `${r.w.label}: mean ${fmt(r.mean)} · ${r.n}/${g.measuredIds.length} carry` }));
    return [head, ...lines];
  };

  const renderCell = (g, gi) => {
    const y0 = g.first * rowH;
    const h = (g.last - g.first + 1) * rowH;
    const cy = y0 + h / 2;
    const barH = mode === "cells" ? Math.max(1, h - (h > 3 ? 0.6 : 0)) : Math.max(5, Math.min(h - 3, 22));
    const by = cy - barH / 2;
    const noData = !g.measuredIds.length;
    const ids = g.measuredIds;
    const single = mode === "cells";
    return (
      <g key={g.key} style={{ cursor: "pointer" }} onClick={(e) => select(g, e)}>
        <rect x={0} y={y0} width={svgW} height={h} fill={!single && gi % 2 ? "#fafafa" : "#fff"} />
        <rect x={0} y={y0} width={STRIP_W} height={Math.max(0.6, h - (single ? 0 : 1))} fill={(g.clone != null && cloneColors[g.clone]) || "#bfbfbf"} />
        {noData ? (
          <rect x={COL_X0} y={y0} width={colsRight - COL_X0} height={h} fill="url(#wtb-hatch)" />
        ) : (
          cols.map((c, ci) => {
            const x = colX[ci];
            const w = widths[ci];
            if (c.type === "rare") {
              const step = Math.max(3, (w - 2) / Math.max(1, c.walks.length));
              return c.walks.map((wk, j) => {
                const on = single ? copiesOf(wk, g.key) > 0 : ids.some((id) => copiesOf(wk, id) > 0);
                return on ? <rect key={`${c.key}-${wk.id}`} x={x + 1 + j * step} y={by} width={Math.max(2, step - 1)} height={barH} fill={colorOf(wk.id)} /> : null;
              });
            }
            const vals = single ? { per: c.walks.map((wk) => copiesOf(wk, g.key)), total: columnValue(c, g.key) } : groupValues(c, ids);
            if (!(vals.total > 0)) return null;
            if (view === "heat") {
              return <rect key={c.key} x={x} y={y0} width={w} height={Math.max(0.6, h - (single ? 0 : 1))} fill={heat(frac(ci, vals.total))} />;
            }
            const totalW = Math.max(0.8, Math.min(1, frac(ci, vals.total)) * w);
            if (c.type === "walk") return <rect key={c.key} x={x} y={by} width={totalW} height={barH} fill={colColor(c)} />;
            // family total: stacked by walk, scaled to the total's width
            let acc = 0;
            return (
              <g key={c.key}>
                {c.walks.map((wk, j) => {
                  const v = vals.per[j];
                  if (!(v > 0)) return null;
                  const ww = (v / vals.total) * totalW;
                  const el = <rect key={wk.id} x={x + acc} y={by} width={Math.max(0.4, ww)} height={barH} fill={colorOf(wk.id)} />;
                  acc += ww;
                  return el;
                })}
              </g>
            );
          })
        )}
        {!single && h >= 12 && <text x={colsRight + 4} y={cy} dy="0.35em" fontSize={9} fill="#8c8c8c">{`n=${g.ids.length}`}</text>}
      </g>
    );
  };

  return (
    <Card
      size="small"
      title={
        <Space size={6}>
          <ApartmentOutlined />
          {t("components.single-cell.ecdna.tree-title")}
          <HintLine inline text={t("components.single-cell.ecdna.tree-help")} />
        </Space>
      }
      extra={
        <Space wrap size={[8, 4]}>
          <Segmented size="small" value={mode} onChange={setMode} options={[{ value: "cells", label: t("components.single-cell.bars.per-cell") }, { value: "clones", label: t("components.single-cell.bars.per-clone") }, { value: "cut", label: t("components.single-cell.bars.per-clade") }]} />
          {mode === "cut" && <Slider min={2} max={12} value={k} onChange={setK} style={{ width: 80, margin: "0 6px" }} />}
          <Segmented size="small" value={view} onChange={setView} options={[{ value: "bars", label: t("components.single-cell.ecdna.tc-bars") }, { value: "heat", label: t("components.single-cell.ecdna.tc-heat") }]} />
          <Segmented size="small" value={scaleMode} onChange={setScaleMode} options={[{ value: "column", label: t("components.single-cell.ecdna.tc-scale-column") }, { value: "shared", label: t("components.single-cell.ecdna.tc-scale-shared") }, { value: "log", label: t("components.single-cell.ecdna.tc-scale-log") }]} />
          <Text type="secondary">{t("components.single-cell.ecdna.tc-rare")}</Text>
          <Select size="small" value={rareMax} onChange={setRareMax} style={{ width: 62 }} options={RARE_OPTIONS.map((v) => ({ value: v, label: v ? `${v}` : t("components.single-cell.ecdna.tc-rare-off") }))} />
          <Text type="secondary">{t("components.single-cell.signatures.height")}</Text>
          <Slider min={200} max={1600} step={20} value={height} onChange={(v) => dispatch(singleCellActions.updateLayout({ walkTreeHeight: v }))} style={{ width: 80, margin: "0 6px" }} />
          <SvgExportButton containerRef={ref} name="ecdna-on-tree" />
        </Space>
      }
    >
      <div ref={ref} style={{ position: "relative" }}>
        {/* header: family bands, then short horizontal column labels with each column's maximum */}
        <svg width={TREE_WIDTH + svgW} height={HEAD_H} style={{ display: "block" }}>
          <g transform={`translate(${TREE_WIDTH},0)`}>
            {blocks.map((b) => {
              const idx = cols.map((c, i) => [c, i]).filter(([c]) => c.block === b).map(([, i]) => i);
              const x0 = colX[idx[0]];
              const x1 = colX[idx[idx.length - 1]] + widths[idx[idx.length - 1]];
              return (
                <g key={b.key}>
                  <rect x={x0} y={0} width={x1 - x0} height={FAM_H - 1} fill="#f0f0f0" rx={2} />
                  <text x={x0 + 4} y={FAM_H / 2} dy="0.35em" fontSize={10.5} fontWeight={700} fill="#434343">
                    {clip(`${b.label} · ${b.walks.length} walk${b.walks.length > 1 ? "s" : ""}`, x1 - x0 - 6, 6.4)}
                  </text>
                </g>
              );
            })}
            {cols.map((c, ci) => {
              const w = widths[ci];
              const max = c.type === "rare" ? null : scaleMode === "column" ? colMax[ci] : sharedMax;
              const maxTxt = max != null && scaleMode === "column" ? fmt(max) : "";
              const label = colLabel(c);
              const room = w - (maxTxt && w > 70 ? maxTxt.length * 5.6 + 4 : 0);
              return (
                <g key={c.key}>
                  <text x={colX[ci] + 1} y={FAM_H + LABEL_H / 2 + 1} dy="0.35em" fontSize={10.5} fontWeight={c.type === "walk" ? 600 : 500} fill={c.type === "walk" ? colColor(c) : "#595959"} fontStyle={c.type === "rare" ? "italic" : "normal"}>
                    {clip(label, room)}
                  </text>
                  {maxTxt && w > 70 && (
                    <text x={colX[ci] + w - 1} y={FAM_H + LABEL_H / 2 + 1} dy="0.35em" textAnchor="end" fontSize={9} fill="#8c8c8c">{maxTxt}</text>
                  )}
                  <title>
                    {c.type === "rare"
                      ? t("components.single-cell.ecdna.tc-rare-title", { count: c.walks.length, list: c.walks.map((wk) => wk.label).join(", ") })
                      : `${label} · ${c.carriers}/${nRows} cells · ${t("components.single-cell.ecdna.tc-max", { value: fmt(colMax[ci]) })}`}
                  </title>
                </g>
              );
            })}
            {scaleMode !== "column" && (
              <text x={svgW - 2} y={FAM_H / 2} dy="0.35em" textAnchor="end" fontSize={9} fill="#8c8c8c">
                {`${scaleMode === "log" ? "log · " : ""}${t("components.single-cell.ecdna.tc-max", { value: fmt(sharedMax) })}`}
              </text>
            )}
          </g>
        </svg>
        <div style={{ display: "flex", alignItems: "flex-start" }} onMouseLeave={onLeave}>
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
          <svg ref={plotRef} width={svgW} height={height} style={{ display: "block" }} onMouseMove={onMove}>
            <defs>
              <pattern id="wtb-hatch" width={5} height={5} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width={5} height={5} fill="#fafafa" />
                <line x1={0} y1={0} x2={0} y2={5} stroke="#d9d9d9" strokeWidth={1.5} />
              </pattern>
            </defs>
            {groups.map(renderCell)}
            {/* column frames */}
            {cols.map((c, ci) => (
              <rect key={`f${c.key}`} x={colX[ci] - 0.5} y={0} width={widths[ci] + 1} height={height} fill="none" stroke="#f0f0f0" pointerEvents="none" />
            ))}
            {/* selection + hover across all columns */}
            {mode === "cells" &&
              [...selectedRows].map((r) => <rect key={`s${r}`} x={0} y={r * rowH} width={svgW} height={Math.max(1, rowH)} fill="rgba(22,119,255,0.12)" pointerEvents="none" />)}
            {hoverRange && <rect x={0} y={hoverRange[0] * rowH} width={svgW} height={(hoverRange[1] - hoverRange[0] + 1) * rowH} fill="none" stroke="#fa541c" pointerEvents="none" />}
            {tip && groups[tip.gi] && (
              <rect x={0} y={groups[tip.gi].first * rowH} width={svgW} height={Math.max(1.5, (groups[tip.gi].last - groups[tip.gi].first + 1) * rowH)} fill="rgba(22,119,255,0.16)" stroke="#1677ff" strokeWidth={0.6} pointerEvents="none" />
            )}
            {!tip && mode === "cells" && hoverRow != null && <rect x={0} y={hoverRow * rowH} width={svgW} height={Math.max(1.5, rowH)} fill="rgba(22,119,255,0.16)" pointerEvents="none" />}
          </svg>
        </div>
        {/* per-clone summary: % of measured cells carrying, median copies in carriers */}
        {summary.length > 0 && (
          <svg width={TREE_WIDTH + svgW} height={summary.length * SUM_ROW + 4} style={{ display: "block", marginTop: 3 }}>
            {summary.map((s, si) => {
              const y = si * SUM_ROW + 2;
              return (
                <g key={`${s.clone}`}>
                  <rect x={TREE_WIDTH - 70} y={y + 2} width={8} height={SUM_ROW - 4} fill={cloneColors[s.clone] || "#bfbfbf"} rx={1} />
                  <text x={TREE_WIDTH - 58} y={y + SUM_ROW / 2} dy="0.35em" fontSize={10} fill="#434343">
                    {clip(t("components.single-cell.ecdna.tc-clone-row", { clone: s.clone, measured: s.measured, n: s.n }), 58, 5.6)}
                    <title>{`${s.clone}: ${s.measured} of ${s.n} cells with walk counts`}</title>
                  </text>
                  {cols.map((c, ci) => {
                    const st = s.stats[ci];
                    const x = TREE_WIDTH + colX[ci];
                    const w = widths[ci];
                    const txt = c.type === "rare" ? (st.fraction > 0 ? d3.format(".0%")(st.fraction) : "") : st.fraction > 0 ? (w >= 64 ? `${d3.format(".0%")(st.fraction)} · ${fmt(st.median)}×` : d3.format(".0%")(st.fraction)) : "–";
                    return (
                      <g key={c.key}>
                        <rect x={x} y={y + 1} width={w} height={SUM_ROW - 2} fill="#fafafa" />
                        <rect x={x} y={y + 1} width={Math.max(0, st.fraction * w)} height={SUM_ROW - 2} fill={colColor(c)} fillOpacity={0.22} />
                        <text x={x + 3} y={y + SUM_ROW / 2} dy="0.35em" fontSize={9.5} fill="#262626">{clip(txt, w - 4, 5.4)}</text>
                        <title>
                          {t("components.single-cell.ecdna.tc-summary-tip", { clone: s.clone, pct: d3.format(".0%")(st.fraction), measured: s.measured, walk: colLabel(c), median: fmt(st.median) })}
                        </title>
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>
        )}
        {view === "heat" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: TREE_WIDTH + COL_X0, marginTop: 2, fontSize: 10, color: "#8c8c8c" }}>
            <span>0</span>
            <span style={{ width: 120, height: 8, borderRadius: 2, background: `linear-gradient(to right, ${d3.range(0, 1.01, 0.1).map((v) => heat(v)).join(",")})` }} />
            <span>{scaleMode === "column" ? "column max" : fmt(sharedMax)}</span>
            <span style={{ width: 14, height: 8, marginLeft: 10, background: "repeating-linear-gradient(45deg, #fafafa 0 2px, #d9d9d9 2px 3px)" }} />
            <span>{t("components.single-cell.ecdna.tc-no-data")}</span>
          </div>
        )}
        {tip && (
          <div className="sc-tooltip" style={{ left: Math.min(tip.x, width - 260), top: tip.y }}>
            {tipLines().map((l, i) =>
              typeof l === "string" ? (
                <div key={i} style={{ fontWeight: i === 0 ? 600 : 400 }}>{l}</div>
              ) : (
                <div key={i}>
                  <span className="sc-swatch" style={{ background: l.color }} />
                  {l.text}
                </div>
              )
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
