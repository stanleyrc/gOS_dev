import React, { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Alert, Button, Card, Checkbox, Col, Empty, Row, Space, Tag, Typography } from "antd";
import { CloseOutlined, ExportOutlined } from "@ant-design/icons";
import GenomePanel from "../genomePanel";
import ScatterPlotPanel from "../scatterPlotPanel";
import MutationsPanel from "../mutationsPanel";
import singleCellActions, { SC_MAX_TRACK_CELLS, SC_TRACKS } from "../../redux/singleCell/actions";
import datasetsActions from "../../redux/datasets/actions";
import { dataRanges, dataToGenome } from "../../helpers/utility";
import Wrapper from "./index.style";

const { Text } = Typography;
const PLOT_HEIGHT = 160;
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
 * Stacked tracks for the selected cells. Coverage and total CN show by
 * default; allelic CN, het SNPs and SNVs are toggles. Every track comes from
 * the cell's own case folder, the same files its full report uses.
 */
export default function CellTracksPanel({ yScaleMode = "common" }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const sc = useSelector((state) => state.SingleCell);
  const { chromoBins, domains } = useSelector((state) => state.Settings);
  const { selectedCellIds, visibleTracks, perCell, cellFiles, cells, cloneColors, patient } = sc;

  const shown = selectedCellIds.slice(0, SC_MAX_TRACK_CELLS);
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
    dispatch(singleCellActions.updateSelection(selectedCellIds.filter((c) => c !== cellId)));

  const scatter = (cellId, track, data) => (
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
        title: `${label(track)} · ${cellId}`,
        notification: data.hasFit
          ? noNotification
          : {
              status: "warning",
              heading: t("components.tracks-modal.missing-counts-axis"),
              messages: [t("components.single-cell.tracks.no-fit")],
            },
        chromoBins,
        visible: true,
        height: PLOT_HEIGHT,
        yAxisTitle: data.hasFit
          ? t("components.tracks-modal.coverage-copy-number")
          : t("components.tracks-modal.coverage-count"),
        yAxis2Title: t("components.tracks-modal.coverage-count"),
        commonRangeY: track === "coverage" && data.hasFit ? commonRangeY : null,
      }}
    />
  );

  const renderTrack = (cellId, track) => {
    if (track === "total") {
      const genome = totals[cellId];
      if (!genome) return <TrackNote status="missing" label={label(track)} />;
      return (
        <GenomePanel
          {...{
            loading: false,
            genome,
            error: null,
            filename: "complex.json",
            title: `${label(track)} · ${cellId}`,
            yAxisTitle: t("components.tracks-modal.genome-y-axis-title"),
            chromoBins,
            visible: true,
            index: 0,
            height: PLOT_HEIGHT,
            commonRangeY,
          }}
        />
      );
    }
    if (track === "mutations") {
      const genome = toGenome(cellFiles[cellId]?.mutations, chromoBins);
      if (!genome) return <TrackNote status="missing" label={label(track)} />;
      return (
        <MutationsPanel
          {...{
            loading: false,
            loadingPercentage: 100,
            genome,
            error: null,
            filename: "mutations.json",
            title: `${label(track)} · ${cellId}`,
            yAxisTitle: t("components.tracks-modal.mutations-plot-y-axis-title"),
            chromoBins,
            visible: true,
            index: 0,
            height: PLOT_HEIGHT,
            commonRangeY,
          }}
        />
      );
    }
    const entry = perCell[cellId]?.[track];
    if (!entry || entry.status !== "ok") {
      return <TrackNote status={entry?.status} error={entry?.error} label={label(track)} />;
    }
    if (track === "allelic") {
      return (
        <GenomePanel
          {...{
            loading: false,
            genome: entry.data,
            error: null,
            filename: "allelic.json",
            title: `${label(track)} · ${cellId}`,
            yAxisTitle: t("components.tracks-modal.allelic-plot-y-axis-title"),
            chromoBins,
            visible: true,
            index: 0,
            height: PLOT_HEIGHT,
            commonRangeY,
          }}
        />
      );
    }
    return scatter(cellId, track, entry.data);
  };

  const orderedTracks = SC_TRACKS.filter((track) => visibleTracks.includes(track));

  return (
    <Wrapper>
      <Card
        size="small"
        title={
          <div className="sc-cell-tracks-header">
            <span>{t("components.single-cell.tracks.title")}</span>
            <Checkbox.Group
              value={visibleTracks}
              onChange={(tracks) => dispatch(singleCellActions.updateVisibleTracks(tracks))}
              options={SC_TRACKS.map((track) => ({ value: track, label: label(track) }))}
            />
          </div>
        }
      >
        <Row gutter={[16, 16]}>
          {shown.length === 0 && (
            <Col span={24}>
              <Empty description={t("components.single-cell.tracks.empty")} />
            </Col>
          )}
          {selectedCellIds.length > SC_MAX_TRACK_CELLS && (
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
                  <Row gutter={[16, 12]}>
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
      </Card>
    </Wrapper>
  );
}
