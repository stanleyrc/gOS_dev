import React from "react";
import { useSelector } from "react-redux";
import { Alert, Space, Tag, Tooltip, Typography } from "antd";
import { ConfidenceBadge, useFindingConfidence } from "../confidenceToggle";
import { nearbySvText, contrastText, emptyMessage, readsText, transcriptLoci, igvUrl, transcriptsForJunctionIds, visibleTranscripts } from "../../../helpers/singleCell/breakpointRna";

const { Text } = Typography;

/** IGV links for the two breakpoint loci of a transcript (igv.org web app, new tab). */
export function LocusLinks({ transcript }) {
  const { a, b } = transcriptLoci(transcript);
  return (
    <Space size={6} wrap>
      {[a, b].map((l, i) =>
        l ? (
          <Tooltip key={i} title={`IGV at ${l}`}>
            <a href={igvUrl(l)} target="_blank" rel="noopener noreferrer" data-locus-link>
              {`IGV ${i === 0 ? "A" : "B"}`}
            </a>
          </Tooltip>
        ) : (
          <Text key={i} type="secondary">not available (no locus)</Text>
        )
      )}
    </Space>
  );
}

/** One transcript as a short card line: label, tier, contrast, frame, consequence, junctions. */
export function TranscriptLine({ t }) {
  return (
    <div style={{ marginBottom: 8 }} data-breakpoint-rna-row>
      <Space size={6} wrap>
        <Text strong>{t.label}</Text>
        <ConfidenceBadge item={{ confidence: t.confidence, confidence_reason: (t.confidence_reasons || []).join("; ") }} />
        {t.cls && <Tag>{t.cls}</Tag>}
        {t.stratum && <Tag color={t.stratum === "amplicon" ? "purple" : "default"}>{t.stratum}</Tag>}
        {t.frame && <Tag>{t.frame}</Tag>}
      </Space>
      <div>
        <Text>{contrastText(t)}</Text>
        <Text type="secondary">{` · reads carriers / non-carriers: ${readsText(t)}`}</Text>
      </div>
      {nearbySvText(t).length > 0 && <div><Text type="secondary">Nearby genomic SV (DNA evidence): </Text>{nearbySvText(t).map((x, i) => <Tag key={i} color="blue">{x}</Tag>)}</div>}
      {t.consequence && <div><Text type="secondary">{t.consequence}</Text></div>}
      {t.rna_junctions?.length > 0 && (
        <div>
          <Text type="secondary">RNA junctions: </Text>
          {t.rna_junctions.map((j, i) => (
            <Tooltip key={i} title={`${j.source}${j.genes ? `; ${j.genes}` : ""}`}>
              <Tag>{`${j.junction} (${j.n_cells} cells)`}</Tag>
            </Tooltip>
          ))}
        </div>
      )}
      <LocusLinks transcript={t} />
    </div>
  );
}

/**
 * "RNA across this breakpoint" on a junction event's detail: transcripts of rna/breakpoint_transcripts.json whose jid is one of
 * the event's junction ids, at the shared less-confident level.
 */
export default function BreakpointRnaBlock({ junctionIds }) {
  const source = useSelector((s) => s.SingleCell.rnaBreakpoint);
  const [level] = useFindingConfidence();
  const all = source?.status === "ok" ? transcriptsForJunctionIds(source.data.transcripts, junctionIds, source.data.jidCoords) : [];
  const shown = visibleTranscripts(all, level);
  const msg = emptyMessage(source, shown.length, all.length);
  return (
    <div style={{ marginBottom: 10 }} data-breakpoint-rna-block>
      <Text strong>RNA across this breakpoint</Text>
      {msg ? (
        <Alert style={{ marginTop: 4 }} type="info" showIcon message={`RNA across this breakpoint: ${msg}`} />
      ) : (
        <div style={{ marginTop: 4 }}>{shown.map((t) => <TranscriptLine key={t.key} t={t} />)}</div>
      )}
    </div>
  );
}
