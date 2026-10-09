import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Alert, Button, Select, Space, Switch, Typography } from "antd";
import CellTracksPanel from "./cellTracksPanel";
import CellIgvPanel from "./cellIgvPanel";
import GenesPlot from "../genesPlotHiglass";
import HoverLine from "../hoverLine";
import useContainerWidth from "./useContainerWidth";
import singleCellActions, { SC_MAX_TRACK_CELLS } from "../../redux/singleCell/actions";
import settingsActions from "../../redux/settings/actions";
import { locationToDomains } from "../../helpers/utility";
import { useIsSingleCellPatient } from "./eventsToHeatmap";
import { padDomains } from "../../helpers/singleCell/eventDomains";
import HintLine from "./hintLine";

const { Text } = Typography;
const PADS = [0, 5e4, 2.5e5, 1e6, 5e6];
const GENES_H = 130;
const DEFAULT_PAD = 5e4;
const DEFAULT_MULTI = 3;

const padLabel = (bp) => (bp >= 1e6 ? `${bp / 1e6} Mb` : bp ? `${bp / 1e3} kb` : "none");

/** The event's locus (or loci, for fusions) widened by `pad` bp on each side. */
function paddedEventDomains(chromoBins, location, pad, genomeLength) {
  if (!location) return null;
  try {
    return padDomains(locationToDomains(chromoBins, location, { clampRanges: true }), pad, genomeLength);
  } catch (error) {
    return null;
  }
}

/**
 * Plots tab of a filtered event on a single-cell patient: the tracks of one
 * cell carrying the event (or several, with the toggle) around its locus.
 */
function SingleCellEventTracks({ record }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const { chromoBins, genomeLength, domains } = useSelector((state) => state.Settings);
  const genesList = useSelector((state) => state.Genes?.list || []);
  const { cells, cloneColors } = useSelector((state) => state.SingleCell);
  const carriers = useMemo(() => `${record?.cell_ids || ""}`.split(",").filter(Boolean), [record]);
  const [pad, setPad] = useState(DEFAULT_PAD);
  const [multi, setMulti] = useState(false);
  const [one, setOne] = useState(null);
  const [many, setMany] = useState([]);
  // reads open by default where there is something to see at base resolution (SNVs, fusion breakpoints)
  const [showIgv, setShowIgv] = useState(() => Boolean(record?.Variant_g && /^\w+:\d+/.test(`${record.Variant_g}`)) || Boolean(record?.fusion_gene_coords && record.fusion_gene_coords !== "None"));
  const [trackRef, trackWidth] = useContainerWidth(900);
  useEffect(() => {
    setOne(carriers[0] || null);
    setMany(carriers.slice(0, DEFAULT_MULTI));
  }, [carriers]);

  const location = record?.actualLocation || record?.location;
  useEffect(() => {
    const domains = paddedEventDomains(chromoBins, location, pad, genomeLength);
    if (domains) dispatch(settingsActions.updateDomains(domains));
  }, [dispatch, chromoBins, location, pad, genomeLength]);

  const cloneOf = useMemo(() => new Map(cells.map((c) => [c.cell_id, c.clone_id])), [cells]);
  const options = carriers.map((id) => ({
    value: id,
    label: (
      <span>
        {cloneOf.get(id) != null && <span className="sc-swatch" style={{ background: cloneColors[cloneOf.get(id)] }} />}
        {id}
      </span>
    ),
  }));
  if (!carriers.length) {
    return <Alert type="info" showIcon message={t("components.single-cell.event-cells.no-cells")} />;
  }
  const shown = multi ? many : one ? [one] : [];
  // IGV at the event: SNVs at the variant position, fusions at both breakpoints, CNAs at the gene start
  const bps = `${record?.fusion_gene_coords || ""}`.split(",").map((s) => s.match(/^(\w+):(\d+)/)).filter(Boolean).map((m) => ({ chromosome: m[1], position: Number(m[2]) }));
  const snvPos = `${record?.Variant_g || ""}`.match(/^(\w+):(\d+)/);
  const igvView = shown.length
    ? {
        cellIds: shown,
        chromosome: bps.length ? bps[0].chromosome : snvPos ? snvPos[1] : `${record?.seqnames}`,
        position: bps.length ? bps[0].position : snvPos ? Number(snvPos[2]) : Number(record?.start),
        loci: bps.length > 1 ? bps : undefined,
        label: record?.gene || record?.fusion_genes,
      }
    : null;

  return (
    <Space direction="vertical" size={8} style={{ width: "100%" }}>
      <Space wrap>
        <Text type="secondary">{t("components.single-cell.event-cells.carriers", { count: carriers.length })}</Text>
        <Switch size="small" checked={multi} onChange={setMulti} />
        <Text>{t("components.single-cell.event-cells.multiple")}</Text>
        {multi ? (
          <Select
            size="small"
            mode="multiple"
            maxCount={SC_MAX_TRACK_CELLS}
            style={{ minWidth: 360 }}
            value={many}
            onChange={setMany}
            options={options}
            maxTagCount="responsive"
            showSearch
          />
        ) : (
          <Select size="small" style={{ minWidth: 280 }} value={one} onChange={setOne} options={options} showSearch />
        )}
        <Text type="secondary">{t("components.single-cell.event-cells.pad")}</Text>
        <Select size="small" style={{ width: 100 }} value={pad} onChange={setPad} options={PADS.map((p) => ({ value: p, label: padLabel(p) }))} />
        <Button size="small" type="link" onClick={() => dispatch(singleCellActions.updateSelection(carriers))}>
          {t("components.single-cell.event-cells.select-all", { count: carriers.length })}
        </Button>
        <Switch size="small" checked={showIgv} onChange={setShowIgv} />
        <Text>{t("components.single-cell.event-cells.igv")}</Text>
      </Space>
      {showIgv && igvView && Number.isFinite(igvView.position) && (
        <div>
          <HintLine text={t("components.single-cell.event-cells.igv-help", { count: shown.length })} />
          <CellIgvPanel view={igvView} embedded />
        </div>
      )}
      <div ref={trackRef} style={{ padding: "0 8px", position: "relative" }}>
        <Text type="secondary" style={{ fontSize: 12.5 }}>{t("components.single-cell.event-cells.genes")}</Text>
        {genesList.length > 0 && (
          <div style={{ position: "relative", height: GENES_H }}>
            <GenesPlot {...{ width: Math.max(200, trackWidth - 16), height: GENES_H, domains, genesList }} />
            <HoverLine width={Math.max(200, trackWidth - 16)} height={GENES_H} margins={{ gapX: 50, gapY: 0, gapYUnits: 2 }} />
          </div>
        )}
      </div>
      <CellTracksPanel
        cellIds={shown}
        embedded
        title={t("components.single-cell.event-cells.title", { location: location || "" })}
        onRemove={(id) => (multi ? setMany(many.filter((c) => c !== id)) : setOne(null))}
      />
    </Space>
  );
}

/** IGV view of an event for the given cells: SNVs at the variant, fusions at both breakpoints, CNAs at the gene start. */
export function eventIgvView(record, cellIds) {
  const bps = `${record?.fusion_gene_coords || ""}`.split(",").map((s) => s.match(/^(\w+):(\d+)/)).filter(Boolean).map((m) => ({ chromosome: m[1], position: Number(m[2]) }));
  const snvPos = `${record?.Variant_g || ""}`.match(/^(\w+):(\d+)/);
  const view = {
    cellIds,
    chromosome: bps.length ? bps[0].chromosome : snvPos ? snvPos[1] : `${record?.seqnames}`,
    position: bps.length ? bps[0].position : snvPos ? Number(snvPos[2]) : Number(record?.start),
    loci: bps.length > 1 ? bps : undefined,
    label: record?.gene || record?.fusion_genes,
  };
  return Number.isFinite(view.position) ? view : null;
}

/** Reads tab of the popup on a single-cell patient: IGV of the carrier cells at the event. */
function SingleCellEventReads({ record }) {
  const { t } = useTranslation("common");
  const { cells, cloneColors } = useSelector((state) => state.SingleCell);
  const carriers = useMemo(() => `${record?.cell_ids || ""}`.split(",").filter(Boolean), [record]);
  const [picked, setPicked] = useState([]);
  useEffect(() => setPicked(carriers.slice(0, 3)), [carriers]);
  const cloneOf = useMemo(() => new Map(cells.map((c) => [c.cell_id, c.clone_id])), [cells]);
  if (!carriers.length) return <Alert type="info" showIcon message={t("components.single-cell.event-cells.no-cells")} />;
  const view = picked.length ? eventIgvView(record, picked) : null;
  return (
    <Space direction="vertical" size={8} style={{ width: "100%" }}>
      <Space wrap>
        <Text type="secondary">{t("components.single-cell.event-cells.carriers", { count: carriers.length })}</Text>
        <Select
          size="small"
          mode="multiple"
          maxCount={SC_MAX_TRACK_CELLS}
          style={{ minWidth: 360 }}
          value={picked}
          onChange={setPicked}
          options={carriers.map((id) => ({ value: id, label: <span>{cloneOf.get(id) != null && <span className="sc-swatch" style={{ background: cloneColors[cloneOf.get(id)] }} />}{id}</span> }))}
          maxTagCount="responsive"
          showSearch
        />
        <HintLine text={t("components.single-cell.event-cells.igv-help", { count: picked.length })} />
      </Space>
      {view ? <CellIgvPanel view={view} embedded /> : <Alert type="info" showIcon message={t("components.single-cell.event-cells.no-position")} />}
    </Space>
  );
}

/** Reads (IGV) of the carrier cells on a single-cell patient, otherwise the bulk tracks (`fallback`). */
export function EventReads({ record, fallback }) {
  const singleCell = useIsSingleCellPatient();
  return singleCell ? <SingleCellEventReads record={record} /> : fallback;
}

/** Per-cell tracks on a single-cell patient, otherwise the bulk tracks (`fallback`). */
export default function EventTracks({ record, fallback }) {
  const singleCell = useIsSingleCellPatient();
  return singleCell ? <SingleCellEventTracks record={record} /> : fallback;
}
