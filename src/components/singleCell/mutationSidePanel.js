import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cladeScoreDetail } from "../../helpers/singleCell/snvSites";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useDispatch, useSelector } from "react-redux";
import singleCellActions from "../../redux/singleCell/actions";
import { carrierRows } from "../../helpers/singleCell/snvIsolate";
import { columnPick, dragPick } from "../../helpers/singleCell/snvSelection";
import { Button, Space, Tooltip, Typography } from "antd";
import { AiOutlineFullscreen, AiOutlineZoomIn, AiOutlineZoomOut } from "react-icons/ai";
import HeatmapCanvas from "./heatmapCanvas";
import { AnnotationStrips } from "./snvAnnotTracks";
import {
  wheelZoomFactor,
  columnBins,
  groupedColumnBins,
  snvBinSummary,
  snvMetricRGBA,
  snvMetricValue,
  setSnvNaMode,
  vafRGBA,
} from "../../helpers/singleCell/matrix";
import { siteDetail } from "../../helpers/singleCell/snvAnnot";
import { placeLabels, siteLabel } from "../../helpers/singleCell/snvLabels";

export const LABEL_H = 96;

/** Rotated site labels under the matrix columns (drivers always, other sites when columns are wide enough). */
function ColumnLabels({ labels, width, snv }) {
  if (!labels.length) return null;
  return (
    <svg width={width} height={LABEL_H} style={{ display: "block", overflow: "hidden" }} className="sc-column-labels">
      {labels.map((l) => (
        <g key={l.c}>
          <line x1={l.x} x2={l.x} y1={0} y2={4} stroke={l.driver ? "#cf1322" : "var(--sc-muted, #888)"} strokeWidth={1} />
          <text transform={`translate(${l.x + 3.5},6) rotate(90)`} fontSize={10} fontWeight={l.driver ? 700 : 400} fill={l.driver ? "#cf1322" : "var(--sc-text, #333)"}>
            {l.text}
            <title>{`${snv.variants[l.c].id}`}</title>
          </text>
        </g>
      ))}
    </svg>
  );
}

const { Text } = Typography;
const MIN_SITES = 5;

/** Where an SNV maps on the tree (variant.category), in legend order. */
export const SNV_CATEGORIES = [
  { key: "truncal", color: "#6a3d9a" },
  { key: "subclonal", color: "#ff7f00" },
  { key: "private", color: "#33a02c" },
  { key: "outside_tumor", color: "var(--sc-muted)" },
  { key: "unmapped", color: "#d9d9d9" },
  { key: "cn_mapped", color: "#1b9e9e" }, // CN-aware mapping (copy-number-altered regions); opt-in layer
];

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
  binKeys = null,
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
  annot = null,
  tracks = [],
  onTrackClick = null,
  trackLabelSide = "left",
  detailExtra = null,
}) {
  const { t } = useTranslation("common");
  const layoutState = useSelector((st) => st.SingleCell.layout) || {};
  const naMode = layoutState.snvNaColor === "grey" ? "grey" : "white"; // white unless the user chose grey
  setSnvNaMode(naMode); // module setting read by the colour functions and the legend
  const labelMode = layoutState.snvLabel || "protein";
  const dispatch = useDispatch();
  const total = columnOrder.length;
  // mutation selection (layout.snvSelected, variant ids): click / Cmd-click / Shift-click / drag on the column strip
  const selectedIds = layoutState.snvSelected;
  const orderIds = useMemo(() => columnOrder.map((c) => snv.variants[c].id), [columnOrder, snv]);
  const selectedSet = useMemo(() => new Set(selectedIds || []), [selectedIds]);
  const selectedIdx = useMemo(() => orderIds.reduce((acc, id, k) => (selectedSet.has(id) ? (acc.push(k), acc) : acc), []), [orderIds, selectedSet]);
  const selectedCols = useMemo(() => selectedIdx.map((k) => columnOrder[k]), [selectedIdx, columnOrder]);
  const selectionCarriers = useMemo(
    () => (selectedCols.length ? carrierRows(snv, selectedCols, rows) : null),
    [selectedCols, snv, rows]
  );
  // carriers of the selected mutations are outlined (when they are a minority of the cells), with any rows the parent marks
  const outlined = useMemo(() => {
    if (!selectionCarriers || selectionCarriers.size >= 0.5 * nRows) return highlightRows;
    return highlightRows ? new Set([...highlightRows, ...selectionCarriers]) : selectionCarriers;
  }, [selectionCarriers, highlightRows, nRows]);
  const anchorRef = useRef(null);
  const stripRef = useRef(null);
  const [dragSel, setDragSel] = useState(null); // [i0, i1] while dragging on the strip
  const [stripHover, setStripHover] = useState(null);
  const setSelected = (ids) => dispatch(singleCellActions.updateLayout({ snvSelected: ids }));
  const [range, setRange] = useState([0, total]);
  useEffect(() => setRange([0, total]), [columnOrder, total]);
  const rangeRef = useRef(range);
  rangeRef.current = range;

  const deviceWidth = Math.floor(width * pixelRatio);
  const bins = useMemo(
    () => (binKeys && binKeys.length === total ? groupedColumnBins(binKeys, deviceWidth, range) : columnBins(total, deviceWidth, range)),
    [binKeys, total, deviceWidth, range]
  );
  // first draw with sites (perf probes read window.__gosSnvFirstDraw / the performance mark)
  useEffect(() => {
    if (!total || typeof window === "undefined") return;
    const draw = { t: performance.now(), sites: total, cells: rows?.length ?? null };
    window.__gosSnvDraws = [...(window.__gosSnvDraws || []), draw].slice(-20);
    if (window.__gosSnvFirstDraw) return;
    window.__gosSnvFirstDraw = draw;
    try {
      performance.mark("gos-snv-first-draw");
    } catch (e) {
      // no User Timing
    }
  }, [total, rows]);
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

  const labels = useMemo(() => {
    if (!total) return [];
    const [s0, e0] = range;
    return placeLabels(snv.variants, columnOrder, bins, { mode: labelMode, pixelRatio, columnPx: width / Math.max(1, e0 - s0) });
  }, [snv, columnOrder, bins, labelMode, pixelRatio, width, range, total]);

  const colorAt = useCallback(
    (r, x) => {
      const p = rows[r];
      const a = bins.binStart[x];
      const b = bins.binEnd[x];
      if (b - a > 1) {
        const { positive, missing } = snvBinSummary(snv, p, columnOrder, a, b, metric === "gt");
        return missing === b - a ? vafRGBA(null) : vafRGBA(positive / (b - a));
      }
      return snvMetricRGBA(snvMetricValue(snv, p, columnOrder[a], metric), metric, max);
    },
    [rows, bins, snv, columnOrder, metric, max, naMode]
  );

  const describe = (r, x) => {
    const p = rows[r];
    const a = bins.binStart[x];
    const b = bins.binEnd[x];
    if (a < 0) return [];
    if (b - a > 1) {
      const first = snv.variants[columnOrder[a]];
      const last = snv.variants[columnOrder[b - 1]];
      const { positive, zero, missing } = snvBinSummary(snv, p, columnOrder, a, b, metric === "gt");
      return [
        [t("components.single-cell.side.sites"), `${b - a} (${first.id} … ${last.id})`],
        [t("components.single-cell.side.positive"), positive],
        [t("components.single-cell.side.zero"), zero],
        [t("components.single-cell.side.no-reads"), missing],
      ];
    }
    const c = columnOrder[a];
    const v = snv.variants[c];
    const vaf = snvMetricValue(snv, p, c, "vaf");
    const altN = snvMetricValue(snv, p, c, "alt");
    const noReads = t("components.single-cell.side.no-reads");
    const covered = p >= 0 && snv.status[p][c] >= 0;
    const cellRows = [
      ["Cell VAF", vaf == null ? noReads : vaf.toFixed(3)],
      ["Cell ALT reads", altN == null ? (covered && snv.status[p][c] === 1 ? "alt present (count n/a)" : noReads) : altN],
      ["Cell depth", snvMetricValue(snv, p, c, "depth") ?? noReads],
    ];
    if (annot) return [["Mutation", siteLabel(v, "protein")], ...siteDetail(annot, c), ...(detailExtra ? detailExtra(c) : []), ...cellRows];
    return [
      [t("components.single-cell.tooltip.variant"), v.id],
      ...(v.gene ? [[t("components.single-cell.tooltip.gene"), [v.gene, v.protein || v.consequence].filter(Boolean).join(" ")]] : []),
      ...(v.oncogenic || v.oncokbLevel ? [["OncoKB", [v.oncogenic, v.oncokbLevel].filter(Boolean).join(" · ")]] : []),
      ...(v.category
        ? [[
            t("components.single-cell.snv.category"),
            `${t(`components.single-cell.snv.category-${v.category}`)}${v.cladeCells != null ? ` (${v.cladeCells} cells)` : ""}`,
          ]]
        : []),
      ...(v.cladeScore != null ? [[t("components.single-cell.snv.clade-score"), cladeScoreDetail(v)]] : []),
      ...cellRows,
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

  /* ---- column strip: where the mutation selection is made ---- */
  const sitesPerPx = (e - s) / Math.max(1, width);
  const columnAtX = (clientX) => {
    const box = stripRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(width - 1, clientX - box.left));
    const lo = Math.min(total - 1, s + Math.floor(x * sitesPerPx));
    return { lo, hi: Math.min(total - 1, Math.max(lo, s + Math.ceil((x + 1) * sitesPerPx) - 1)) }; // binned: all sites under the pixel
  };
  const onStripDown = (event) => {
    if (event.button !== 0 || !total) return;
    event.preventDefault();
    const start = columnAtX(event.clientX);
    const base = selectedIds || [];
    const startX = event.clientX;
    const additive = event.metaKey || event.ctrlKey;
    let dragged = false;
    const move = (ev) => {
      if (!dragged && Math.abs(ev.clientX - startX) < 4) return;
      dragged = true;
      const cur = columnAtX(ev.clientX);
      setDragSel([Math.min(start.lo, cur.lo), Math.max(start.hi, cur.hi)]);
    };
    const up = (ev) => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setDragSel(null);
      if (dragged) {
        const cur = columnAtX(ev.clientX);
        const [i0, i1] = [Math.min(start.lo, cur.lo), Math.max(start.hi, cur.hi)];
        setSelected(dragPick(base, orderIds, i0, i1, additive));
        anchorRef.current = orderIds[i0];
        return;
      }
      const pick = columnPick(base, orderIds, { ...start, anchorId: anchorRef.current, shift: ev.shiftKey, multi: additive });
      anchorRef.current = pick.anchorId;
      setSelected(pick.selected);
      // a plain click on one site also opens its evidence, as a click in the matrix does
      if (!ev.shiftKey && !additive && start.lo === start.hi && onSiteClick) onSiteClick(null, columnOrder[start.lo], ev);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  const xOf = (k) => ((k - s) / (e - s)) * width;
  const bandStyle = (k0, k1) => {
    const x0 = Math.max(0, xOf(k0));
    const x1 = Math.min(width, xOf(k1 + 1));
    return x1 > x0 ? { left: x0, width: Math.max(2, x1 - x0) } : null;
  };
  const bands = selectedIdx.map((k) => ({ k, style: bandStyle(k, k) })).filter((b) => b.style);
  const dragBand = dragSel ? bandStyle(dragSel[0], dragSel[1]) : null;
  const hoverSite = stripHover != null && stripHover < total ? snv.variants[columnOrder[stripHover]] : null;
  const hoverBinned = sitesPerPx > 1;
  return (
    <div style={{ width }}>
      {categoryNode &&
        annot &&
        tracks.length > 0 &&
        createPortal(
          <AnnotationStrips annot={annot} tracks={tracks} columnOrder={columnOrder} bins={bins} width={width} pixelRatio={pixelRatio} onTrackClick={onTrackClick} labelSide={trackLabelSide} />,
          categoryNode
        )}
      <div onDoubleClick={() => setRange([0, total])} style={{ position: "relative" }}>
        <HeatmapCanvas
          width={width}
          height={height}
          nRows={nRows}
          cols={cols}
          colorAt={colorAt}
          pixelRatio={pixelRatio}
          separators={groups.separators}
          highlightRows={outlined}
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
        {bands.map((b) => (
          <div key={b.k} className="sc-snv-selected-col" style={{ position: "absolute", top: 0, height, pointerEvents: "none", background: "rgba(24,144,255,0.18)", borderLeft: "1px solid #1890ff", borderRight: "1px solid #1890ff", ...b.style }} />
        ))}
      </div>
      <div
        ref={stripRef}
        className="sc-snv-selstrip"
        title={hoverSite ? `${siteLabel(hoverSite, "protein")} (${hoverSite.id})${hoverBinned ? " and neighbours under this pixel" : ""}. Click selects; Cmd/Ctrl-click adds or removes; Shift-click selects a range; drag selects a range.` : "Click a column to select that mutation; Cmd/Ctrl-click adds or removes; Shift-click selects a range; drag across to select a range"}
        style={{ position: "relative", width, height: 12, cursor: "pointer", background: "var(--sc-strip-bg, rgba(128,128,128,0.12))", borderTop: "1px solid rgba(128,128,128,0.3)", userSelect: "none" }}
        onMouseDown={onStripDown}
        onMouseMove={(ev) => total && setStripHover(columnAtX(ev.clientX).lo)}
        onMouseLeave={() => setStripHover(null)}
      >
        {bands.map((b) => (
          <div key={b.k} style={{ position: "absolute", top: 0, bottom: 0, background: "#1890ff", ...b.style }} />
        ))}
        {dragBand && <div style={{ position: "absolute", top: 0, bottom: 0, background: "rgba(24,144,255,0.45)", ...dragBand }} />}
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
      <ColumnLabels labels={labels} width={width} snv={snv} />
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
