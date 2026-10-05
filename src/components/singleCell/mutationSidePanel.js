import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Space, Tooltip, Typography } from "antd";
import { AiOutlineFullscreen, AiOutlineZoomIn, AiOutlineZoomOut } from "react-icons/ai";
import HeatmapCanvas from "./heatmapCanvas";
import {
  columnBins,
  snvBinSummary,
  snvMetricRGBA,
  snvMetricValue,
  vafRGBA,
} from "../../helpers/singleCell/matrix";

const { Text } = Typography;
const MIN_SITES = 5;

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
 * double-click resets.
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
  onHover,
  onLeave,
  axisHeight = 18,
  groupOf = null,
  highlightRows = null,
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
  return (
    <div style={{ width }}>
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
          onClick={onRowClick}
          onDrag={handleDrag}
          onWheelZoom={({ x, deltaY }) => zoomAt(x / width, deltaY > 0 ? 1.25 : 0.8)}
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
