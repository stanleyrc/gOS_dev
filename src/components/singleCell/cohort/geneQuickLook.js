import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { Button, Popover, Skeleton, Space, Tag, Tooltip, Typography } from "antd";
import { geneReadQcMap, readQcText } from "../../../helpers/singleCell/geneReadQc";
import { InfoCircleOutlined } from "@ant-design/icons";
import GeneInfoCard from "../rna/geneInfoCard";
import ExternalLinksRow from "../externalLinksRow";
import useCohortExport from "./useCohortExport";
import { ONCOKB_URL, covariateHits, driverEventsForGene, patientEventsForGene, parseBiomarkerDrugs, parseCuratedGenes, tmbHits } from "../../../helpers/singleCell/geneQuickLook";
import { fmtP } from "../../../helpers/singleCell/tmbAssoc";

const { Text, Link, Paragraph } = Typography;

/**
 * Provided by the cohort panel: { dataset, summaries, files, actions: { expression, cnexpr, events, covde } }.
 * Without a provider a gene name stays plain text.
 */
export const GeneQuickLookContext = createContext(null);

const cache = new Map();
const loadText = (url) => {
  if (!cache.has(url)) {
    const p = fetch(url).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${r.status}`))));
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return cache.get(url);
};

/** OncoKB tables the build stages under common/ (null = not available). */
function useOncoKbTables(commonPath) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let live = true;
    const get = (file, parse) => loadText(`${commonPath}${file}`).then(parse).then((v) => (v ? { ok: v } : { err: `${commonPath}${file} is not a valid table` })).catch((e) => ({ err: `${commonPath}${file} could not be read (${e.message})` }));
    Promise.all([get("all_curated_genes.tsv", parseCuratedGenes), get("oncokb_biomarker_drug_associations.tsv", parseBiomarkerDrugs)]).then(([genes, drugs]) => live && setState({ genes, drugs }));
    return () => {
      live = false;
    };
  }, [commonPath]);
  return state;
}


/** Deep link into a patient tab: ?report=<P>&tab=<n>[&evsite=...]. */
function patientHref(patient, tab, extra = {}) {
  if (typeof window === "undefined") return "#";
  const url = new URL(window.location.href);
  ["scview", "evsite", "evview"].forEach((k) => url.searchParams.delete(k));
  url.searchParams.set("report", patient);
  url.searchParams.set("tab", `${tab}`);
  Object.entries(extra).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.toString();
}

/** { status, doc, map } of the gene-level read-QC verdicts (cohort subclonal_drivers.json). */
export function useGeneReadQc(datasetProp = null) {
  const ctx = useContext(GeneQuickLookContext);
  const settingsDataset = useSelector((s) => s.Settings?.dataset);
  const dataset = datasetProp || ctx?.dataset || settingsDataset;
  const { status, data } = useCohortExport(dataset?.dataPath ? dataset : null, "subclonal_drivers.json");
  const map = useMemo(() => geneReadQcMap(data), [data]);
  return { status, doc: data, map };
}

/** Red "read-QC flagged" tag for a gene whose subclonal driver hits are all read-level artefacts; nothing otherwise. */
export function ReadQcBadge({ gene, dataset = null, partial = false }) {
  const { map } = useGeneReadQc(dataset);
  const g = map.get(gene);
  if (!g || !(g.allFlagged || (partial && g.nFlagged))) return null;
  return (
    <Tooltip title={readQcText(g)}>
      <Tag color="volcano" style={{ margin: 0, cursor: "help" }}>{g.allFlagged ? "read-QC flagged" : "some sites read-QC flagged"}</Tag>
    </Tooltip>
  );
}

function ReadQcSection({ gene }) {
  const { doc, map } = useGeneReadQc();
  const ctx = useContext(GeneQuickLookContext);
  const g = map.get(gene);
  if (!doc || !g || !g.nFlagged) return null;
  const hits = (doc.hits || []).filter((h) => h.gene === gene && h.read_qc?.flags?.length);
  return section(
    "Read-level QC",
    <div style={{ fontSize: 12 }}>
      <Tag color="volcano">{g.allFlagged ? "read-QC flagged" : `${g.nFlagged} of ${g.nHits} hits flagged`}</Tag>
      <div style={{ margin: "4px 0" }}>{readQcText(g)}</div>
      <Space size={[6, 2]} wrap>
        {hits.slice(0, 8).map((h) => <a key={`${h.patient}${h.site}`} href={patientHref(h.patient, 15, { evsite: h.site })} target="_blank" rel="noreferrer">{`${h.patient} ${h.site} evidence`}</a>)}
        {ctx?.actions?.subclonal && <a onClick={() => ctx.actions.subclonal(gene)}>Subclonal view</a>}
      </Space>
    </div>
  );
}

/** Compact hover summary: role, QC verdict, cohort counts, click hint. */
function GeneHoverCard({ gene }) {
  const ctx = useContext(GeneQuickLookContext);
  const events = useSelector((s) => s.FilteredEvents?.originalFilteredEvents || s.FilteredEvents?.filteredEvents || []);
  const commonPath = useSelector((s) => s.Settings?.dataset?.commonPath) || "common/";
  const tables = useOncoKbTables(commonPath);
  const curated = tables.genes?.ok?.get(gene);
  const cohortEvents = useMemo(() => (ctx ? driverEventsForGene(ctx.summaries, ctx.files, gene) : patientEventsForGene(events, gene)), [ctx, events, gene]);
  const nPatients = new Set(cohortEvents.map((e) => e.patient).filter(Boolean)).size;
  return (
    <div style={{ fontSize: 12, maxWidth: 340 }}>
      <Text strong style={{ color: "inherit" }}>{gene}</Text>{" "}
      {curated?.oncogene && <Tag color="volcano" style={{ margin: 0 }}>oncogene</Tag>}
      {curated?.tsg && <Tag color="geekblue" style={{ margin: 0 }}>tumor suppressor</Tag>}
      {tables.loading ? null : !curated && <span style={{ opacity: 0.7 }}> not in OncoKB curated genes</span>}
      {curated?.summary && <div style={{ marginTop: 4, opacity: 0.9 }}>{curated.summary.length > 220 ? `${curated.summary.slice(0, 220)}...` : curated.summary}</div>}
      <div style={{ marginTop: 4 }}>{ctx ? (cohortEvents.length ? `${cohortEvents.length} filtered events in ${nPatients} patients` : "No filtered event in this cohort") : (cohortEvents.length ? `${cohortEvents.length} filtered events in this patient` : "No filtered event in this patient")}</div>
      <ReadQcBadge gene={gene} partial />
      <div style={{ marginTop: 4, opacity: 0.7 }}>Click for the full gene card</div>
    </div>
  );
}

const NA = ({ why }) => <Text type="secondary">{`not available (${why})`}</Text>;
const section = (title, body) => (
  <div style={{ marginBottom: 10 }}>
    <Text strong style={{ display: "block", marginBottom: 2 }}>{title}</Text>
    {body}
  </div>
);

function OncoKbSection({ gene, tables }) {
  if (tables.loading) return <Skeleton active paragraph={{ rows: 1 }} title={false} />;
  const curated = tables.genes?.ok?.get(gene);
  const drugs = tables.drugs?.ok?.get(gene) || [];
  return (
    <>
      {tables.genes?.err ? <NA why={tables.genes.err} /> : curated ? (
        <>
          <Space size={[4, 4]} wrap>
            {curated.oncogene && <Tag color="volcano">OncoKB oncogene</Tag>}
            {curated.tsg && <Tag color="geekblue">OncoKB tumor suppressor</Tag>}
            {!curated.oncogene && !curated.tsg && <Tag>OncoKB curated gene</Tag>}
            {curated.sensitivity && <Tag color="green">highest sensitivity level {curated.sensitivity}</Tag>}
            {curated.resistance && <Tag color="red">resistance {curated.resistance}</Tag>}
          </Space>
          {curated.summary && <Paragraph style={{ margin: "4px 0 0", fontSize: 12 }} ellipsis={{ rows: 3, expandable: true, symbol: "more" }}>{curated.summary}</Paragraph>}
        </>
      ) : <Text type="secondary">Not in the OncoKB curated gene table.</Text>}
      {tables.drugs?.err ? <div><NA why={tables.drugs.err} /></div> : drugs.length ? (
        <div style={{ marginTop: 4, fontSize: 12 }}>
          {drugs.slice(0, 4).map((d) => (
            <div key={`${d.level}${d.alteration}${d.cancer}`}><Tag color="green" style={{ marginRight: 4 }}>{d.level}</Tag>{`${d.alteration} (${d.cancer}): ${d.drugs.join(", ")}`}</div>
          ))}
          {drugs.length > 4 && <Text type="secondary">{`+ ${drugs.length - 4} more on oncokb.org`}</Text>}
        </div>
      ) : tables.genes?.ok && <div style={{ fontSize: 12 }}><Text type="secondary">No drug-level (1-4, R1-R2) associations for this gene in the OncoKB table.</Text></div>}
      <Link href={ONCOKB_URL(gene)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>{`${gene} on oncokb.org`}</Link>
    </>
  );
}

function CohortSection({ gene, ctx }) {
  const de = useCohortExport(ctx.dataset, "rna_covariate_de.json");
  const tmb = useCohortExport(ctx.dataset, "tmb_associations.json");
  const events = useMemo(() => driverEventsForGene(ctx.summaries, ctx.files, gene), [ctx.summaries, ctx.files, gene]);
  const hits = useMemo(() => covariateHits(de.data, gene), [de.data, gene]);
  const tm = useMemo(() => tmbHits(tmb.data, gene), [tmb.data, gene]);
  const tmbMain = tm.find((t) => t.key === "subclonal|qc_clone_region") || tm[0];
  return (
    <>
      {section("Cohort events (filtered.events)", events.length ? (
        <Space size={[4, 4]} wrap>
          {events.slice(0, 14).map((e, i) => <Tooltip key={i} title={`${e.label} ${e.variant} · tier ${e.tier ?? "none"} · ${Math.round(100 * e.fraction)}% of tumor cells`}><Tag style={{ margin: 0 }} color={e.tier <= 1 ? "volcano" : "default"}>{`${e.patient} ${e.cls}`}</Tag></Tooltip>)}
          {events.length > 14 && <Text type="secondary">{`+${events.length - 14}`}</Text>}
        </Space>
      ) : <Text type="secondary">No filtered event names this gene in any patient.</Text>)}
      {section("Covariate DE (q < 0.05 among each test's top genes)", de.status === "loading" ? <Skeleton active paragraph={false} /> : !de.data ? <NA why="_cohort/rna_covariate_de.json not exported" /> : hits.length ? (
        <div style={{ fontSize: 12 }}>
          {hits.slice(0, 5).map((h) => <div key={h.id}>{`${h.label}: log2FC ${h.lfc > 0 ? "+" : ""}${h.lfc.toFixed(2)}, ${h.nConcordant}/${h.nPatients} patients same sign${h.robust ? " (robust)" : ""}`}</div>)}
          {hits.length > 5 && <Text type="secondary">{`+ ${hits.length - 5} more tests`}</Text>}
        </div>
      ) : <Text type="secondary">Not among the top genes of any covariate test.</Text>)}
      {section("TMB association (partial Spearman)", tmb.status === "loading" ? <Skeleton active paragraph={false} /> : !tmb.data ? <NA why="_cohort/tmb_associations.json not exported" /> : tmbMain ? (
        <div style={{ fontSize: 12 }}>
          <div>{`${tmbMain.measure} TMB: mean rho ${tmbMain.meanR.toFixed(2)}, q ${fmtP(tmbMain.q)}, ${tmbMain.nConcordant}/${tmbMain.nPatients} same sign`}</div>
          <Space size={[2, 2]} wrap>{Object.entries(tmbMain.per).map(([p, v]) => <Tag key={p} style={{ margin: 0 }} color={v > 0 ? "red" : "blue"}>{`${p} ${v > 0 ? "+" : ""}${v.toFixed(2)}`}</Tag>)}</Space>
        </div>
      ) : <Text type="secondary">Not in the exported TMB gene tables (top genes only).</Text>)}
    </>
  );
}

/** Patient pages (no cohort provider): this patient's filtered events naming the gene. */
function PatientSection({ gene }) {
  const events = useSelector((s) => s.FilteredEvents?.originalFilteredEvents || s.FilteredEvents?.filteredEvents || []);
  const report = useSelector((s) => s.Settings?.report);
  const hits = useMemo(() => patientEventsForGene(events, gene), [events, gene]);
  return section(`${report || "This patient"}: filtered events`, hits.length ? (
    <Space size={[4, 4]} wrap>
      {hits.slice(0, 14).map((e, i) => <Tooltip key={i} title={`${e.label} ${e.variant} · tier ${e.tier ?? "none"}${e.fraction ? ` · ${Math.round(100 * e.fraction)}% of tumor cells` : ""}`}><Tag style={{ margin: 0 }} color={e.tier <= 1 ? "volcano" : "default"}>{`${e.cls} ${e.variant}`.trim()}</Tag></Tooltip>)}
    </Space>
  ) : <Text type="secondary">No filtered event in this patient names this gene.</Text>);
}

export function GeneQuickLookBody({ gene, onClose }) {
  const ctx = useContext(GeneQuickLookContext);
  const commonPath = useSelector((s) => s.Settings?.dataset?.commonPath) || "common/";
  const tables = useOncoKbTables(commonPath);
  const go = (fn) => () => {
    onClose?.();
    fn?.(gene);
  };
  const a = ctx?.actions || {};
  return (
    <div style={{ width: 440, maxHeight: "70vh", overflowY: "auto" }} className="sc-gene-quicklook" onClick={(e) => e.stopPropagation()}>
      <Space size={[4, 4]} wrap style={{ marginBottom: 8 }}>
        <Text type="secondary">Open in depth:</Text>
        {a.expression && <Button size="small" onClick={go(a.expression)}>RNA expression</Button>}
        {a.cnexpr && <Button size="small" onClick={go(a.cnexpr)}>CN vs expression</Button>}
        {a.events && <Button size="small" onClick={go(a.events)}>All events</Button>}
        {a.covde && <Button size="small" onClick={go(a.covde)}>Covariate DE</Button>}
      </Space>
      {section("OncoKB", <OncoKbSection gene={gene} tables={tables} />)}
      {section("Elsewhere", <ExternalLinksRow gene={gene} />)}
      <ReadQcSection gene={gene} />
      {ctx ? <CohortSection gene={gene} ctx={ctx} /> : <PatientSection gene={gene} />}
      <GeneInfoCard gene={gene} />
    </div>
  );
}

/** A gene name that opens the quick look (gene card + OncoKB + what the cohort knows) on click. */
export default function GeneQuickLook({ gene, children = null, icon = false, style, standalone = false }) {
  const ctx = useContext(GeneQuickLookContext);
  const [open, setOpen] = useState(false);
  if (!gene) return null;
  // standalone: patient pages, without the cohort provider (OncoKB, this patient's events, gene card)
  if (!ctx && !standalone) return children || <span>{gene}</span>;
  const label = children || gene;
  return (
    <Popover trigger="click" open={open} onOpenChange={setOpen} destroyTooltipOnHide placement="rightTop" content={<GeneQuickLookBody gene={gene} onClose={() => setOpen(false)} />}>
      {icon ? <InfoCircleOutlined onClick={(e) => e.stopPropagation()} style={{ cursor: "pointer", color: "#1677ff", marginLeft: 4, ...style }} title={`${gene}: gene card, OncoKB, cohort evidence`} /> : <Tooltip title={open ? null : <GeneHoverCard gene={gene} />} mouseEnterDelay={0.35} color="#fff" overlayInnerStyle={{ color: "#262626" }}><a style={style} onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>{label}</a></Tooltip>}
    </Popover>
  );
}

/** SVG variant: a <text> gene label that opens the quick look. Extra props go to <text>. */
export function GeneQuickLookText({ gene, label = null, standalone = false, ...textProps }) {
  const ctx = useContext(GeneQuickLookContext);
  const [open, setOpen] = useState(false);
  const text = label || gene;
  if (!ctx && !standalone) return <text {...textProps}>{text}</text>;
  return (
    <Tooltip title={open ? null : <GeneHoverCard gene={gene} />} mouseEnterDelay={0.35} color="#fff" overlayInnerStyle={{ color: "#262626" }}>
      <Popover trigger="click" open={open} onOpenChange={setOpen} destroyTooltipOnHide placement="rightTop" content={<GeneQuickLookBody gene={gene} onClose={() => setOpen(false)} />}>
        <text {...textProps} style={{ cursor: "pointer", textDecoration: "underline dotted", ...(textProps.style || {}) }}>{text}</text>
      </Popover>
    </Tooltip>
  );
}
