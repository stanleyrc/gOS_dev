import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Button, Space, Tooltip, Typography } from "antd";
import { AiOutlineFullscreen, AiOutlineZoomIn, AiOutlineZoomOut } from "react-icons/ai";
import HeatmapCanvas from "./heatmapCanvas";
import {
  wheelZoomFactor,
  columnBins,
  snvBinSummary,
  snvMetricRGBA,
  snvMetricValue,
  vafRGBA,
} from "../../helpers/singleCell/matrix";

const { Text } = Typography;
const MIN_SITES = 5;
const CATEGORY_BAR = 10;

/** Where an SNV maps on the tree (variant.category), in legend order. */
export const SNV_CATEGORIES = [
  { key: "truncal", color: "#6a3d9a" },
  { key: "subclonal", color: "#ff7f00" },
  { key: "private", color: "#33a02c" },
  { key: "outside_tumor", color: "#8c8c8c" },
  { key: "unmapped", color: "#d9d9d9" },
];
const CATEGORY_COLOR = Object.fromEntries(SNV_CATEGORIES.map((c) => [c.key, c.color]));

/**
 * One-row bar of site categories over the SNV columns. Binned pixels show
 * their most common category; hovering names the category and its share.
 */
function CategoryBar({ snv, columnOrder, bins, width, pixelRatio, t }) {
  const ref = useRef(null);
  const [title, setTitle] = useState("");
  const deviceWidth = Math.floor(width * pixelRatio);
  const summaryAt = useCallback(
    (x) => {
      const a = bins.binStart[x];
      const b = bins.binEnd[x];
      if (a < 0) return null;
      const counts = {};
      for (let i = a; i < b; i += 1) {
        const k = snv.variants[columnOrder[i]]?.category || "unmapped";
        counts[k] = (counts[k] || 0) + 1;
      }
      const top = Object.entries(counts).sort((p, q) => q[1] - p[1])[0];
      return { top: top[0], counts, n: b - a };
    },
    [bins, snv, columnOrder]
  );
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let x = 0; x < deviceWidth; x += 1) {
      const s = summaryAt(x);
      if (!s) continue;
      ctx.fillStyle = CATEGORY_COLOR[s.top] || CATEGORY_COLOR.unmapped;
      ctx.fillRect(x, 0, 1, canvas.height);
    }
  }, [deviceWidth, summaryAt]);
  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const s = summaryAt(Math.floor((e.clientX - rect.left) * pixelRatio));
    if (!s) return setTitle("");
    const parts = Object.entries(s.counts).map(([k, n]) => `${t(`components.single-cell.snv.category-${k}`)}: ${n}`);
    return setTitle(s.n > 1 ? `${s.n} sites · ${parts.join(" · ")}` : parts[0].replace(/: 1$/, ""));
  };
  return (
    <canvas
      ref={ref}
      title={title}
      width={deviceWidth}
      height={Math.round(CATEGORY_BAR * pixelRatio)}
      style={{ width, height: CATEGORY_BAR, display: "block" }}
      onMouseMove={onMove}
    />
  );
}

const clampRange = (start, span, total) => {
  const size = Math.max(Math.min(MIN_SITES, total), Math.min(total, Math.round(span)));
  const s = Math.max(0, Math.min(total - size, Math.round(start)));
  return [s, s + size];
};

/**
 * Compact mutation matrix beside the copy-number heatmap: rows follow the
 * tree, columns follow `columnOrder`. When there are more sites than pixel
 * columns each pixel is a bin coloured by the fraction of sites with alt
 * reads; zoomed in, each site has its own column coloured by the metric
 * (VAF, alt reads or total reads). Cmd/Ctrl/Alt-scroll zooms, drag pans,
 * double-click resets. Clicking a binned column zooms to its sites; clicking
 * a single site calls onSiteClick (the gOS view opens that cell's reads).
 */
export default function MutationSidePanel({
  snv,
  rows,
  nRows,
  columnOrder,
  metric,
  max,
  width,
  height,
  pixelRatio = 1,
  onRowClick,
  onSiteClick = null,
  onHover,
  onLeave,
  axisHeight = 18,
  groupOf = null,
  highlightRows = null,
  wheelNeedsModifier = true,
  categoryNode = null,
}) {
  const { t } = useTranslation("common");
  const total = columnOrder.length;
  const [range, setRange] = useState([0, total]);
  useEffect(() => setRange([0, total]), [columnOrder, total]);
  const rangeRef = useRef(range);
  rangeRef.current = range;

  const deviceWidth = Math.floor(width * pixelRatio);
  const bins = useMemo(() => columnBins(total, deviceWidth, range), [total, deviceWidth, range]);
  const cols = useMemo(() => Int32Array.from({ length: deviceWidth }, (_, x) => (bins.binStart[x] < 0 ? -1 : x)), [bins, deviceWidth]);

  // Chromosome labels when columns are in genomic order.
  const groups = useMemo(() => {
    if (!groupOf) return { spans: [], separators: [] };
    const spans = [];
    let startX = 0;
    let key = null;
    for (let x = 0; x <= deviceWidth; x += 1) {
      const k = x < deviceWidth && bins.binStart[x] >= 0 ? groupOf(columnOrder[bins.binStart[x]]) : null;
      if (x === 0) key = k;
      else if (k !== key || x === deviceWidth) {
        spans.push({ label: key, x0: startX / pixelRatio, x1: x / pixelRatio });
        startX = x;
        key = k;
      }
    }
    return { spans, separators: spans.slice(1).map((sp) => sp.x0) };
  }, [groupOf, bins, columnOrder, deviceWidth, pixelRatio]);

  const colorAt = useCallback(
    (r, x) => {
      const p = rows[r];
      const a = bins.binStart[x];
      const b = bins.binEnd[x];
      if (b - a > 1) {
        const { positive, missing } = snvBinSummary(snv, p, columnOrder, a, b);
        return missing === b - a ? vafRGBA(null) : vafRGBA(positive / (b - a));
      }
      return snvMetricRGBA(snvMetricValue(snv, p, columnOrder[a], metric), metric, max);
    },
    [rows, bins, snv, columnOrder, metric, max]
  );

  const describe = (r, x) => {
    const p = rows[r];
    const a = bins.binStart[x];
    const b = bins.binEnd[x];
    if (a < 0) return [];
    if (b - a > 1) {
      const first = snv.variants[columnOrder[a]];
      const last = snv.variants[columnOrder[b - 1]];
      const { positive, zero, missing } = snvBinSummary(snv, p, columnOrder, a, b);
      return [
        [t("components.single-cell.side.sites"), `${b - a} (${first.id} … ${last.id})`],
        [t("components.single-cell.side.positive"), positive],
        [t("components.single-cell.side.zero"), zero],
        [t("components.single-cell.side.no-reads"), missing],
      ];
    }
    const c = columnOrder[a];
    const v = snv.variants[c];
    const fmt = (value) => (value == null ? t("components.single-cell.side.no-reads") : value);
    const vaf = snvMetricValue(snv, p, c, "vaf");
    return [
      [t("components.single-cell.tooltip.variant"), v.id],
      ...(v.gene ? [[t("components.single-cell.tooltip.gene"), v.gene]] : []),
      ...(v.category
        ? [[
            t("components.single-cell.snv.category"),
            `${t(`components.single-cell.snv.category-${v.category}`)}${v.cladeCells != null ? ` (${v.cladeCells} cells)` : ""}`,
          ]]
        : []),
      [t("components.single-cell.metric.vaf"), vaf == null ? fmt(null) : vaf.toFixed(3)],
      [t("components.single-cell.metric.alt"), fmt(snvMetricValue(snv, p, c, "alt"))],
      [t("components.single-cell.metric.depth"), fmt(snvMetricValue(snv, p, c, "depth"))],
    ];
  };

  const zoomAt = (fraction, factor) => {
    const [s, e] = rangeRef.current;
    const span = e - s;
    const next = span * factor;
    setRange(clampRange(s + fraction * span - fraction * next, next, total));
  };
  const handleDrag = ({ dx }) => {
    const [s, e] = rangeRef.current;
    setRange(clampRange(s - (dx * (e - s)) / width, e - s, total));
  };

  const [s, e] = range;
  const zoomed = e - s < total;
  const hasCategories = useMemo(() => snv.variants.some((v) => v.category), [snv]);
  return (
    <div style={{ width }}>
      {categoryNode &&
        hasCategories &&
        createPortal(
          <CategoryBar snv={snv} columnOrder={columnOrder} bins={bins} width={width} pixelRatio={pixelRatio} t={t} />,
          categoryNode
        )}
      <div onDoubleClick={() => setRange([0, total])}>
        <HeatmapCanvas
          width={width}
          height={height}
          nRows={nRows}
          cols={cols}
          colorAt={colorAt}
          pixelRatio={pixelRatio}
          separators={groups.separators}
          highlightRows={highlightRows}
          onClick={(hit, event) => {
            const a = bins.binStart[hit.col];
            const b = bins.binEnd[hit.col];
            if (a >= 0 && b - a > 1) {
              setRange(clampRange(a, b - a, total));
              return;
            }
            onRowClick(hit, event);
            if (a >= 0 && onSiteClick) onSiteClick(hit.row, columnOrder[a], event);
          }}
          onDrag={handleDrag}
          onWheelZoom={(e) => zoomAt(e.x / width, wheelZoomFactor(e))}
          wheelNeedsModifier={wheelNeedsModifier}
          onHover={({ row, col }, event) => onHover(row, col < 0 ? [] : describe(row, col), event)}
          onLeave={onLeave}
        />
      </div>
      {groupOf && (
        <div className="sc-axis" style={{ width, height: axisHeight }}>
          {groups.spans
            .filter((sp) => sp.label != null && sp.x1 - sp.x0 >= 14)
            .map((sp, k) => (
              <span key={`${sp.label}-${k}`} className="sc-axis-label" style={{ left: sp.x0, width: sp.x1 - sp.x0 }}>
                {sp.label}
              </span>
            ))}
        </div>
      )}
      <div className="sc-side-axis" style={{ height: axisHeight }}>
        <Text type="secondary" className="sc-hint">
          {zoomed
            ? t("components.single-cell.side.range", { from: s + 1, to: e, total })
            : t("components.single-cell.side.all", { total })}
          {bins.binned ? ` · ${t("components.single-cell.side.binned")}` : ""}
        </Text>
        <Space size={2}>
          <Tooltip title={t("components.single-cell.heatmap.zoom-in")}>
            <Button size="small" type="text" icon={<AiOutlineZoomIn />} onClick={() => zoomAt(0.5, 0.5)} />
          </Tooltip>
          <Tooltip title={t("components.single-cell.heatmap.zoom-out")}>
            <Button size="small" type="text" icon={<AiOutlineZoomOut />} onClick={() => zoomAt(0.5, 2)} />
          </Tooltip>
          <Tooltip title={t("components.single-cell.side.reset")}>
            <Button size="small" type="text" icon={<AiOutlineFullscreen />} onClick={() => setRange([0, total])} />
          </Tooltip>
        </Space>
      </div>
    </div>
  );
}
