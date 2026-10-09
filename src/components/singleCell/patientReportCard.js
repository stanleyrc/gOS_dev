import React, { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Alert, Button, Card, Col, Collapse, Descriptions, Empty, Row, Space, Statistic, Table, Tag, Tooltip, Typography } from "antd";
import DriverCellMatrix from "./driverCellMatrix";
import ReportFindings from "./reportFindings";
import useTreeView from "./useTreeView";
import { cladeFitScore } from "../../helpers/singleCell/cladeFit";
import { segmentNoise } from "../../helpers/singleCell/segmentNoise";
import { eventGlobalPosition } from "../../helpers/singleCell/eventDomains";
import { AimOutlined, ExperimentOutlined, FileSearchOutlined, ProfileOutlined, SelectOutlined } from "@ant-design/icons";
import filteredEventsActions from "../../redux/filteredEvents/actions";
import singleCellActions from "../../redux/singleCell/actions";
import settingsActions from "../../redux/settings/actions";
import { buildPatientReport } from "../../helpers/singleCell/patientReport";
import { eventSnvSiteId } from "../../helpers/singleCell/snvSites";
import { locationToDomains } from "../../helpers/utility";
import { padDomains } from "../../helpers/singleCell/eventDomains";
import { signatureColorOf } from "./signaturePanel";
import { formatP } from "../../helpers/singleCell/tests";
import signatureMetadata from "../../translations/en/signatures.json";
import HintLine, { Provenance, ProvenanceTip } from "./hintLine";
import useRnaFindings from "./rna/useRnaFindings";
import RnaFindingsList, { CloneRnaLine, rnaSummarySentence } from "./rna/rnaFindingsList";
import { SC_GUTTER } from "./density";
import ColorTag from "./colorTag";

const { Text, Paragraph, Title } = Typography;
const CLASS_COLORS = { amp: "#D7191C", homdel: "#2C7BB6", fusion: "#7B3294", trunc: "#1A1A1A", splice: "#E6AB02", missense: "#1B9E77", other: "#8c8c8c" };
const SMALL_CLONE = 3;
const MIN_CLONES_SHOWN = 6;
const aetiology = (sig) => (signatureMetadata.metadata[sig]?.full || "").replace(/<[^>]+>/g, "").replace(/^\S+\s*-\s*/, "");

/** One driver line with actions: select carriers, zoom the heatmap, view reads. */
function DriverRow({ d, cloneColors, interactive, onSelect, onZoom, onIgv, onSites, onDetails, fit, noise = null }) {
  const { t } = useTranslation("common");
  const pct = d3.format(".0%");
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "4px 0", borderBottom: "1px solid var(--sc-border-soft)" }}>
      <span style={{ width: 10, height: 10, marginTop: 5, borderRadius: 2, background: CLASS_COLORS[d.class], flex: "0 0 auto" }} />
      <div style={{ flex: 1 }}>
        <Space size={6} wrap>
          <Text strong>{d.label}</Text>
          {d.tier != null && <Tag>{`Tier ${d.tier}`}</Tag>}
          {d.role && <Tag color={/oncogene/i.test(d.role) ? "volcano" : "geekblue"}>{d.role}</Tag>}
          {d.effect && <Text type="secondary">{d.effect}</Text>}
          {d.unverified && (
            <Tooltip title={t("components.single-cell.report.unverified-help")}>
              <Tag color="warning">{t("components.single-cell.report.unverified")}</Tag>
            </Tooltip>
          )}
          {noise && (
            <Tooltip title={t("components.single-cell.report.segment-help", { mb: (noise.medianWidthBp / 1e6).toFixed(2), narrow: noise.nNarrow, n: noise.nCovered, flank: Number.isFinite(noise.medianFlankCn) ? noise.medianFlankCn.toFixed(0) : "–" })}>
              <Tag color={noise.narrow ? "error" : "default"}>{noise.narrow ? t("components.single-cell.report.segment-narrow", { mb: (noise.medianWidthBp / 1e6).toFixed(2) }) : t("components.single-cell.report.segment", { mb: (noise.medianWidthBp / 1e6).toFixed(1) })}</Tag>
            </Tooltip>
          )}
        </Space>
        <div>
          <Text type="secondary"><Provenance id="cloneFraction">{t("components.single-cell.report.in-cells", { cells: d.cells, pct: pct(d.fraction) })}</Provenance></Text>
          {fit && Number.isFinite(fit.score) && (
            <Tooltip overlayClassName="sc-prov-overlay" title={<ProvenanceTip id="cladeFit" text={t("components.single-cell.report.clade-fit-help", { inClade: fit.inClade, clade: fit.clade, carriers: fit.carriers })} />}>
              <Tag color={fit.score >= 0.8 ? "green" : fit.score < 0.5 ? "red" : "default"} style={{ marginLeft: 6 }}>
                {t("components.single-cell.report.clade-fit", { score: fit.score.toFixed(2) })}
              </Tag>
            </Tooltip>
          )}
          <CloneTags fractions={d.fractions} cloneColors={cloneColors} />
        </div>
      </div>
      {interactive && (
        <Space size={2}>
          <Tooltip title={t("components.single-cell.report.details")}>
            <Button size="small" type="text" icon={<ProfileOutlined />} onClick={() => onDetails(d)} />
          </Tooltip>
          <Tooltip title={t("components.single-cell.report.select-cells")}>
            <Button size="small" type="text" icon={<SelectOutlined />} onClick={() => onSelect(d)} />
          </Tooltip>
          <Tooltip title={t("components.single-cell.report.zoom")}>
            <Button size="small" type="text" icon={<AimOutlined />} onClick={() => onZoom(d)} />
          </Tooltip>
          {d.class !== "amp" && d.class !== "homdel" && (
            <Tooltip title={d.class === "fusion" ? t("components.single-cell.report.igv-fusion") : t("components.single-cell.report.igv")}>
              <Button size="small" type="text" icon={<FileSearchOutlined />} onClick={() => onIgv(d)} />
            </Tooltip>
          )}
          {eventSnvSiteId(d.event) && (
            <Tooltip title={t("components.single-cell.report.show-site")}>
              <Button size="small" type="text" icon={<ExperimentOutlined />} onClick={() => onSites(d)} />
            </Tooltip>
          )}
        </Space>
      )}
    </div>
  );
}

// clone tags under a driver: the clones holding most carriers, the rest folded into "+N"
const CLONE_TAGS_SHOWN = 6;
function CloneTags({ fractions, cloneColors }) {
  const { t } = useTranslation("common");
  const entries = Object.entries(fractions || {})
    .filter(([, f]) => f.n > 0)
    .sort((a, b) => b[1].n - a[1].n || b[1].fraction - a[1].fraction);
  const tag = ([clone, f]) => (
    <Tooltip key={clone} title={t("components.single-cell.report.clone-fisher", { p: formatP(f.p), or: Number.isFinite(f.oddsRatio) ? f.oddsRatio.toFixed(1) : "∞" })}>
      <ColorTag color={cloneColors[clone]} style={{ marginLeft: 6, fontWeight: f.p < 0.01 && f.fraction > 0.5 ? 600 : 400 }}>
        {`${clone} ${f.n}/${f.size}${f.p < 0.01 && f.fraction > 0.5 ? " *" : ""}`}
      </ColorTag>
    </Tooltip>
  );
  const rest = entries.slice(CLONE_TAGS_SHOWN);
  return (
    <>
      {entries.slice(0, CLONE_TAGS_SHOWN).map(tag)}
      {rest.length > 0 && (
        <Tooltip title={rest.map(([c, f]) => `${c} ${f.n}/${f.size}`).join(" · ")}>
          <Tag style={{ marginLeft: 6, cursor: "help" }}>{t("components.single-cell.report.more-clones", { count: rest.length })}</Tag>
        </Tooltip>
      )}
    </>
  );
}

function SignatureBar({ items, width = 320 }) {
  if (!items.length) return <Text type="secondary">–</Text>;
  let x = 0;
  return (
    <svg width={width} height={18}>
      {items.map((s) => {
        const w = width * s.share;
        const rect = (
          <g key={s.signature}>
            <rect x={x} y={0} width={Math.max(0, w - 0.5)} height={18} fill={signatureColorOf(s.signature)} />
            {w > 36 && (
              <text x={x + w / 2} y={9} dy="0.35em" textAnchor="middle" fontSize={11} fill="#fff">
                {s.signature}
              </text>
            )}
            <title>{`${s.signature}: ${d3.format(".0%")(s.share)}${aetiology(s.signature) ? `\n${aetiology(s.signature)}` : ""}`}</title>
          </g>
        );
        x += w;
        return rect;
      })}
    </svg>
  );
}

/**
 * Key findings of a single-cell patient as an interactive report: clonal
 * (truncal) drivers, subclonal drivers and the clones they define, mutation
 * burden by tree position, signatures, and caveats. `interactive` enables
 * the heatmap / IGV actions (only on the patient's own page). RNA findings
 * come from `rna` ({ status, data }, the cohort computes them for every
 * patient) or are computed here from `dataset` (default: the open dataset).
 */
export default function PatientReportCard({ patient, events, cells, variants, signatures, cloneColors = {}, interactive = false, onOpen = null, treeLayout: treeProp = null, rna = null, dataset = null }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const [allClones, setAllClones] = useState(false);
  const { chromoBins, genomeLength } = useSelector((state) => state.Settings);
  const report = useMemo(() => buildPatientReport({ patient, events: events || [], cells: cells || [], variants: variants || [], signatures }), [patient, events, cells, variants, signatures]);
  const openDataset = useSelector((state) => state.Settings.dataset);
  const ownRna = useRnaFindings({ dataset: rna ? null : dataset || (interactive ? openDataset : null), patientId: patient, cells, report });
  const rnaState = rna || ownRna;
  // clade fit of each driver's carriers: the displayed tree on the patient page, the patient's tree.nwk on the cohort page
  const { treeLayout: ownTree } = useTreeView();
  const tree = interactive ? ownTree : treeProp;
  const fitOf = useMemo(() => {
    const m = new Map();
    if (!tree) return m;
    [...report.clonal, ...report.subclonal, ...report.rare].forEach((d) => m.set(d.label, cladeFitScore(`${d.event.cell_ids || ""}`.split(",").filter(Boolean), tree)));
    return m;
  }, [tree, report]);
  const lowFit = [...fitOf.values()].filter((f) => Number.isFinite(f.score) && f.score < 0.5).length;
  // width of the CN segment behind each deletion / amplification in its carriers (patient page only: needs the loaded CN rows)
  const cn = useSelector((state) => state.SingleCell.cn);
  const noiseOf = useMemo(() => {
    const m = new Map();
    if (!interactive || cn.status !== "ok") return m;
    [...report.clonal, ...report.subclonal, ...report.rare]
      .filter((d) => d.class === "homdel" || d.class === "amp")
      .forEach((d) => m.set(d.label, segmentNoise(cn.data, { globalPosition: eventGlobalPosition(d.event, chromoBins), carriers: `${d.event.cell_ids || ""}`.split(",").filter(Boolean) })));
    return m;
  }, [interactive, cn, report, chromoBins]);
  const pct = d3.format(".0%");

  const onSelect = (d) => dispatch(singleCellActions.updateSelection(`${d.event.cell_ids || ""}`.split(",").filter(Boolean)));
  const onZoom = (d) => {
    const loc = d.event.Genome_Location || `${d.event.seqnames}:${d.event.start}-${d.event.end}`;
    try {
      const domains = padDomains(locationToDomains(chromoBins, loc, { clampRanges: true }), 2.5e5, genomeLength);
      if (domains) {
        dispatch(settingsActions.updateDomains(domains));
        dispatch(settingsActions.updateTab("7"));
      }
    } catch (error) {
      // bad coordinates: nothing to zoom to
    }
  };
  const onIgv = (d) => {
    const carriers = `${d.event.cell_ids || ""}`.split(",").filter(Boolean).slice(0, 6);
    // fusions: first breakpoint from fusion_gene_coords ("12:53097436-53102345+,...")
    const bps = d.class === "fusion" ? `${d.event.fusion_gene_coords || ""}`.split(",").map((s) => s.match(/^(\w+):(\d+)/)).filter(Boolean).map((m) => ({ chromosome: m[1], position: Number(m[2]) })) : [];
    const chromosome = bps.length ? bps[0].chromosome : `${d.event.seqnames}`;
    const position = bps.length ? bps[0].position : Number(d.event.start);
    if (!carriers.length || !Number.isFinite(position)) return;
    dispatch(singleCellActions.openIgv({ cellIds: carriers, chromosome, position, loci: bps.length > 1 ? bps : undefined, label: d.label }));
    dispatch(settingsActions.updateTab("7"));
  };
  const onSites = (d) => {
    const id = eventSnvSiteId(d.event);
    if (id) {
      dispatch(singleCellActions.updateLayout({ snvSiteIds: [id] }));
      dispatch(settingsActions.updateTab("7"));
    }
  };
  // the same popup as a row of the Filtered Events table (alteration, plots with cell tracks, variant QC)
  const onDetails = (d) => dispatch(filteredEventsActions.selectFilteredEvent(d.event, "plots"));
  const rowProps = { cloneColors, interactive, onSelect, onZoom, onIgv, onSites, onDetails };
  const row = (d) => <DriverRow key={d.label} d={d} fit={fitOf.get(d.label)} noise={noiseOf.get(d.label)} {...rowProps} />;
  const allDrivers = [...report.clonal, ...report.subclonal, ...report.rare];
  const text = (v) => (v == null || v === "" || v === "None" ? null : `${v}`.replace(/<[^>]+>/g, ""));
  const driverColumns = [
    { title: t("components.single-cell.report.col-alteration"), dataIndex: "label", key: "label", render: (v, d) => <Space size={4}><span style={{ width: 8, height: 8, borderRadius: 2, background: CLASS_COLORS[d.class], display: "inline-block" }} />{v}</Space> },
    { title: "Tier", dataIndex: "tier", key: "tier", width: 60 },
    { title: t("components.single-cell.report.col-role"), dataIndex: "role", key: "role", width: 140, render: (v) => v || "–" },
    { title: t("components.single-cell.report.col-cells"), dataIndex: "cells", key: "cells", width: 90, sorter: (a, b) => a.fraction - b.fraction, defaultSortOrder: "descend" },
    { title: t("components.single-cell.report.col-clonality"), dataIndex: "clonality", key: "clonality", width: 100, render: (v) => <Tag color={v === "clonal" ? "green" : v === "subclonal" ? "orange" : "default"}>{v}</Tag> },
    { title: t("components.single-cell.events.clade-score"), key: "fit", width: 90, sorter: (a, b) => (fitOf.get(a.label)?.score || 0) - (fitOf.get(b.label)?.score || 0), render: (_, d) => { const f = fitOf.get(d.label); return f && Number.isFinite(f.score) ? <span style={{ color: f.score < 0.5 ? "#cf1322" : f.score >= 0.8 ? "#237804" : undefined }}>{f.score.toFixed(2)}</span> : "–"; } },
    { title: t("components.single-cell.report.col-clones"), key: "clones", render: (_, d) => Object.entries(d.fractions).filter(([, f]) => f.n > 0).sort((a, b) => b[1].fraction - a[1].fraction).map(([c, f]) => <ColorTag key={c} color={cloneColors[c]}>{`${c} ${f.n}/${f.size}`}</ColorTag>) },
  ];
  const expanded = (d) => {
    const e = d.event;
    const items = [
      ["Variant", text(e.Variant)],
      ["Genomic", text(e.Variant_g) || text(e.Genome_Location)],
      ["Effect", text(e.effect)],
      ["VAF (pooled)", Number.isFinite(Number(e.VAF)) ? Number(e.VAF).toFixed(3) : null],
      ["Alt / ref reads", e.alt != null && e.ref != null && (Number(e.alt) || Number(e.ref)) ? `${e.alt} / ${e.ref}` : null],
      ["Copies", text(e.estimated_altered_copies)],
      ["Fusion CN", text(e.fusion_cn)],
    ].filter(([, v]) => v);
    return (
      <Space direction="vertical" size={6} style={{ width: "100%" }}>
        <Descriptions size="small" column={3} colon={false}>
          {items.map(([k, v]) => <Descriptions.Item key={k} label={k}>{v}</Descriptions.Item>)}
        </Descriptions>
        {text(e.effect_description) && <Paragraph style={{ marginBottom: 4 }}><Text strong>Effect: </Text>{text(e.effect_description)}</Paragraph>}
        {text(e.variant_summary) && <Paragraph style={{ marginBottom: 4 }}>{text(e.variant_summary)}</Paragraph>}
        {text(e.gene_summary) && <Paragraph type="secondary" style={{ marginBottom: 4 }}>{text(e.gene_summary)}</Paragraph>}
        {text(e.therapeutics) && <Paragraph style={{ marginBottom: 4 }}><Text strong>Therapeutics: </Text>{text(e.therapeutics)}</Paragraph>}
        {text(e.prognoses) && <Paragraph style={{ marginBottom: 4 }}><Text strong>Prognosis: </Text>{text(e.prognoses)}</Paragraph>}
        <Paragraph style={{ marginBottom: 0 }}>
          <Text strong>{t("components.single-cell.report.col-cells")}: </Text>
          <Text type="secondary" style={{ fontSize: 13 }}>{`${e.cell_ids || ""}`.split(",").filter(Boolean).join(", ")}</Text>
        </Paragraph>
        {interactive && (
          <Space>
            <Button size="small" onClick={() => onDetails(d)}>{t("components.single-cell.report.details")}</Button>
            <Button size="small" onClick={() => onSelect(d)}>{t("components.single-cell.report.select-cells")}</Button>
            <Button size="small" onClick={() => onZoom(d)}>{t("components.single-cell.report.zoom")}</Button>
            {!["amp", "homdel"].includes(d.class) && <Button size="small" onClick={() => onIgv(d)}>{d.class === "fusion" ? t("components.single-cell.report.igv-fusion") : t("components.single-cell.report.igv")}</Button>}
          </Space>
        )}
      </Space>
    );
  };

  if (!events && !cells?.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />;

  const summary = [
    t("components.single-cell.report.summary-cells", { tumor: report.nTumorCells, normal: report.nNormalCells, count: report.clones.length }),
    report.clonal.length
      ? t("components.single-cell.report.summary-clonal", { list: report.clonal.slice(0, 4).map((d) => d.label).join(", ") })
      : t("components.single-cell.report.summary-no-clonal"),
    report.subclonal.length ? t("components.single-cell.report.summary-subclonal", { count: report.subclonal.length }) : null,
    report.signatures.all.length ? t("components.single-cell.report.summary-signatures", { list: report.signatures.all.slice(0, 3).map((s) => `${s.signature} ${pct(s.share)}`).join(", ") }) : null,
    rnaSummarySentence(rnaState.data, t),
  ].filter(Boolean);
  const driverGenes = new Set(allDrivers.flatMap((d) => `${d.gene || ""}`.split("::")));
  // long clone lists (one- and two-cell clones of a deep tree) fold behind a link
  const hiddenClones = allClones ? [] : report.clones.filter((c, i) => i >= MIN_CLONES_SHOWN && c.size < SMALL_CLONE);
  const hasBurden = report.burden.truncal + report.burden.subclonal + report.burden.private + report.snvDrivers.length > 0;

  return (
    <Card
      size="small"
      title={
        <Space>
          <FileSearchOutlined />
          {t("components.single-cell.report.title", { patient })}<Provenance id="keyFindings" />
          {onOpen && (
            <Button size="small" type="link" onClick={onOpen}>
              {t("components.single-cell.cohort.open")}
            </Button>
          )}
        </Space>
      }
    >
      <Paragraph style={{ fontSize: 13.5, marginBottom: 6 }}>{summary.join(" ")}</Paragraph>
      <Row gutter={SC_GUTTER}>
        <Col xs={24} lg={14}>
          <Title level={5} className="sc-section-title">{t("components.single-cell.report.clonal-title", { count: report.clonal.length })} <HintLine inline text={t("components.single-cell.report.clonal-help", { pct: pct(0.85) })} /></Title>
          {report.clonal.length ? report.clonal.map(row) : <Text type="secondary" className="sc-none">{t("components.single-cell.report.none")}</Text>}
          <Title level={5} className="sc-section-title">{t("components.single-cell.report.subclonal-title", { count: report.subclonal.length })} <HintLine inline text={t("components.single-cell.report.subclonal-help")} /></Title>
          {report.subclonal.length ? report.subclonal.map(row) : <Text type="secondary" className="sc-none">{t("components.single-cell.report.none")}</Text>}
          {report.rare.length > 0 && (
            <Text type="secondary" style={{ display: "block", marginTop: 8 }}>
              {t("components.single-cell.report.rare", { count: report.rare.length, list: report.rare.slice(0, 6).map((d) => `${d.label} (${d.cells})`).join("; ") })}
            </Text>
          )}
        </Col>
        <Col xs={24} lg={10}>
          <Title level={5} className="sc-section-title">{t("components.single-cell.report.clones-title")}</Title>
          {(allClones ? report.clones : report.clones.filter((c, i) => i < MIN_CLONES_SHOWN || c.size >= SMALL_CLONE)).map((c) => (
            <div key={c.clone} style={{ marginBottom: 8 }}>
              <Space size={6} wrap>
                <ColorTag color={cloneColors[c.clone]}>{c.clone}</ColorTag>
                <Text>{t("components.single-cell.report.clone-size", { count: c.size, pct: pct(c.fraction) })}</Text>
                {interactive && (
                  <Button size="small" type="link" style={{ padding: 0 }} onClick={() => dispatch(singleCellActions.updateSelection((cells || []).filter((x) => `${x.clone_id}` === c.clone).map((x) => x.cell_id)))}>
                    {t("components.single-cell.report.select-clone")}
                  </Button>
                )}
              </Space>
              <div style={{ paddingLeft: 8 }}>
                {c.defining.length ? (
                  <Text>{t("components.single-cell.report.clone-defining", { list: c.defining.map((d) => d.label).join(", ") })}</Text>
                ) : (
                  <Text type="secondary">{t("components.single-cell.report.clone-no-defining")}</Text>
                )}
                {c.carried.length > 0 && <div><Text type="secondary">{t("components.single-cell.report.clone-carried", { list: c.carried.map((d) => d.label).join(", ") })}</Text></div>}
                <CloneRnaLine findings={rnaState.data} clone={c.clone} />
              </div>
            </div>
          ))}
          {hiddenClones.length > 0 && (
            <Button size="small" type="link" style={{ padding: 0, marginBottom: 8 }} onClick={() => setAllClones(true)}>
              {t("components.single-cell.report.more-small-clones", { count: hiddenClones.length, cells: d3.sum(hiddenClones, (c) => c.size) })}
            </Button>
          )}
          <Title level={5} className="sc-section-title">{t("components.single-cell.report.burden-title")} <Provenance id="burden" /></Title>
          {hasBurden ? (
            <Space size="large" wrap>
              <Statistic title={t("components.single-cell.snv.category-truncal")} value={report.burden.truncal} />
              <Statistic title={t("components.single-cell.snv.category-subclonal")} value={report.burden.subclonal} />
              <Statistic title={t("components.single-cell.snv.category-private")} value={report.burden.private} />
              <Statistic title={t("components.single-cell.report.snv-drivers")} value={report.snvDrivers.length} />
            </Space>
          ) : (
            <Text type="secondary" className="sc-none">{t("components.single-cell.report.no-burden")}</Text>
          )}
          {report.signatures.all.length > 0 && (
            <>
              <Title level={5} className="sc-section-title">{t("components.single-cell.report.signatures-title")}</Title>
              <Descriptions size="small" column={1} colon={false}>
                <Descriptions.Item label={report.signatures.n != null ? t("components.single-cell.report.sig-all", { n: report.signatures.n }) : t("components.single-cell.report.sig-all-plain")}><SignatureBar items={report.signatures.all} /></Descriptions.Item>
                {report.signatures.truncal.length > 0 && <Descriptions.Item label={t("components.single-cell.snv.category-truncal")}><SignatureBar items={report.signatures.truncal} /></Descriptions.Item>}
                {report.signatures.subclonal.length > 0 && <Descriptions.Item label={t("components.single-cell.snv.category-subclonal")}><SignatureBar items={report.signatures.subclonal} /></Descriptions.Item>}
              </Descriptions>
            </>
          )}
          {report.signatures.emerging.length > 0 && (
            <Alert
              type="info"
              showIcon
              message={t("components.single-cell.report.emerging", { list: report.signatures.emerging.map((s) => `${s.signature} (${pct(s.share)}${aetiology(s.signature) ? `, ${aetiology(s.signature)}` : ""})`).join("; ") })}
            />
          )}
          {rnaState.status !== "none" && (
            <>
              <Title level={5} className="sc-section-title">{t("components.single-cell.rna-findings.title")} <HintLine inline text={t("components.single-cell.rna-findings.help")} /> <Provenance id="rnaFindings" /></Title>
              <RnaFindingsList findings={rnaState.data} status={rnaState.status} cloneColors={cloneColors} driverGenes={driverGenes} />
            </>
          )}
        </Col>
        {interactive && allDrivers.length > 0 && (
          <Col span={24}>
            <DriverCellMatrix drivers={allDrivers} />
          </Col>
        )}
        {interactive && (
          <Col span={24}>
            <ReportFindings report={report} cloneColors={cloneColors} />
          </Col>
        )}
        <Col span={24}>
          <Collapse
            size="small"
            items={[
              {
                key: "table",
                label: t("components.single-cell.report.table-title", { count: allDrivers.length }),
                children: (
                  <Table
                    size="small"
                    rowKey="label"
                    columns={driverColumns}
                    dataSource={allDrivers}
                    pagination={{ pageSize: 15, size: "small" }}
                    expandable={{ expandedRowRender: expanded }}
                  />
                ),
              },
            ]}
          />
        </Col>
        {(report.caveats.length > 0 || lowFit > 0) && (
          <Col span={24}>
            <Alert
              type="warning"
              showIcon
              message={t("components.single-cell.report.caveats")}
              description={[...report.caveats.map((c) => t(`components.single-cell.report.caveat-${c}`)), ...(lowFit > 0 ? [t("components.single-cell.report.caveat-low-fit", { count: lowFit })] : [])].join(" ")}
            />
          </Col>
        )}
      </Row>
    </Card>
  );
}
