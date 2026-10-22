import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Popover, Space, Tag, Typography } from "antd";
import { gunzipText } from "../../helpers/singleCell/gzIndex";
import { GBM_GENES } from "../../helpers/singleCell/geneInfo";
import {
  GENE_SUMMARY_FILE,
  NOT_AVAILABLE,
  functionLine,
  geneBadges,
  geneInfoLinks,
  loadGeneSummaries,
  lookupGene,
  summarySnippet,
} from "../../helpers/singleCell/geneSummaries";

const { Text, Link } = Typography;

// one download per common path per session (the table is ~25k genes); a failure is kept so every
// gene name shows the same "not available (reason)" instead of re-requesting per row
const cache = new Map();
const load = (commonPath) => {
  if (!cache.has(commonPath)) {
    cache.set(commonPath, loadGeneSummaries(commonPath, { fetchImpl: (u) => fetch(u), gunzip: gunzipText }));
  }
  return cache.get(commonPath);
};

/** { map, error, loading } for common/gene_summaries.tsv, shared by every gene name on the page. */
export function useGeneSummaries() {
  const commonPath = useSelector((s) => s.Settings?.dataset?.commonPath) || "common/";
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let live = true;
    load(commonPath).then((res) => live && setState({ ...res, loading: false }));
    return () => {
      live = false;
    };
  }, [commonPath]);
  return state;
}

/** Popover body: symbol, name, badges, summary (first ~300 chars, "more"), source and links. */
export function GeneInfoContent({ gene, summaries }) {
  const [more, setMore] = useState(false);
  const rec = lookupGene(summaries.map, gene);
  const symbol = rec?.symbol || gene;
  const gbm = GBM_GENES[symbol];
  const snip = summarySnippet(rec?.summary, 300);
  return (
    <div style={{ maxWidth: 420, fontSize: 12 }} className="sc-gene-info-popover">
      <Space size={6} wrap style={{ marginBottom: 4 }}>
        <Text strong>{symbol}</Text>
        {rec?.name && <Text type="secondary">{rec.name}</Text>}
        {rec?.type && rec.type !== "protein-coding" && <Tag style={{ fontSize: 11 }}>{rec.type}</Tag>}
      </Space>
      <div style={{ marginBottom: 4 }}>
        {gbm && <Tag color={gbm.kind === "driver" ? "red" : "purple"} title={gbm.note} style={{ fontSize: 11 }}>{gbm.kind === "driver" ? "GBM driver" : "GBM marker"}</Tag>}
        {geneBadges(rec).map((b) => (
          <Tag key={b.key} color={b.color} title={b.title} style={{ fontSize: 11 }}>
            {b.label}
          </Tag>
        ))}
      </div>
      {summaries.loading ? (
        <Text type="secondary">Loading gene summary…</Text>
      ) : summaries.error ? (
        <Text type="secondary">{`Gene summary not available (${GENE_SUMMARY_FILE} could not be read: ${summaries.error})`}</Text>
      ) : rec?.summary ? (
        <div style={{ marginBottom: 4, lineHeight: 1.45 }}>
          {more ? rec.summary : snip.text}
          {snip.truncated && (
            <Link style={{ fontSize: 12, marginInlineStart: 4 }} onClick={(e) => { e.stopPropagation(); setMore((v) => !v); }}>
              {more ? "less" : "more"}
            </Link>
          )}
          <div>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {"Source: "}
              {rec.url ? <Link href={rec.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11 }}>{rec.source}</Link> : rec.source}
            </Text>
          </div>
        </div>
      ) : (
        <Text type="secondary">{rec ? `Summary ${NOT_AVAILABLE}` : `Summary not available (${gene} is not in the gene summary table)`}</Text>
      )}
      <Space size={10} wrap>
        {geneInfoLinks(symbol, rec).map((l) => (
          <Link key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11 }}>
            {l.label}
          </Link>
        ))}
      </Space>
    </div>
  );
}

/**
 * A gene symbol with its function on hover / click (OncoKB, NCBI RefSeq or UniProt summary,
 * OncoKB badges, GeneCards / NCBI / UniProt / OncoKB links). children replaces the shown text.
 * stopClick keeps a click on the name from also triggering a clickable parent row.
 */
export function GeneInfo({ gene, children, trigger = ["hover", "click"], stopClick = true, style }) {
  const summaries = useGeneSummaries();
  if (!gene) return children || null;
  return (
    <Popover content={<GeneInfoContent gene={gene} summaries={summaries} />} trigger={trigger} mouseEnterDelay={0.25} placement="right" destroyTooltipOnHide>
      <span
        className="sc-gene-info-name"
        style={{ borderBottom: "1px dotted currentColor", cursor: "help", ...style }}
        onClick={stopClick && trigger.includes("click") ? (e) => e.stopPropagation() : undefined}
      >
        {children || gene}
      </span>
    </Popover>
  );
}

/** One-line function snippet for a gene (secondary text), for table cells and finding lists. */
export function GeneFunctionLine({ gene, n = 120, style }) {
  const summaries = useGeneSummaries();
  if (!gene || summaries.loading) return null;
  if (summaries.error) return null; // the popover states the reason; no repeated message per row
  const rec = lookupGene(summaries.map, gene);
  const line = functionLine(rec, n);
  return (
    <Text type="secondary" style={{ fontSize: 11, display: "block", lineHeight: 1.3, ...style }} title={rec?.summary ? `${rec.source}: ${summarySnippet(rec.summary, 600).text}` : undefined}>
      {line || NOT_AVAILABLE}
    </Text>
  );
}

/** Gene name (with popover) and its one-line function underneath. */
export function GeneWithFunction({ gene, strong = false, n = 120, onClick, nameStyle }) {
  return (
    <div>
      <GeneInfo gene={gene} stopClick={!onClick} style={nameStyle}>
        {strong ? <Text strong onClick={onClick} style={nameStyle}>{gene}</Text> : <span onClick={onClick}>{gene}</span>}
      </GeneInfo>
      <GeneFunctionLine gene={gene} n={n} />
    </div>
  );
}

export default GeneInfo;
