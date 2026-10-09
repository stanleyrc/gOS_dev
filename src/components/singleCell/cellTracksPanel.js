import React, { useEffect, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Alert, Button, Card, Checkbox, Col, Empty, Row, Space, Tag, Typography } from "antd";
import { CloseOutlined, ExportOutlined } from "@ant-design/icons";
import GenomePanel from "../genomePanel";
import ScatterPlotPanel from "../scatterPlotPanel";
import MutationsPanel from "../mutationsPanel";
import PinnedGenesOverlay from "./pinnedGenesOverlay";
import singleCellActions, { SC_FETCHED_TRACKS, SC_MAX_TRACK_CELLS, SC_TRACKS } from "../../redux/singleCell/actions";
import datasetsActions from "../../redux/datasets/actions";
import { dataRanges, dataToGenome } from "../../helpers/utility";
import Wrapper from "./index.style";
import { Provenance } from "./hintLine";

const { Text } = Typography;
const PLOT_HEIGHT = 160;
const COMPACT_PLOT_HEIGHT = 120; // embedded (popup) lanes
const noNotification = { status: null, heading: null, messages: [] };

// Converted genome graphs, keyed by the raw JSON object so panels get
// stable references (they compare props by identity).
const genomeCache = new WeakMap();
const toGenome = (raw, chromoBins) => {
  if (!raw) return null;
  let entry = genomeCache.get(raw);
  if (!entry || entry.chromoBins !== chromoBins) {
    entry = {
      chromoBins,
      genome: dataToGenome(
        { settings: raw.settings || {}, intervals: raw.intervals || [], connections: raw.connections || [] },
        chromoBins
      ),
    };
    genomeCache.set(raw, entry);
  }
  return entry.genome;
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
export function TrackPlot({ cellId, track, data, status = "ok", error = null, chromoBins, commonRangeY = null, height = PLOT_HEIGHT }) {
  const { t } = useTranslation("common");
  const label = t(`components.single-cell.tracks.${track}`);
  if (status !== "ok" || !data) return <TrackNote status={status === "ok" ? "missing" : status} error={error} label={label} />;
  if (track === "total" || track === "mutations") {
    const genome = toGenome(data, chromoBins);
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
          title: `${label} · ${cellId}`,
          yAxisTitle: track === "total" ? t("components.tracks-modal.genome-y-axis-title") : t("components.tracks-modal.mutations-plot-y-axis-title"),
          chromoBins,
          visible: true,
          index: 0,
          height,
          commonRangeY,
        }}
      />
    );
  }
  if (track === "allelic") {
    return (
      <GenomePanel
        {...{ loading: false, genome: data, error: null, filename: "allelic.json", title: `${label} · ${cellId}`, yAxisTitle: t("components.tracks-modal.allelic-plot-y-axis-title"), chromoBins, visible: true, index: 0, height, commonRangeY }}
      />
    );
  }
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
        title: `${label} · ${cellId}`,
        notification: data.hasFit ? noNotification : { status: "warning", heading: t("components.tracks-modal.missing-counts-axis"), messages: [t("components.single-cell.tracks.no-fit")] },
        chromoBins,
        visible: true,
        height,
        yAxisTitle: data.hasFit ? t("components.tracks-modal.coverage-copy-number") : t("components.tracks-modal.coverage-count"),
        yAxis2Title: t("components.tracks-modal.coverage-count"),
        commonRangeY: track === "coverage" && data.hasFit ? commonRangeY : null,
      }}
    />
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
export default function CellTracksPanel({ yScaleMode = "common", cellIds = null, embedded = false, onRemove = null, title = null }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const sc = useSelector((state) => state.SingleCell);
  const { chromoBins, domains } = useSelector((state) => state.Settings);
  const { selectedCellIds, perCell, cellFiles, cells, cloneColors, patient, plotInsets } = sc;
  // Embedded (event popup): its own track choice, CN graph + coverage first.
  const [localTracks, setLocalTracks] = React.useState(["total", "coverage"]);
  const visibleTracks = embedded ? localTracks : sc.visibleTracks;
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
      visibleTracks
        .filter((track) => SC_FETCHED_TRACKS[track] && !perCell[cellId]?.[track])
        .forEach((track) => dispatch(singleCellActions.requestPerCellTrack(cellId, track)))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey, visibleTracks]);
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

  const openCell = (cellId) =>
    patient && dispatch(datasetsActions.openCaseReport(patient.datasetId, cellId));
  const removeCell = (cellId) =>
    onRemove ? onRemove(cellId) : dispatch(singleCellActions.updateSelection(selectedCellIds.filter((c) => c !== cellId)));

  const height = embedded ? COMPACT_PLOT_HEIGHT : PLOT_HEIGHT;
  const renderTrack = (cellId, track) => {
    if (track === "total") return <TrackPlot cellId={cellId} track={track} data={cellFiles[cellId]?.genome} chromoBins={chromoBins} commonRangeY={commonRangeY} height={height} />;
    if (track === "mutations") return <TrackPlot cellId={cellId} track={track} data={cellFiles[cellId]?.mutations} chromoBins={chromoBins} commonRangeY={commonRangeY} height={height} />;
    const entry = perCell[cellId]?.[track];
    return <TrackPlot cellId={cellId} track={track} data={entry?.data} status={entry?.status || "loading"} error={entry?.error} chromoBins={chromoBins} commonRangeY={commonRangeY} height={height} />;
  };
  const orderedTracks = SC_TRACKS.filter((track) => visibleTracks.includes(track));

  return (
    <Wrapper>
      <Card
        size="small"
        title={
          <div className="sc-cell-tracks-header">
            <span>{title || t("components.single-cell.tracks.title")}</span><Provenance id="cellTracks" />
            <Checkbox.Group
              value={visibleTracks}
              onChange={setTracks}
              options={SC_TRACKS.map((track) => ({ value: track, label: label(track) }))}
            />
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
                    <Text strong>{cellId}</Text>
                    {clone != null && <Tag color={cloneColors[clone]}>{clone}</Tag>}
                    <Space size={4}>
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
