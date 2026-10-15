import React, { useMemo, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Typography } from "antd";
import HeatmapCanvas from "../heatmapCanvas";
import HeatmapLegend from "../heatmapLegend";
import { binLabel, chromosomeSpans, cnColorer, domainExtents, genomicColumnLookup, genomicTicks, panDomain, wheelZoomFactor, zoomDomain } from "../../../helpers/singleCell/matrix";
import { cnRowsForLeaves } from "../../../helpers/singleCell/cnCompare";
import { rowsOf } from "../../../helpers/singleCell/treeCompare";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import settingsActions from "../../../redux/settings/actions";
import usePixelRatio from "../usePixelRatio";
import usePlotTheme from "../usePlotTheme";

const { Text } = Typography;
const DOMAIN_GAP = 50;
const AXIS_H = 34;
export const CN_AXIS_H = AXIS_H;

/** One tree's copy-number heatmap: rows = the tree's leaves, columns = the shared genome domains. */
export function CnSide({ title, layout, source, cnMode, cnColor, width, height, pixelRatio, domains, chromoBins, bounds, zoomedByCmd, push, current, hover, onHover, onLeave, t }) {
  const nRows = layout.leaves.length;
  const { map, missing } = useMemo(() => cnRowsForLeaves(layout.leaves, source.cells, source.rows), [layout, source]);
  const devWidth = width * pixelRatio;
  const rows = source.rows;
  const valuesOf = (row) => (cnMode === "major" ? row.major : cnMode === "minor" ? row.minor : row.values);
  const cols = useMemo(() => {
    const lookups = new Map();
    return (r) => {
      const p = map[r];
      if (p < 0) return null;
      if (!lookups.has(p)) lookups.set(p, genomicColumnLookup(rows[p].binIndex, domains, devWidth, DOMAIN_GAP * pixelRatio).cols);
      return lookups.get(p);
    };
  }, [map, rows, domains, devWidth, pixelRatio]);
  const colorAt = useMemo(() => (r, c) => cnColor(valuesOf(rows[map[r]])[c]), [map, rows, cnColor, cnMode]); // eslint-disable-line react-hooks/exhaustive-deps
  const extents = useMemo(() => domainExtents(domains, width, DOMAIN_GAP), [domains, width]);
  const axis = useMemo(() => chromosomeSpans(chromoBins, extents), [chromoBins, extents]);
  const ticks = useMemo(() => genomicTicks(chromoBins, extents), [chromoBins, extents]);
  const rowOf = useMemo(() => rowsOf(layout), [layout]);
  const marked = useMemo(() => new Set(hover && rowOf.has(hover) ? [rowOf.get(hover)] : []), [hover, rowOf]);
  const box = useRef(null);

  const extentAt = (x) => {
    const ex = domainExtents(current(), width, DOMAIN_GAP);
    const k = ex.findIndex(([a, b]) => x >= a && x < b);
    return k < 0 ? null : { k, extent: ex[k] };
  };
  const pan = ({ dx, startX }) => {
    const hit = extentAt(startX);
    if (!hit) return;
    const [a, b, d] = hit.extent;
    const next = [...current()];
    next[hit.k] = panDomain(d, (-dx * (d[1] - d[0])) / (b - a), bounds);
    push(next);
  };
  const wheel = ({ x, deltaY, deltaMode, pinch }) => {
    const hit = extentAt(x);
    if (!hit) return;
    const [a, b, d] = hit.extent;
    const anchor = d[0] + ((x - a) / (b - a)) * (d[1] - d[0]);
    const next = [...current()];
    next[hit.k] = zoomDomain(d, anchor, wheelZoomFactor({ deltaY, deltaMode, pinch }), bounds);
    push(next);
  };
  const label = t(`components.single-cell.cn-mode.${cnMode}`);

  return (
    <div style={{ width }} title={`${title}: ${nRows} cells${missing ? `, ${missing} without a copy-number profile (blank rows)` : ""}`}>
      <div ref={box} style={{ overflow: "hidden", width }}>
        <HeatmapCanvas
          width={width}
          height={height}
          nRows={nRows}
          cols={cols}
          colorAt={colorAt}
          pixelRatio={pixelRatio}
          separators={axis.separators}
          highlightRows={marked}
          wheelNeedsModifier={Boolean(zoomedByCmd)}
          onWheelZoom={wheel}
          onDrag={pan}
          onDoubleClick={({ x }) => wheel({ x, deltaY: -500, deltaMode: 0 })}
          onHover={({ row, col }, event) => {
            const p = row >= 0 ? map[row] : -1;
            const lines = row < 0 ? null : p < 0 ? [[label, t("components.single-cell.no-file")]] : col < 0 ? null : [[t("components.single-cell.tooltip.segment"), binLabel(rows[p].binIndex, col)], [label, valuesOf(rows[p])[col]]];
            onHover(row >= 0 ? layout.leaves[row] : null, lines, event);
          }}
          onLeave={onLeave}
        />
      </div>
      <div className="sc-axis" style={{ width, height: AXIS_H, position: "relative" }}>
        {ticks.map((tk, k) => (
          <span key={`tick-${k}`} className="sc-axis-tick" style={{ left: tk.x, top: 16 }} title={`chr${tk.chromosome}:${tk.label}`}>{tk.label}</span>
        ))}
        {axis.spans.filter((s) => s.x1 - s.x0 >= 14).map((s, k) => (
          <span key={`${s.chromosome}-${k}`} className="sc-axis-label sc-axis-link" style={{ left: s.x0, width: s.x1 - s.x0 }} title={t("components.single-cell.heatmap.zoom-chromosome", { chromosome: s.chromosome })} onClick={() => { const c = chromoBins[s.chromosome]; if (c) push([[c.startPlace, c.endPlace]], true); }}>{s.chromosome}</span>
        ))}
      </div>
    </div>
  );
}

/** Shared state of the CN heatmaps: the patient's CN rows from the store, mode, palette and the shared genome zoom. */
export function useCnShared() {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const pixelRatio = usePixelRatio();
  const { cn, allelic, cnMode, palette } = useSelector((s) => s.SingleCell);
  const { domains, chromoBins, defaultDomain, genomeLength, zoomedByCmd } = useSelector((s) => s.Settings);
  const source = cnMode === "total" ? cn : allelic;
  const cnColor = useMemo(() => cnColorer(palette, cnMode), [palette, cnMode]);
  const bounds = useMemo(() => [1, genomeLength || defaultDomain?.[1] || 1], [genomeLength, defaultDomain]);
  const pending = useRef(null);
  const frame = useRef(null);
  React.useEffect(() => { pending.current = null; }, [domains]);
  const current = () => pending.current || domains;
  const push = (next, now = false) => {
    pending.current = next;
    if (now) { dispatch(settingsActions.updateDomains(next)); return; }
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (pending.current) dispatch(settingsActions.updateDomains(pending.current));
    });
  };
  const ready = source.status === "ok" && Boolean(chromoBins) && Boolean(domains?.length);
  const message = ready ? null : source.status === "loading" || source.status === "idle" ? t("components.single-cell.heatmap.loading-allelic") : "Copy-number heatmap: not available (no copy-number profiles were loaded for this patient).";
  return { ready, message, palette, cnMode, props: { source: source.data, cnMode, cnColor, pixelRatio, domains, chromoBins, bounds, zoomedByCmd, push, current, t } };
}

export function CnLegend({ cnMode, palette }) {
  const { t } = useTranslation("common");
  return (
    <div>
      <HeatmapLegend type="cn" cnMode={cnMode} palette={palette} />
      <Text type="secondary" style={{ fontSize: TYPE.tick, display: "block" }}>copy number ({t(`components.single-cell.cn-mode.${cnMode}`)}), beside each tree with the same rows; the genome zoom is shared by both heatmaps and the Single-Cell tab: drag to pan, wheel (with Cmd/Ctrl if set) or double-click to zoom, click a chromosome to zoom to it</Text>
    </div>
  );
}
