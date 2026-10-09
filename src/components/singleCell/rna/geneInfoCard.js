import React, { useEffect, useState } from "react";
import { Card, Skeleton, Space, Tag, Tooltip, Typography } from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";
import { geneSetIndex, loadGmt } from "./geneSets";
import {
  GBM_GENES,
  gbmPrograms,
  geneLinks,
  gliomaQuery,
  parseCancerGeneList,
  parseMyGene,
  pubmedSearchUrl,
} from "../../../helpers/singleCell/geneInfo";

const { Text, Paragraph, Link } = Typography;
const fmt = (v, d = 2) => (v == null || !Number.isFinite(Number(v)) ? "–" : Number(v).toFixed(d));
const pct = (v) => (v == null ? "–" : `${Math.round(100 * Number(v))}%`);
const fmtQ = (p) => (p == null ? "–" : p < 1e-3 ? Number(p).toExponential(1) : Number(p).toFixed(3));

// one request per gene per session; failures are retried on the next open
const cache = new Map();
const once = (key, make) => {
  if (!cache.has(key)) {
    const p = make();
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return cache.get(key);
};
const getJson = (url) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))));

const MYGENE_FIELDS = "symbol,name,summary,alias,type_of_gene,entrezgene,genomic_pos";
const myGene = (gene) =>
  once(`mygene:${gene}`, async () => {
    const q = (expr) => getJson(`https://mygene.info/v3/query?q=${encodeURIComponent(expr)}&species=human&fields=${MYGENE_FIELDS}&size=1`);
    let res = await q(`symbol:${gene}`);
    if (!res.hits?.length) res = await q(`alias:${gene}`);
    return parseMyGene(res.hits?.[0]);
  });

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const gliomaPapers = (gene, aliases) =>
  once(`pubmed:${gene}`, async () => {
    const term = gliomaQuery(gene, aliases);
    const search = await getJson(`${EUTILS}/esearch.fcgi?db=pubmed&retmode=json&sort=relevance&retmax=3&term=${encodeURIComponent(term)}`);
    const ids = search.esearchresult?.idlist || [];
    const count = Number(search.esearchresult?.count) || 0;
    let papers = [];
    if (ids.length) {
      const sum = await getJson(`${EUTILS}/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(",")}`);
      papers = ids.map((id) => sum.result?.[id]).filter(Boolean).map((r) => ({ id: r.uid, title: r.title, year: `${r.pubdate || ""}`.slice(0, 4), journal: r.source }));
    }
    return { term, count, papers };
  });

const cancerGenes = () =>
  once("oncokb", () => fetch("https://www.oncokb.org/api/v1/utils/cancerGeneList.txt").then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${r.status}`)))).then(parseCancerGeneList));

const gliomaGmt = () =>
  once("gmt:glioma", async () => {
    const index = await geneSetIndex();
    const entries = Array.isArray(index) ? index : index?.collections || [];
    const entry = entries.find((e) => /3ca/i.test(`${e.file || ""}`));
    return entry ? loadGmt(entry.file) : [];
  });

/** Everything the card shows for one gene; each source settles on its own. */
function useGeneInfo(gene) {
  const [state, setState] = useState({});
  useEffect(() => {
    if (!gene) return undefined;
    let live = true;
    const set = (patch) => live && setState((s) => (s.gene === gene ? { ...s, ...patch } : s));
    setState({ gene, loading: true });
    myGene(gene)
      .then((info) => {
        set({ info, loading: false });
        return gliomaPapers(gene, info?.aliases || []);
      })
      .then((pubmed) => set({ pubmed }))
      .catch(() => set({ loading: false, failed: true }));
    cancerGenes().then((m) => set({ cancer: m.get(gene) || null })).catch(() => {});
    gliomaGmt().then((gmt) => set({ programs: gbmPrograms(gene, gmt) })).catch(() => set({ programs: gbmPrograms(gene) }));
    return () => {
      live = false;
    };
  }, [gene]);
  return state.gene === gene ? state : { gene, loading: true };
}

/**
 * What a gene does and whether it matters in GBM, for the gene last clicked
 * in the DE views: description (MyGene.info / NCBI), cancer-gene status
 * (OncoKB list, COSMIC CGC), curated GBM role, GBM cell-state programs, the
 * glioma literature (PubMed) and this comparison's numbers for the gene.
 */
export default function GeneInfoCard({ gene, row, labels, cn }) {
  const s = useGeneInfo(gene);
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [gene]);
  if (!gene) return null;
  const gbm = GBM_GENES[gene] || (s.info?.symbol && GBM_GENES[s.info.symbol]);
  const symbol = s.info?.symbol || gene;
  const [cn1, cn2] = cn || [];
  return (
    <Card
      size="small"
      className="sc-gene-info"
      title={
        <Space size={6} wrap>
          <InfoCircleOutlined />
          <Text strong>{gene}</Text>
          {s.info?.name && <Text type="secondary" style={{ fontWeight: 400 }}>{s.info.name}</Text>}
        </Space>
      }
      style={{ marginTop: 12 }}
    >
      <Space size={[4, 6]} wrap style={{ marginBottom: 8 }}>
        {gbm && (
          <Tooltip title={gbm.note}>
            <Tag color={gbm.kind === "driver" ? "red" : "purple"}>{gbm.kind === "driver" ? "GBM driver" : "GBM marker"}</Tag>
          </Tooltip>
        )}
        {s.cancer && (
          <Tooltip title={`OncoKB cancer gene list${s.cancer.cgc ? "; COSMIC Cancer Gene Census" : ""} (${s.cancer.sources} sources)`}>
            <Tag color="volcano">{s.cancer.type ? `Cancer gene: ${s.cancer.type}` : "Cancer gene"}</Tag>
          </Tooltip>
        )}
        {(s.programs || []).map((p) => (
          <Tooltip key={p} title="GBM cell-state program containing this gene">
            <Tag color="geekblue">{p}</Tag>
          </Tooltip>
        ))}
        {s.info?.type && s.info.type !== "protein-coding" && <Tag>{s.info.type}</Tag>}
        {s.info?.locus && <Text type="secondary" style={{ fontSize: 12 }}>{s.info.locus}</Text>}
      </Space>
      {gbm && <Paragraph style={{ marginBottom: 6 }}><Text strong>In GBM: </Text>{gbm.note}</Paragraph>}
      {row && (
        <Paragraph style={{ marginBottom: 6 }}>
          <Text strong>Here: </Text>
          {`log2FC ${fmt(row.avg_log2FC)} (${labels?.A || "A"} vs ${labels?.B || "B"}), expressed in ${pct(row.pct_1)} vs ${pct(row.pct_2)} of cells, q ${fmtQ(row.q_val)}`}
          {cn1 != null && cn2 != null && Number.isFinite(cn1) && Number.isFinite(cn2) && (
            <Text type={Math.abs(cn1 - cn2) >= 0.5 ? "warning" : "secondary"}>
              {` · copy number ${fmt(cn1, 1)} vs ${fmt(cn2, 1)}${Math.abs(cn1 - cn2) >= 0.5 ? " (expression may follow a copy-number change)" : ""}`}
            </Text>
          )}
        </Paragraph>
      )}
      {s.loading ? (
        <Skeleton active paragraph={{ rows: 2 }} title={false} />
      ) : s.failed ? (
        <Text type="secondary">Gene description unavailable (MyGene.info could not be reached).</Text>
      ) : s.info?.summary ? (
        <Paragraph style={{ marginBottom: 6 }} ellipsis={more ? false : { rows: 4, expandable: true, symbol: "more", onExpand: () => setMore(true) }}>
          {s.info.summary}
        </Paragraph>
      ) : (
        <Text type="secondary">No NCBI summary for this gene.</Text>
      )}
      {s.pubmed && (
        <div style={{ marginBottom: 6 }}>
          <Link href={pubmedSearchUrl(s.pubmed.term)} target="_blank" rel="noopener noreferrer" strong>
            {`${s.pubmed.count.toLocaleString()} glioma / GBM paper${s.pubmed.count === 1 ? "" : "s"} on PubMed`}
          </Link>
          {s.pubmed.papers.map((p) => (
            <div key={p.id} style={{ fontSize: 12, marginTop: 2 }}>
              <Link href={`https://pubmed.ncbi.nlm.nih.gov/${p.id}/`} target="_blank" rel="noopener noreferrer">{p.title}</Link>
              <Text type="secondary">{` ${p.journal} ${p.year}`}</Text>
            </div>
          ))}
        </div>
      )}
      <Space size={10} wrap>
        {geneLinks(symbol, s.info?.entrez).map((l) => (
          <Link key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>{l.label}</Link>
        ))}
      </Space>
    </Card>
  );
}
