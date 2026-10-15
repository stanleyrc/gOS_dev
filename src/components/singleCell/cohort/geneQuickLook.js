import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { Button, Popover, Skeleton, Space, Tag, Tooltip, Typography } from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";
import GeneInfoCard from "../rna/geneInfoCard";
import useCohortExport from "./useCohortExport";
import { ONCOKB_URL, covariateHits, driverEventsForGene, parseBiomarkerDrugs, parseCuratedGenes, tmbHits } from "../../../helpers/singleCell/geneQuickLook";
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
          {events.slice(0, 14).map((e, i) => <Tooltip key={i} title={`${e.label} ${e.variant} · tier ${e.tier} · ${Math.round(100 * e.fraction)}% of tumor cells`}><Tag style={{ margin: 0 }} color={e.tier <= 1 ? "volcano" : "default"}>{`${e.patient} ${e.cls}`}</Tag></Tooltip>)}
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
      {ctx && <CohortSection gene={gene} ctx={ctx} />}
      <GeneInfoCard gene={gene} />
    </div>
  );
}

/** A gene name that opens the quick look (gene card + OncoKB + what the cohort knows) on click. */
export default function GeneQuickLook({ gene, children = null, icon = false, style }) {
  const ctx = useContext(GeneQuickLookContext);
  const [open, setOpen] = useState(false);
  if (!gene) return null;
  if (!ctx) return children || <span>{gene}</span>;
  const label = children || gene;
  return (
    <Popover trigger="click" open={open} onOpenChange={setOpen} destroyTooltipOnHide placement="rightTop" content={<GeneQuickLookBody gene={gene} onClose={() => setOpen(false)} />}>
      {icon ? <InfoCircleOutlined onClick={(e) => e.stopPropagation()} style={{ cursor: "pointer", color: "#1677ff", marginLeft: 4, ...style }} title={`${gene}: gene card, OncoKB, cohort evidence`} /> : <a style={style} onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>{label}</a>}
    </Popover>
  );
}

/** SVG variant: a <text> gene label that opens the quick look. Extra props go to <text>. */
export function GeneQuickLookText({ gene, label = null, ...textProps }) {
  const ctx = useContext(GeneQuickLookContext);
  const [open, setOpen] = useState(false);
  const text = label || gene;
  if (!ctx) return <text {...textProps}>{text}</text>;
  return (
    <Popover trigger="click" open={open} onOpenChange={setOpen} destroyTooltipOnHide placement="rightTop" content={<GeneQuickLookBody gene={gene} onClose={() => setOpen(false)} />}>
      <text {...textProps} style={{ cursor: "pointer", textDecoration: "underline dotted", ...(textProps.style || {}) }}>{text}</text>
    </Popover>
  );
}
