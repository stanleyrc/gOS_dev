import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Alert, Button, Select, Space, Switch, Typography } from "antd";
import CellTracksPanel from "./cellTracksPanel";
import CellIgvPanel from "./cellIgvPanel";
import GeneTrack from "../genes/geneTrack";
import useContainerWidth from "./useContainerWidth";
import singleCellActions, { SC_MAX_TRACK_CELLS } from "../../redux/singleCell/actions";
import settingsActions from "../../redux/settings/actions";
import { locationToDomains } from "../../helpers/utility";
import { useIsSingleCellPatient } from "./eventsToHeatmap";
import { padDomains } from "../../helpers/singleCell/eventDomains";
import { mergeLoci } from "../../helpers/singleCell/igvTracks";
import HintLine from "./hintLine";
import { RnaSupportSection, useRnaSupport } from "./rna/rnaSupport";
import useCellLabels from "./useCellLabels";
import { loadCellTrack } from "../../redux/singleCell/loaders";
import { isComplexEvent, footprintLocation, defaultFootprintPad, firstJunctionBreakpoint } from "../../helpers/singleCell/complexZoom";

const { Text } = Typography;
const PADS = [0, 5e4, 2.5e5, 1e6, 5e6];
const DEFAULT_PAD = 5e4;
const DEFAULT_MULTI = 3;

const padLabel = (bp) => (bp >= 1e6 ? `${bp / 1e6} Mb` : bp ? `${bp / 1e3} kb` : "none");

/** Windows merged where they overlap (complex events list several, possibly overlapping, intervals). */
function mergeOverlapping(domains) {
  const out = [];
  [...domains].sort((a, b) => a[0] - b[0]).forEach(([a, b]) => {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  });
  return out;
}

/** The event's locus (or loci, for fusions) widened by `pad` bp on each side. */
function paddedEventDomains(chromoBins, location, pad, genomeLength) {
  if (!location) return null;
  try {
    const padded = padDomains(locationToDomains(chromoBins, location, { clampRanges: true }), pad, genomeLength);
    return padded && mergeOverlapping(padded);
  } catch (error) {
    return null;
  }
}

/**
 * Plots tab of a filtered event on a single-cell patient: the tracks of one
 * cell carrying the event (or several, with the toggle) around its locus.
 * Also used by the RNA fusion popup with a pseudo record (fusionPlotRecord):
 * `rnaFusion` then supplies the RNA reads (of the shown cells), `focusCell`
 * picks the cell shown, `cellNotes` (Map cell -> text) annotates the picker
 * and `defaultPad` sets the initial padding.
 */
export function SingleCellEventTracks({ record, rnaFusion = null, focusCell = null, cellNotes = null, defaultPad = DEFAULT_PAD }) {
  const cellLabels = useCellLabels();
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const { chromoBins, genomeLength, domains } = useSelector((state) => state.Settings);
  const { cells, cloneColors } = useSelector((state) => state.SingleCell);
  const carriers = useMemo(() => `${record?.cell_ids || ""}`.split(",").filter(Boolean), [record]);
  // complex SVs: Genome_Location lists several intervals (comma separated); the cell they were called in is the default
  const complex = isComplexEvent(record);
  const complexLocation = complex ? footprintLocation(record.Genome_Location || record.location) : "";
  const [pad, setPad] = useState(complexLocation ? defaultFootprintPad(complexLocation) : defaultPad);
  const [multi, setMulti] = useState(false);
  const [one, setOne] = useState(null);
  const [many, setMany] = useState([]);
  const rnaSupport = useRnaSupport(record, multi ? many : one ? [one] : [], rnaFusion);
  // reads open by default where there is something to see at base resolution (SNVs, fusion breakpoints)
  const [showIgv, setShowIgv] = useState(() => Boolean(record?.Variant_g && /^\w+:\d+/.test(`${record.Variant_g}`)) || Boolean(record?.fusion_gene_coords && record.fusion_gene_coords !== "None"));
  const [trackRef, trackWidth] = useContainerWidth(900);
  useEffect(() => {
    const wanted = focusCell || (complex ? record.sample : null);
    const first = wanted && carriers.includes(wanted) ? wanted : carriers[0] || null;
    setOne(first);
    setMany(first ? [first, ...carriers.filter((c) => c !== first)].slice(0, DEFAULT_MULTI) : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carriers, focusCell]);

  const location = complexLocation || record?.actualLocation || record?.location;
  const eventDomains = useMemo(() => paddedEventDomains(chromoBins, location, pad, genomeLength), [chromoBins, location, pad, genomeLength]);
  useEffect(() => {
    if (eventDomains) dispatch(settingsActions.updateDomains(eventDomains));
  }, [dispatch, eventDomains]);

  // complex SVs: IGV is centred on the first event junction's breakpoint in the first shown cell
  const dataset = useSelector((state) => state.Settings.dataset);
  const firstShown = (multi ? many : one ? [one] : [])[0];
  const [junctionBp, setJunctionBp] = useState(null);
  useEffect(() => {
    let alive = true;
    setJunctionBp(null);
    if (complexLocation && firstShown && dataset) {
      loadCellTrack(dataset, firstShown, "total", chromoBins).then((res) => {
        if (alive && res.status === "ok") setJunctionBp(firstJunctionBreakpoint(res.data, complexLocation));
      });
    }
    return () => {
      alive = false;
    };
  }, [dataset, firstShown, complexLocation, chromoBins]);

  const cloneOf = useMemo(() => new Map(cells.map((c) => [c.cell_id, c.clone_id])), [cells]);
  const options = carriers.map((id) => ({
    value: id,
    label: (
      <span>
        {cloneOf.get(id) != null && <span className="sc-swatch" style={{ background: cloneColors[cloneOf.get(id)] }} />}
        {cellLabels.label(id)}
        {cellNotes?.get(id) ? <Text type="secondary"> · {cellNotes.get(id)}</Text> : null}
      </span>
    ),
  }));
  if (!carriers.length) {
    return <Alert type="info" showIcon message={t("components.single-cell.event-cells.no-cells")} />;
  }
  const shown = multi ? many : one ? [one] : [];
  // IGV at the event (SNVs at the variant, fusions at both breakpoints), plus RNA slices of supporting cells
  const igvView = shown.length || rnaSupport.rnaTracks.length ? eventIgvView(junctionBp ? { ...record, Variant_g: `${junctionBp.chromosome}:${junctionBp.position}` } : record, shown, rnaSupport.rnaTracks, rnaSupport.rnaLoci) : null;

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
      <RnaSupportSection record={record} support={rnaSupport} />
      {showIgv && igvView && Number.isFinite(igvView.position) && (
        <div>
          <HintLine text={t("components.single-cell.event-cells.igv-help", { count: shown.length })} />
          <CellIgvPanel view={igvView} embedded />
        </div>
      )}
      <div ref={trackRef} style={{ padding: "0 8px", position: "relative" }}>
        <Text type="secondary" style={{ fontSize: 12.5 }}>{t("components.single-cell.event-cells.genes")}</Text>
        {domains?.length > 0 && <GeneTrack width={Math.max(200, trackWidth - 16)} domains={domains} exportName="event-genes" geneSearch homeDomains={eventDomains} />}
      </div>
      <CellTracksPanel
        cellIds={shown}
        embedded
        highlightLocation={complexLocation}
        yAxisDefault={domains?.length > 1 ? "window" : "shared"}
        title={t("components.single-cell.event-cells.title", { location: location || "" })}
        onRemove={(id) => (multi ? setMany(many.filter((c) => c !== id)) : setOne(null))}
      />
    </Space>
  );
}

/**
 * IGV view of an event for the given cells: SNVs at the variant, fusions at
 * both breakpoints, CNAs at the gene start. rnaTracks (per-cell RNA slices,
 * see CellIgvPanel) are shown below the DNA cells; their breakpoints
 * (rnaLoci, where the slices have reads) join the loci shown side by side.
 */
export function eventIgvView(record, cellIds, rnaTracks = [], rnaLoci = []) {
  const bps = `${record?.fusion_gene_coords || ""}`.split(",").map((s) => s.match(/^(\w+):(\d+)/)).filter(Boolean).map((m) => ({ chromosome: m[1], position: Number(m[2]) }));
  const snvPos = `${record?.Variant_g || ""}`.match(/^(\w+):(\d+)/);
  const view = {
    cellIds,
    chromosome: bps.length ? bps[0].chromosome : snvPos ? snvPos[1] : `${record?.seqnames}`,
    position: bps.length ? bps[0].position : snvPos ? Number(snvPos[2]) : Number(record?.start),
    loci: bps.length > 1 ? bps : undefined,
    label: record?.gene || record?.fusion_genes,
    ...(rnaTracks?.length ? { rnaTracks } : {}),
  };
  if (rnaTracks?.length && rnaLoci?.length) {
    const dnaLoci = view.loci || (Number.isFinite(view.position) ? [{ chromosome: view.chromosome, position: view.position }] : []);
    view.loci = mergeLoci(dnaLoci, rnaLoci);
    if (!Number.isFinite(view.position)) Object.assign(view, { chromosome: rnaLoci[0].chromosome, position: rnaLoci[0].position });
    view.window = 100;
  }
  return Number.isFinite(view.position) ? view : null;
}

/** Reads tab of the popup on a single-cell patient: IGV of the carrier cells at the event. */
function SingleCellEventReads({ record }) {
  const cellLabels = useCellLabels();
  const { t } = useTranslation("common");
  const { cells, cloneColors } = useSelector((state) => state.SingleCell);
  const carriers = useMemo(() => `${record?.cell_ids || ""}`.split(",").filter(Boolean), [record]);
  const [picked, setPicked] = useState([]);
  useEffect(() => setPicked(carriers.slice(0, 3)), [carriers]);
  const rnaSupport = useRnaSupport(record, picked);
  const cloneOf = useMemo(() => new Map(cells.map((c) => [c.cell_id, c.clone_id])), [cells]);
  if (!carriers.length) return <Alert type="info" showIcon message={t("components.single-cell.event-cells.no-cells")} />;
  const view = picked.length || rnaSupport.rnaTracks.length ? eventIgvView(record, picked, rnaSupport.rnaTracks, rnaSupport.rnaLoci) : null;
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
          options={carriers.map((id) => ({ value: id, label: <span>{cloneOf.get(id) != null && <span className="sc-swatch" style={{ background: cloneColors[cloneOf.get(id)] }} />}{cellLabels.label(id)}</span> }))}
          maxTagCount="responsive"
          showSearch
        />
        <HintLine text={t("components.single-cell.event-cells.igv-help", { count: picked.length })} />
      </Space>
      <RnaSupportSection record={record} support={rnaSupport} />
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
