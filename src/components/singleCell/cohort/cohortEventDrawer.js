import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Button, Descriptions, Drawer, Select, Space, Switch, Tag, Typography } from "antd";
import GenomePanel from "../../genomePanel";
import CellIgvPanel from "../cellIgvPanel";
import GeneTrackMini from "../geneTrackMini";
import useContainerWidth from "../useContainerWidth";
import settingsActions from "../../../redux/settings/actions";
import datasetsActions from "../../../redux/datasets/actions";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";
import { dataToGenome, locationToDomains } from "../../../helpers/utility";
import { padDomains } from "../../../helpers/singleCell/eventDomains";
import { eventClass } from "../../../helpers/singleCell/cohortStats";
import { setPendingEvent } from "../pendingEventOpener";

const { Text, Paragraph } = Typography;
const CLASS_COLORS = { amp: "#D7191C", homdel: "#2C7BB6", fusion: "#7B3294", trunc: "#1A1A1A", splice: "#E6AB02", missense: "#1B9E77", other: "#8c8c8c" };
const genomeCache = new Map();
const text = (v) => (v == null || v === "" || v === "None" ? null : `${v}`.replace(/<[^>]+>/g, ""));

/**
 * An alteration of any cohort patient, opened in place: annotation, carriers
 * by clone, the gene track and copy-number graphs of carrier cells around
 * the locus, and reads in IGV — all fetched from the patient's data folder
 * without opening the patient.
 */
export default function CohortEventDrawer({ open, onClose, summary, event, dataset, cells = [], cloneColors = {} }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const { chromoBins, genomeLength } = useSelector((s) => s.Settings);
  const [ref, width] = useContainerWidth(640);
  const [picked, setPicked] = useState([]);
  const [genomes, setGenomes] = useState({});
  const [showIgv, setShowIgv] = useState(false);
  const carriers = useMemo(() => `${event?.cell_ids || ""}`.split(",").filter(Boolean), [event]);
  const cloneOf = useMemo(() => new Map(cells.map((c) => [c.cell_id, c.clone_id])), [cells]);
  const cls = event ? eventClass(event) : "other";
  const pct = d3.format(".0%");

  // zoom the (shared) genome domains to the event, pick the first carriers
  useEffect(() => {
    if (!event) return;
    setPicked(carriers.slice(0, 2));
    setShowIgv(false);
    const loc = event.Genome_Location || `${event.seqnames}:${event.start}-${event.end}`;
    try {
      const domains = padDomains(locationToDomains(chromoBins, loc, { clampRanges: true }), 2.5e5, genomeLength);
      if (domains) dispatch(settingsActions.updateDomains(domains));
    } catch (error) {
      // bad coordinates: keep the current view
    }
  }, [event, carriers, chromoBins, genomeLength, dispatch]);

  useEffect(() => {
    if (!dataset) return undefined;
    let active = true;
    picked.forEach((id) => {
      const key = `${dataset.id}/${id}`;
      if (genomeCache.has(key)) {
        setGenomes((g) => ({ ...g, [id]: genomeCache.get(key) }));
        return;
      }
      tryGet(casePath(dataset, id, "complex.json")).then((r) => {
        const genome = r.status === "ok" ? dataToGenome({ settings: r.data.settings || {}, intervals: r.data.intervals || [], connections: r.data.connections || [] }, chromoBins) : null;
        genomeCache.set(key, genome);
        if (active) setGenomes((g) => ({ ...g, [id]: genome }));
      });
    });
    return () => {
      active = false;
    };
  }, [picked, dataset, chromoBins]);

  if (!event) return null;
  const byClone = {};
  carriers.forEach((id) => {
    const c = cloneOf.get(id) ?? "?";
    byClone[c] = (byClone[c] || 0) + 1;
  });
  const bps = `${event.fusion_gene_coords || ""}`.split(",").map((s) => s.match(/^(\w+):(\d+)/)).filter(Boolean).map((m) => ({ chromosome: m[1], position: Number(m[2]) }));
  const snvPos = `${event.Variant_g || ""}`.match(/^(\w+):(\d+)/);
  const igvView = picked.length
    ? { cellIds: picked, chromosome: bps.length ? bps[0].chromosome : snvPos ? snvPos[1] : `${event.seqnames}`, position: bps.length ? bps[0].position : snvPos ? Number(snvPos[2]) : Number(event.start), loci: bps.length > 1 ? bps : undefined, label: event.gene || event.fusion_genes }
    : null;
  const items = [
    [t("components.single-cell.cohort.ev-variant"), text(event.Variant)],
    [t("components.single-cell.cohort.ev-genomic"), text(event.Variant_g) || text(event.Genome_Location)],
    ["Tier", text(event.Tier)],
    [t("components.single-cell.report.col-role"), text(event.role)],
    [t("components.single-cell.cohort.ev-effect"), text(event.effect)],
    [t("components.single-cell.report.col-cells"), `${event.cells || ""} (${pct(Number(event.cell_fraction) || 0)})`],
    ["VAF", Number.isFinite(Number(event.VAF)) && Number(event.VAF) > 0 ? Number(event.VAF).toFixed(3) : null],
    [t("components.single-cell.cohort.ev-copies"), text(event.estimated_altered_copies) || text(event.fusion_cn)],
  ].filter(([, v]) => v);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={Math.min(980, Math.max(640, window.innerWidth * 0.6))}
      title={
        <Space>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: CLASS_COLORS[cls], display: "inline-block" }} />
          <Text strong>{event.gene || event.fusion_genes}</Text>
          <Text type="secondary">{event.type}</Text>
          <Tag>{summary?.caseReportId}</Tag>
        </Space>
      }
      extra={
        <Button
          size="small"
          onClick={() => {
            setPendingEvent(summary.caseReportId, event);
            dispatch(datasetsActions.openCaseReport(summary.record.datasetId, summary.caseReportId));
          }}
        >
          {t("components.single-cell.cohort.ev-open-patient")}
        </Button>
      }
    >
      <div ref={ref}>
        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          <Descriptions size="small" column={2} colon={false}>
            {items.map(([k, v]) => (
              <Descriptions.Item key={k} label={k}>{v}</Descriptions.Item>
            ))}
          </Descriptions>
          <div>
            <Text type="secondary">{t("components.single-cell.cohort.ev-carriers")}</Text>{" "}
            {Object.entries(byClone)
              .sort((a, b) => b[1] - a[1])
              .map(([c, n]) => (
                <Tag key={c} color={cloneColors[c]}>{`${c} ${n}`}</Tag>
              ))}
          </div>
          {text(event.effect_description) && <Paragraph style={{ marginBottom: 0 }}>{text(event.effect_description)}</Paragraph>}
          {text(event.variant_summary) && <Paragraph type="secondary" style={{ marginBottom: 0 }}>{text(event.variant_summary)}</Paragraph>}
          {text(event.therapeutics) && <Paragraph style={{ marginBottom: 0 }}><Text strong>Therapeutics: </Text>{text(event.therapeutics)}</Paragraph>}
          <Space wrap>
            <Text type="secondary">{t("components.single-cell.cohort.ev-cells")}</Text>
            <Select size="small" mode="multiple" maxCount={4} style={{ minWidth: 320 }} value={picked} onChange={setPicked} options={carriers.map((id) => ({ value: id, label: `${id}${cloneOf.get(id) ? ` · ${cloneOf.get(id)}` : ""}` }))} showSearch maxTagCount="responsive" />
            <Switch size="small" checked={showIgv} onChange={setShowIgv} />
            <Text>{t("components.single-cell.event-cells.igv")}</Text>
          </Space>
          <GeneTrackMini width={Math.max(300, width - 8)} highlight={`${event.gene || ""}`.split("::")[0]} />
          {picked.map((id) =>
            genomes[id] ? (
              <GenomePanel key={id} loading={false} genome={genomes[id]} error={null} filename="complex.json" title={`${id}${cloneOf.get(id) ? ` · ${cloneOf.get(id)}` : ""}`} yAxisTitle={t("components.tracks-modal.genome-y-axis-title")} chromoBins={chromoBins} visible index={0} height={150} />
            ) : (
              <Text key={id} type="secondary">{`${id}: ${genomes[id] === null ? t("components.single-cell.tracks.missing", { track: "complex.json" }) : "…"}`}</Text>
            )
          )}
          {showIgv && igvView && Number.isFinite(igvView.position) && <CellIgvPanel view={igvView} embedded dataset={dataset} />}
        </Space>
      </div>
    </Drawer>
  );
}
