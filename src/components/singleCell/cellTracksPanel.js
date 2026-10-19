import { highlightEventJunctions } from "../../helpers/singleCell/complexZoom";
import React, { useEffect, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Alert, Button, Card, Checkbox, Col, Empty, InputNumber, Row, Segmented, Select, Space, Typography } from "antd";
import { CloseOutlined, ExportOutlined, MinusOutlined, PlusOutlined, UndoOutlined } from "@ant-design/icons";
import GenomePanel from "../genomePanel";
import ScatterPlotPanel from "../scatterPlotPanel";
import MutationsPanel from "../mutationsPanel";
import PinnedGenesOverlay from "./pinnedGenesOverlay";
import singleCellActions, { SC_FETCHED_TRACKS, SC_MAX_TRACK_CELLS, SC_TRACKS } from "../../redux/singleCell/actions";
import datasetsActions from "../../redux/datasets/actions";
import { dataRanges, dataToGenome } from "../../helpers/utility";
import { effectiveTracks, HET_MODES, storedTrack } from "../../helpers/singleCell/hetTracks";
import { cellCnRange, coverageInView, effectiveRange, formatYMax, graphMaxInView, parseYMax } from "../../helpers/singleCell/cellYScale";
import { readViewLink } from "../../helpers/singleCell/deepLink";
import { Y_MODES, Y_MODE_LABELS, cellTrackRanges, formatYAxis, parseYAxis } from "../../helpers/singleCell/trackScale";
import Wrapper from "./index.style";
import { Provenance } from "./hintLine";
import ColorTag from "./colorTag";
import useCellLabels from "./useCellLabels";

const { Text } = Typography;
const PLOT_HEIGHT = 160;
const COMPACT_PLOT_HEIGHT = 120; // embedded (popup) lanes
const HET_BLOCKS_RANGE = [0, 0.5]; // minor allele fraction
const HET_SNPS_RANGE = [0, 1]; // BAF = alt / depth
const noNotification = { status: null, heading: null, messages: [] };

// Converted genome graphs, keyed by the raw JSON object so panels get
// stable references (they compare props by identity).
const genomeCache = new WeakMap();
const toGenome = (raw, chromoBins, highlight = "") => {
  if (!raw) return null;
  let entry = genomeCache.get(raw);
  if (!entry || entry.chromoBins !== chromoBins) {
    entry = { chromoBins, byHighlight: new Map() };
    genomeCache.set(raw, entry);
  }
  if (!entry.byHighlight.has(highlight)) {
    const src = highlight ? highlightEventJunctions(raw, highlight) : raw;
    entry.byHighlight.set(highlight, dataToGenome({ settings: src.settings || {}, intervals: src.intervals || [], connections: src.connections || [] }, chromoBins));
  }
  return entry.byHighlight.get(highlight);
};

function TrackNote({ status, error, label }) {
  const { t } = useTranslation("common");
  if (status === "missing") {
    return (
      <Alert
        className="sc-track-note"
        type="info"
        showIcon
        message={t("components.single-cell.tracks.missing", { track: label })}
      />
    );
  }
  if (status === "error") {
    return (
      <Alert
        className="sc-track-note"
        type="warning"
        showIcon
        message={t("components.single-cell.tracks.error", { track: label })}
        description={error?.message}
      />
    );
  }
  return <Card size="small" loading className="sc-track-note" title={label} />;
}

/**
 * One track of one cell, from already-converted data: `total` / `mutations`
 * take the raw complex.json / mutations.json object, `allelic` a genome
 * graph, `coverage` / `hetsnps` the arrow scatter. Used by the cell tracks
 * panel and the cohort event drawer.
 */
export function TrackPlot({ cellId, track, data, status = "ok", error = null, chromoBins, commonRangeY = null, height = PLOT_HEIGHT, highlightLocation = "", windowRangesY = null }) {
  const { t } = useTranslation("common");
  const cellLabels = useCellLabels();
  const label = t(`components.single-cell.tracks.${track}`);
  if (status !== "ok" || !data) return <TrackNote status={status === "ok" ? "missing" : status} error={error} label={label} />;
  if (track === "total" || track === "mutations") {
    const genome = toGenome(data, chromoBins, track === "total" ? highlightLocation : "");
    if (!genome) return <TrackNote status="missing" label={label} />;
    const Panel = track === "total" ? GenomePanel : MutationsPanel;
    return (
      <Panel
        {...{
          loading: false,
          loadingPercentage: 100,
          genome,
          error: null,
          filename: track === "total" ? "complex.json" : "mutations.json",
          title: `${label} · ${cellLabels.label(cellId)}`,
          yAxisTitle: track === "total" ? t("components.tracks-modal.genome-y-axis-title") : t("components.tracks-modal.mutations-plot-y-axis-title"),
          chromoBins,
          visible: true,
          index: 0,
          height,
          commonRangeY,
          windowRangesY,
        }}
      />
    );
  }
  if (track === "allelic") {
    return (
      <GenomePanel
        {...{ loading: false, genome: data, error: null, filename: "allelic.json", title: `${label} · ${cellLabels.label(cellId)}`, yAxisTitle: t("components.tracks-modal.allelic-plot-y-axis-title"), chromoBins, visible: true, index: 0, height, commonRangeY }}
      />
    );
  }
  if (track === "hetblocks") {
    return (
      <GenomePanel
        {...{ loading: false, genome: data, error: null, filename: "hetblocks.json", title: `${label} · ${cellLabels.label(cellId)}`, yAxisTitle: t("components.single-cell.tracks.hetblocks-y"), chromoBins, visible: true, index: 0, height, commonRangeY: HET_BLOCKS_RANGE }}
      />
    );
  }
  const isHets = track === "hetsnps";
  return (
    <ScatterPlotPanel
      {...{
        loading: false,
        dataPointsY1: data.dataPointsY1,
        dataPointsY2: data.dataPointsY2,
        dataPointsX: data.dataPointsX,
        dataPointsXHigh: data.dataPointsXHigh,
        dataPointsXLow: data.dataPointsXLow,
        dataPointsColor: data.dataPointsColor,
        error: null,
        filename: track === "coverage" ? "coverage.arrow" : "hetsnps.arrow",
        title: `${label} · ${cellLabels.label(cellId)}`,
        notification: isHets ? noNotification : data.hasFit ? noNotification : { status: "warning", heading: t("components.tracks-modal.missing-counts-axis"), messages: [t("components.single-cell.tracks.no-fit")] },
        chromoBins,
        visible: true,
        height,
        yAxisTitle: isHets ? t("components.single-cell.tracks.hetsnps-y") : data.hasFit ? t("components.tracks-modal.coverage-copy-number") : t("components.tracks-modal.coverage-count"),
        yAxis2Title: t("components.tracks-modal.coverage-count"),
        commonRangeY: isHets ? HET_SNPS_RANGE : track === "coverage" && data.hasFit ? commonRangeY : null,
        windowRangesY: track === "coverage" && data.hasFit ? windowRangesY : null,
      }}
    />
  );
}

/** y-max of one cell's CN tracks: number input with -/+ and "reset to auto". */
function YMaxControl({ range, manual, onChange, label, resetLabel }) {
  const top = range ? range[1] : null;
  if (top == null) return null;
  const step = Math.max(0.5, Math.round(top * 0.1 * 2) / 2);
  const round = (v) => Math.round(v * 100) / 100;
  return (
    <Space.Compact size="small" className="sc-ymax" title={label}>
      <Button size="small" icon={<MinusOutlined />} aria-label={`${label} -`} onClick={() => onChange(Math.max(0.5, round(top - step)))} />
      <InputNumber size="small" controls={false} min={0.5} value={round(top)} style={{ width: 62 }} onChange={(v) => v > 0 && onChange(v)} aria-label={label} />
      <Button size="small" icon={<PlusOutlined />} aria-label={`${label} +`} onClick={() => onChange(round(top + step))} />
      <Button size="small" icon={<UndoOutlined />} disabled={!manual} title={resetLabel} aria-label={resetLabel} onClick={() => onChange(0)} />
    </Space.Compact>
  );
}

/**
 * Stacked tracks for the selected cells. Coverage and total CN show by
 * default; allelic CN, het SNPs and SNVs are toggles. Every track comes from
 * the cell's own case folder, the same files its full report uses.
 */
const TRACK_NESTING = { left: 35, right: 21 };

/**
 * `cellIds` shows those cells instead of the selection (e.g. the cells
 * carrying a filtered event); `embedded` drops the heatmap alignment padding
 * and pinned genes for use inside a modal; `onRemove` replaces "deselect".
 */
export default function CellTracksPanel({ yScaleMode = "cell", cellIds = null, embedded = false, onRemove = null, title = null, highlightLocation = "", yAxisDefault = "shared" }) {
  const { t } = useTranslation("common");
  const cellLabels = useCellLabels();
  const dispatch = useDispatch();
  const sc = useSelector((state) => state.SingleCell);
  const { chromoBins, domains } = useSelector((state) => state.Settings);
  const { selectedCellIds, perCell, cellFiles, cells, cloneColors, patient, plotInsets } = sc;
  // Embedded (event popup): its own track choice, CN graph + coverage first.
  const [localTracks, setLocalTracks] = React.useState(["total", "coverage"]);
  const visibleTracks = embedded ? localTracks : sc.visibleTracks;
  const hetMode = sc.hetMode || "snps";
  const setTracks = (tracks) => (embedded ? setLocalTracks(tracks) : dispatch(singleCellActions.updateVisibleTracks(tracks)));
  // Pad the plots so their genomic area lines up with the heatmap's columns;
  // subtract this panel's own nesting (cell block border/padding, row
  // gutter, each track card's padding and border).
  // Genome panels measure their width on mount and window resize only, so
  // nudge them whenever the heatmap's genomic margins move.
  useEffect(() => {
    const frame = requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    return () => cancelAnimationFrame(frame);
  }, [plotInsets.left, plotInsets.right]);
  const tracksRef = React.useRef(null);
  const [tracksWidth, setTracksWidth] = React.useState(0);
  useEffect(() => {
    const el = tracksRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    // The Row's gutter adds 8 px each side beyond the card content box.
    const observer = new ResizeObserver(() => setTracksWidth(el.getBoundingClientRect().width - 16));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const trackPadding = embedded
    ? {}
    : {
        marginLeft: Math.max(0, plotInsets.left - TRACK_NESTING.left),
        marginRight: Math.max(0, plotInsets.right - TRACK_NESTING.right),
      };

  const listed = cellIds || selectedCellIds;
  const shown = listed.slice(0, SC_MAX_TRACK_CELLS);
  // The saga loads tracks for the selection; explicit cells load here.
  const shownKey = cellIds ? shown.join("|") : "";
  useEffect(() => {
    if (!cellIds) return;
    shown.forEach((cellId) =>
      effectiveTracks(visibleTracks, hetMode)
        .filter((track) => SC_FETCHED_TRACKS[track] && !perCell[cellId]?.[track])
        .forEach((track) => dispatch(singleCellActions.requestPerCellTrack(cellId, track)))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey, visibleTracks, hetMode]);
  const cellById = useMemo(() => new Map(cells.map((c) => [c.cell_id, c])), [cells]);
  const label = (track) => t(`components.single-cell.tracks.${track}`);

  const totals = useMemo(
    () => Object.fromEntries(shown.map((id) => [id, toGenome(cellFiles[id]?.genome, chromoBins)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown.join("|"), cellFiles, chromoBins]
  );

  // Shared y-axis across cells so copy-number levels compare at a glance.
  const commonMax = useMemo(() => {
    if (yScaleMode !== "common") return null;
    const maxima = Object.values(totals)
      .filter((g) => g && g.intervals.length)
      .map((g) => dataRanges(domains, g)[1]);
    return maxima.length ? Math.max(...maxima) : null;
  }, [yScaleMode, totals, domains]);
  const commonRangeY = useMemo(() => (commonMax ? [0, commonMax] : null), [commonMax]);

  // Per cell (default): one CN range per cell, shared by its total CN, allelic CN and coverage tracks.
  // A manual y-max per cell (layout.cellYMax, ?ymax=cell:max) replaces the auto top.
  const linkedYMax = useMemo(() => parseYMax(readViewLink().yMax), []);
  const yMaxByCell = useMemo(() => ({ ...linkedYMax, ...(sc.layout.cellYMax || {}) }), [linkedYMax, sc.layout.cellYMax]);
  const setYMax = (cellId, top) => {
    const next = { ...yMaxByCell };
    if (top > 0) next[cellId] = top;
    else delete next[cellId];
    dispatch(singleCellActions.updateLayout({ cellYMax: next }));
    if (!embedded) {
      try {
        const url = new URL(window.location.href);
        const text = formatYMax(next);
        if (text) url.searchParams.set("ymax", text);
        else url.searchParams.delete("ymax");
        window.history.replaceState(window.history.state, "", url);
      } catch (e) {
        // no history access: the layout still keeps it
      }
    }
  };
  const autoRanges = useMemo(() => {
    if (yScaleMode !== "cell") return {};
    return Object.fromEntries(
      shown.map((id) => {
        const cov = perCell[id]?.coverage?.data;
        const coverage = cov?.hasFit ? coverageInView(cov.dataPointsX, cov.dataPointsY1, domains) : null;
        return [id, cellCnRange({ graphMax: graphMaxInView(totals[id]?.intervals, domains), coverage })];
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yScaleMode, shown.join("|"), totals, perCell, domains]);
  const cellRanges = useMemo(
    () => Object.fromEntries(Object.entries(autoRanges).map(([id, auto]) => [id, effectiveRange(auto, yMaxByCell[id])])),
    [autoRanges, yMaxByCell]
  );

  // Y axis of the CN / coverage tracks: shared (above), per window, per track or a custom maximum; ?yax= remembers it.
  const [yAx, setYAx] = React.useState(() => {
    const fromUrl = parseYAxis(readViewLink().yax);
    const fromLayout = sc.layout.trackYAxis && Y_MODES.includes(sc.layout.trackYAxis.mode) ? sc.layout.trackYAxis : null;
    return fromUrl || fromLayout || { mode: yAxisDefault, custom: null };
  });
  // the host's default can change after mount (the event windows are set by an effect): follow it until the user chooses
  const yAxChosen = React.useRef(Boolean(parseYAxis(readViewLink().yax) || sc.layout.trackYAxis));
  useEffect(() => {
    if (!yAxChosen.current) setYAx({ mode: yAxisDefault, custom: null });
  }, [yAxisDefault]);
  const changeYAx = (next) => {
    yAxChosen.current = true;
    setYAx(next);
    dispatch(singleCellActions.updateLayout({ trackYAxis: next }));
    try {
      const url = new URL(window.location.href);
      if (next.mode === yAxisDefault && !embedded) url.searchParams.delete("yax");
      else url.searchParams.set("yax", formatYAxis(next));
      window.history.replaceState(window.history.state, "", url);
    } catch (e) {
      // no history access: the layout still keeps it
    }
  };
  const windowRanges = useMemo(() => {
    const out = {};
    shown.forEach((id) => {
      const cov = perCell[id]?.coverage?.data;
      const r = cellTrackRanges({ intervals: totals[id]?.intervals, covX: cov?.dataPointsX, covY: cov?.dataPointsY1, hasFit: Boolean(cov?.hasFit), windows: domains || [], mode: yAx.mode, custom: yAx.custom });
      if (r) out[id] = r;
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yAx, shown.join("|"), totals, perCell, domains]);
  const aboveTotal = Object.values(windowRanges).reduce((t, r) => t + (r.above || 0), 0);

  const openCell = (cellId) =>
    patient && dispatch(datasetsActions.openCaseReport(patient.datasetId, cellId));
  const removeCell = (cellId) =>
    onRemove ? onRemove(cellId) : dispatch(singleCellActions.updateSelection(selectedCellIds.filter((c) => c !== cellId)));

  const height = embedded ? COMPACT_PLOT_HEIGHT : PLOT_HEIGHT;
  const renderTrack = (cellId, track) => {
    // CN tracks of a cell share its range in "per cell" mode; SNVs and het SNPs are not CN, so they stay auto.
    const perCellMode = yScaleMode === "cell";
    const cnRange = perCellMode ? cellRanges[cellId] || null : commonRangeY;
    const wr = windowRanges[cellId];
    if (track === "total") return <TrackPlot cellId={cellId} track={track} data={cellFiles[cellId]?.genome} chromoBins={chromoBins} highlightLocation={highlightLocation} commonRangeY={wr ? null : cnRange} windowRangesY={wr ? wr.total : null} height={height} />;
    if (track === "mutations") return <TrackPlot cellId={cellId} track={track} data={cellFiles[cellId]?.mutations} chromoBins={chromoBins} commonRangeY={perCellMode ? null : commonRangeY} height={height} />;
    const entry = perCell[cellId]?.[storedTrack(track, hetMode)];
    const windowed = wr && track === "coverage" && entry?.data?.hasFit;
    return <TrackPlot cellId={cellId} track={storedTrack(track, hetMode)} data={entry?.data} status={entry?.status || "loading"} error={entry?.error} chromoBins={chromoBins} commonRangeY={windowed ? null : cnRange} windowRangesY={windowed ? wr.coverage : null} height={height} />;
  };
  const orderedTracks = SC_TRACKS.filter((track) => visibleTracks.includes(track));

  return (
    <Wrapper>
      <Card
        size="small"
        title={
          <div className="sc-cell-tracks-header">
            <span className="sc-cell-tracks-title">
              {title || t("components.single-cell.tracks.title")} <Provenance id="cellTracks" />
            </span>
            <Checkbox.Group
              value={visibleTracks}
              onChange={setTracks}
              options={SC_TRACKS.map((track) => ({ value: track, label: label(track) }))}
            />
            <Space size={4} className="sc-yaxis-control" data-yaxis-control>
              <Text type="secondary">y-axis</Text>
              <Select
                size="small"
                style={{ width: 150 }}
                value={yAx.mode}
                onChange={(mode) => changeYAx({ mode, custom: mode === "custom" ? yAx.custom || 10 : null })}
                options={Y_MODES.map((m) => ({ value: m, label: Y_MODE_LABELS[m] }))}
              />
              {yAx.mode === "custom" && <InputNumber size="small" min={1} style={{ width: 70 }} value={yAx.custom} onChange={(v) => v > 0 && changeYAx({ mode: "custom", custom: v })} aria-label="custom y maximum" />}
              {yAx.mode === "window" && <Text type="secondary" data-yaxis-note>y per window</Text>}
              {yAx.mode === "track" && <Text type="secondary" data-yaxis-note>y per track</Text>}
              {aboveTotal > 0 && <Text type="warning" data-yaxis-above>{`${aboveTotal} bins above ${yAx.custom} (drawn clamped / off the top)`}</Text>}
            </Space>
            {visibleTracks.includes("hetsnps") && (
              <Segmented
                size="small"
                className="sc-het-mode"
                value={hetMode}
                onChange={(mode) => dispatch(singleCellActions.updateHetMode(mode))}
                options={HET_MODES.map((mode) => ({ value: mode, label: t(`components.single-cell.tracks.het-mode-${mode}`) }))}
              />
            )}
          </div>
        }
      >
        {/* embedded: compact lanes, one per cell, no blank space between them */}
        <div style={{ position: "relative" }} className={embedded ? "sc-compact-tracks" : undefined}>
        {/* Pinned genes down every cell's plots (same genomic area as the heatmap). */}
        {!embedded && (
          <PinnedGenesOverlay left={plotInsets.left + 50} width={Math.max(0, tracksWidth - plotInsets.left - plotInsets.right - 100)} />
        )}
        <Row gutter={embedded ? [0, 0] : [16, 16]} ref={tracksRef}>
          {shown.length === 0 && (
            <Col span={24}>
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.tracks.empty")} />
            </Col>
          )}
          {listed.length > SC_MAX_TRACK_CELLS && (
            <Col span={24}>
              <Text type="warning">
                {t("components.single-cell.selection.track-limit", { limit: SC_MAX_TRACK_CELLS })}
              </Text>
            </Col>
          )}
          {shown.map((cellId) => {
            const clone = cellById.get(cellId)?.clone_id;
            return (
              <Col span={24} key={cellId}>
                <div
                  className="sc-cell-block"
                  style={{ borderLeftColor: clone != null ? cloneColors[clone] : undefined }}
                >
                  <div className="sc-cell-title">
                    <Text strong title={cellLabels.full(cellId)}>{cellLabels.label(cellId)}</Text>
                    {clone != null && <ColorTag color={cloneColors[clone]}>{clone}</ColorTag>}
                    <Space size={4}>
                      {yScaleMode === "cell" && !embedded && (
                        <YMaxControl
                          range={cellRanges[cellId]}
                          manual={yMaxByCell[cellId] > 0}
                          onChange={(top) => setYMax(cellId, top)}
                          label={t("components.single-cell.tracks.ymax")}
                          resetLabel={t("components.single-cell.tracks.ymax-reset")}
                        />
                      )}
                      <Button size="small" icon={<ExportOutlined />} onClick={() => openCell(cellId)}>
                        {t("components.single-cell.tracks.open-cell")}
                      </Button>
                      <Button
                        size="small"
                        type="text"
                        icon={<CloseOutlined />}
                        title={t("components.single-cell.tracks.remove")}
                        onClick={() => removeCell(cellId)}
                      />
                    </Space>
                  </div>
                  <Row gutter={embedded ? [0, 2] : [16, 12]} style={trackPadding}>
                    {orderedTracks.map((track) => (
                      <Col span={24} key={track}>
                        {renderTrack(cellId, track)}
                      </Col>
                    ))}
                  </Row>
                </div>
              </Col>
            );
          })}
        </Row>
        </div>
      </Card>
    </Wrapper>
  );
}
