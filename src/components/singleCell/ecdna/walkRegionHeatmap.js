import React, { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Card, Empty, Select, Slider, Space, Typography } from "antd";
import { HeatMapOutlined } from "@ant-design/icons";
import HeatmapCanvas from "../heatmapCanvas";
import HeatmapLegend from "../heatmapLegend";
import PhylogenyCanvas from "../phylogenyCanvas";
import useContainerWidth from "../useContainerWidth";
import usePixelRatio from "../usePixelRatio";
import useTreeView from "../useTreeView";
import SvgExportButton from "../svgExportButton";
import singleCellActions from "../../../redux/singleCell/actions";
import { binLabel, chromosomeSpans, cnColorer, domainExtents, genomicColumnLookup } from "../../../helpers/singleCell/matrix";
import { toGlobal } from "../../../helpers/singleCell/walks";

const { Text } = Typography;
const TREE_W = 200;
const GAP = 6;
const BAR_W = 70;
const TRACK_H = 46;
const PADS = [1e5, 2.5e5, 5e5, 1e6, 2e6, 5e6];
const padLabel = (p) => (p >= 1e6 ? `${p / 1e6} Mb` : `${p / 1e3} kb`);

/**
 * Total copy number of every cell (tree order, the single-cell heatmap's
 * colours) over the genomic regions a walk is built from, padded: above,
 * the walk's nodes on the same coordinates (▶ strand, red = ALT junction
 * ends); right, the walk's copies per cell. Shows whether the CN steps in
 * the cells match the amplicon's boundaries and copy number.
 */
export default function WalkRegionHeatmap({ walk, walks = [], colorOf, onFocus }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const [ref, width] = useContainerWidth(1100);
  const pixelRatio = usePixelRatio();
  const { order, treeLayout, cellById } = useTreeView();
  const { cn, palette, cloneColors, selectedCellIds, hoveredCellId, layout } = useSelector((s) => s.SingleCell);
  const chromoBins = useSelector((s) => s.Settings.chromoBins);
  const genesState = useSelector((s) => s.Genes);
  const [pad, setPad] = useState(5e5);
  const [hover, setHover] = useState(null);
  const height = layout.walkHeatHeight || 420;
  const nRows = order.length;
  const rowH = nRows ? height / nRows : 0;
  const leafClones = useMemo(() => order.map((id) => cellById.get(id)?.clone_id ?? null), [order, cellById]);
  const rowOf = useMemo(() => new Map(order.map((id, i) => [id, i])), [order]);
  const selectedRows = useMemo(() => new Set(selectedCellIds.map((id) => rowOf.get(id)).filter((r) => r != null)), [selectedCellIds, rowOf]);
  const hoverRow = hoveredCellId != null && rowOf.has(hoveredCellId) ? rowOf.get(hoveredCellId) : null;
  // one padded domain per chromosome the walk touches (global coordinates)
  const domains = useMemo(() => {
    if (!walk) return [];
    const byChr = d3.group(walk.nodes, (n) => n.chromosome);
    return [...byChr.entries()]
      .map(([chr, nodes]) => {
        const g0 = toGlobal(chromoBins, chr, d3.min(nodes, (n) => n.start));
        const g1 = toGlobal(chromoBins, chr, d3.max(nodes, (n) => n.end));
        const bin = chromoBins?.[chr];
        if (!Number.isFinite(g0) || !bin) return null;
        return [Math.max(bin.startPlace, g0 - pad), Math.min(bin.endPlace, g1 + pad)];
      })
      .filter(Boolean)
      .sort((a, b) => a[0] - b[0]);
  }, [walk, chromoBins, pad]);
  const heatW = Math.max(300, width - TREE_W - BAR_W - 3 * GAP - 8);
  const cnRowOf = useMemo(() => new Map(cn.status === "ok" ? cn.data.cells.map((id, k) => [id, cn.data.rows[k]]) : []), [cn]);
  const heat = useMemo(() => {
    const lookups = new Map();
    const color = cnColorer(palette, "total");
    return {
      cols: (r) => {
        const row = cnRowOf.get(order[r]);
        if (!row) return null;
        if (!lookups.has(r)) lookups.set(r, genomicColumnLookup(row.binIndex, domains, heatW * pixelRatio).cols);
        return lookups.get(r);
      },
      colorAt: (r, c) => color(cnRowOf.get(order[r]).values[c]),
      extents: domainExtents(domains, heatW),
      axis: chromosomeSpans(chromoBins, domainExtents(domains, heatW)),
    };
  }, [cnRowOf, order, domains, heatW, pixelRatio, palette, chromoBins]);
  const px = (g) => {
    const e = heat.extents.find(([, , d]) => g >= d[0] && g <= d[1]);
    if (!e) return NaN;
    const [px0, px1, d] = e;
    return px0 + ((g - d[0]) / Math.max(1, d[1] - d[0])) * (px1 - px0);
  };
  const genes = useMemo(() => {
    const { optionsList = [], genesStartPoint = [], genesEndPoint = [] } = genesState || {};
    return optionsList.map((o) => ({ name: o.label, start: Number(genesStartPoint[o.value]), end: Number(genesEndPoint[o.value]) })).filter((g) => Number.isFinite(g.start) && domains.some((d) => g.end >= d[0] && g.start <= d[1]));
  }, [genesState, domains]);
  if (!walk) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.ecdna.pick-walk")} />;
  if (cn.status !== "ok" || !treeLayout) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.loading")} />;
  const altEnds = new Set(walk.junctions.filter((j) => j.type === "ALT").flatMap((j) => [j.from, j.to]));
  const maxCopies = d3.max(order, (id) => Number(walk.cells[id]) || 0) || 1;
  const bx = d3.scaleLinear().domain([0, maxCopies]).range([0, BAR_W - 8]);
  const share = (id) => dispatch(singleCellActions.updateHover(id));
  return (
    <Card
      size="small"
      title={<Space><HeatMapOutlined />{t("components.single-cell.ecdna.heat-title")}<Select size="small" value={walk.id} onChange={onFocus} style={{ width: 200 }} options={walks.map((w) => ({ value: w.id, label: w.label }))} /></Space>}
      extra={
        <Space wrap>
          <Text type="secondary">{t("components.single-cell.ecdna.heat-pad")}</Text>
          <Select size="small" value={pad} onChange={setPad} style={{ width: 90 }} options={PADS.map((p) => ({ value: p, label: padLabel(p) }))} />
          <Text type="secondary">{t("components.single-cell.signatures.height")}</Text>
          <Slider min={200} max={1400} step={20} value={height} onChange={(v) => dispatch(singleCellActions.updateLayout({ walkHeatHeight: v }))} style={{ width: 100, margin: "0 6px" }} />
          <SvgExportButton containerRef={ref} name={`walk-region-${walk.label}`} />
        </Space>
      }
    >
      <div ref={ref} onMouseLeave={() => { setHover(null); share(null); }}>
        {/* walk nodes + genes on the heatmap's coordinates */}
        <svg width={TREE_W + GAP + heatW} height={TRACK_H} style={{ display: "block" }}>
          <g transform={`translate(${TREE_W + GAP},0)`}>
            {walk.nodes.map((n, i) => {
              const x0 = px(toGlobal(chromoBins, n.chromosome, n.start));
              const x1 = px(toGlobal(chromoBins, n.chromosome, n.end));
              if (!Number.isFinite(x0) || !Number.isFinite(x1)) return null;
              return (
                <g key={i}>
                  <rect x={Math.min(x0, x1)} y={4} width={Math.max(1, Math.abs(x1 - x0))} height={10} fill={colorOf(walk.id)} fillOpacity={n.strand === "-" ? 0.5 : 0.9} stroke={altEnds.has(i) ? "#cf1322" : "none"} strokeWidth={altEnds.has(i) ? 1.5 : 0}>
                    <title>{`${n.chromosome}:${n.start.toLocaleString()}-${n.end.toLocaleString()} (${n.strand})`}</title>
                  </rect>
                </g>
              );
            })}
            {genes.slice(0, 60).map((g, k) => (
              <g key={g.name}>
                <rect x={px(g.start)} y={20} width={Math.max(1, px(g.end) - px(g.start))} height={4} fill={walk.genes.includes(g.name) ? "#cf1322" : "#8c8c8c"} />
                {(walk.genes.includes(g.name) || genes.length <= 25 || k % Math.ceil(genes.length / 25) === 0) && (
                  <text x={(px(g.start) + px(g.end)) / 2} y={34 + (k % 2) * 10} textAnchor="middle" fontSize={8} fill={walk.genes.includes(g.name) ? "#cf1322" : "#595959"}>{g.name}</text>
                )}
              </g>
            ))}
          </g>
          <text x={TREE_W - 4} y={12} textAnchor="end" fontSize={10} fill="#8c8c8c">{walk.label}</text>
          <text x={TREE_W - 4} y={28} textAnchor="end" fontSize={10} fill="#8c8c8c">{t("components.single-cell.event-cells.genes")}</text>
        </svg>
        <div style={{ display: "flex", gap: GAP, alignItems: "flex-start" }}>
          <PhylogenyCanvas
            layout={treeLayout}
            nRows={nRows}
            width={TREE_W}
            height={height}
            pixelRatio={pixelRatio}
            leafClones={leafClones}
            cloneColors={cloneColors}
            selectedRows={selectedRows}
            hoverRow={hoverRow}
            onSelectRange={([a, b], e) => {
              const ids = order.slice(a, b + 1);
              dispatch(singleCellActions.updateSelection(e.metaKey || e.ctrlKey || e.shiftKey ? [...selectedCellIds, ...ids] : ids));
            }}
            onHoverNode={(node) => share(node && node.isLeaf ? order[node.firstLeaf] : null)}
          />
          <div style={{ position: "relative" }}>
            <HeatmapCanvas
              width={heatW}
              height={height}
              nRows={nRows}
              cols={heat.cols}
              colorAt={heat.colorAt}
              pixelRatio={pixelRatio}
              highlightRows={selectedRows}
              onClick={({ row }, e) => dispatch(singleCellActions.updateSelection(e?.metaKey || e?.ctrlKey ? [...new Set([...selectedCellIds, order[row]])] : [order[row]]))}
              onHover={({ row, col }, e) => {
                const id = order[row];
                share(id);
                const r = cnRowOf.get(id);
                setHover(r && col >= 0 ? { x: e?.clientX || 0, y: e?.clientY || 0, id, clone: cellById.get(id)?.clone_id, segment: binLabel(r.binIndex, col), cnv: r.values[col], copies: Number(walk.cells[id]) || 0 } : null);
              }}
              onLeave={() => setHover(null)}
            />
            {hover && (
              <div className="sc-tooltip" style={{ position: "fixed", left: hover.x + 12, top: hover.y + 12 }}>
                <div><span className="sc-tooltip-key">{t("components.single-cell.tooltip.cell")}</span> {hover.id}{hover.clone != null ? ` · ${hover.clone}` : ""}</div>
                <div><span className="sc-tooltip-key">{t("components.single-cell.tooltip.segment")}</span> {hover.segment}</div>
                <div><span className="sc-tooltip-key">CN</span> {hover.cnv}</div>
                <div><span className="sc-tooltip-key">{walk.label}</span> {hover.copies} copies</div>
              </div>
            )}
          </div>
          <svg width={BAR_W} height={height}>
            {order.map((id, r) => {
              const v = Number(walk.cells[id]) || 0;
              return v > 0 ? <rect key={id} x={4} y={r * rowH} width={bx(v)} height={Math.max(0.5, rowH - (rowH > 3 ? 0.5 : 0))} fill={colorOf(walk.id)}><title>{`${id}: ${v} copies`}</title></rect> : null;
            })}
            <text x={4} y={height - 2} fontSize={8} fill="#8c8c8c">{`0–${maxCopies}`}</text>
          </svg>
        </div>
        <div className="sc-axis" style={{ marginLeft: TREE_W + GAP, width: heatW, height: 18, position: "relative" }}>
          {heat.axis.spans.map((s) => (
            <span key={s.chromosome} className="sc-axis-label" style={{ left: s.x0, width: s.x1 - s.x0, position: "absolute" }}>{`chr${s.chromosome}`}</span>
          ))}
          {heat.extents.map(([px0, px1, d], k) => (
            <React.Fragment key={k}>
              <span className="sc-axis-tick" style={{ left: px0, position: "absolute", top: 10 }}>{d3.format(".2f")((d[0] - toGlobal(chromoBins, heat.axis.spans[0]?.chromosome || "1", 0)) / 1e6)}</span>
            </React.Fragment>
          ))}
        </div>
        <Space wrap style={{ marginTop: 6 }}>
          <HeatmapLegend type="cn" cnMode="total" palette={palette} showClones={false} />
          <Text type="secondary" style={{ fontSize: 12 }}>{t("components.single-cell.ecdna.heat-help")}</Text>
        </Space>
      </div>
    </Card>
  );
}
