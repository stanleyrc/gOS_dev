import React, { useMemo, useState } from "react";
import { Alert, Card, Collapse, Input, InputNumber, Segmented, Select, Space, Tag, Tooltip, Typography } from "antd";
import { driverHref, linkClick } from "../../../helpers/singleCell/driverLink";
import { INK, TYPE } from "../../../helpers/singleCell/plotTheme";
import { DEFAULT_TSG_VIEW, KIND_SHORT, TSG_SOURCES, TSG_SOURCE_LABEL, summaryEvent, summaryTitle, tsgGeneInfo, tsgHitGrid } from "../../../helpers/singleCell/tsgHits";
import useCohortExport from "./useCohortExport";

const { Text } = Typography;
export const KIND_COLOR = { snv: "#1B9E77", loh: "#E6A100", homdel: "#3B6FB6", sv: "#7B4FA8" };
const pct = (x) => `${Math.round(100 * x)}%`;

/** Coloured hit chips ("mut trunc", "LOH", "homdel", "SV"); the label of a mutation is its protein change. */
export function HitChips({ hits, max = 4 }) {
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 2, justifyContent: "center" }}>
      {hits.slice(0, max).map((h, i) => (
        <span key={`${h.kind}-${i}`} style={{ background: KIND_COLOR[h.kind], color: "#fff", borderRadius: 3, padding: "0 4px", fontSize: TYPE.micro, lineHeight: "15px", whiteSpace: "nowrap" }}>
          {h.kind === "snv" ? `${h.label.replace(/^p\./, "")}` : KIND_SHORT[h.kind]}
        </span>
      ))}
      {hits.length > max && <span style={{ fontSize: TYPE.micro }}>{`+${hits.length - max}`}</span>}
    </span>
  );
}

function Cell({ s }) {
  if (!s) return <span style={{ color: INK.muted }}>·</span>;
  const ev = summaryEvent(s);
  const body = (
    <div style={{ textAlign: "center", lineHeight: 1.25, padding: "3px 2px", borderRadius: 4, background: s.multi ? (s.state === "biallelic" ? "rgba(27,158,119,0.14)" : "rgba(230,161,0,0.14)") : "transparent", opacity: s.multi ? 1 : 0.6 }} data-tsg-cell={`${s.patient}|${s.gene}`}>
      <div style={{ fontWeight: 700, fontSize: TYPE.label }}>{s.multi ? `×${s.nHits}` : "×1"}</div>
      <HitChips hits={s.hits} />
      {s.multi && (
        <div style={{ fontSize: TYPE.micro, color: INK.textSecondary }}>
          {s.sameFraction > 0 ? `${pct(s.sameFraction)} same cells` : "different cells"}
          {` · ${s.clonal ? "clonal" : "subclonal"}`}
        </div>
      )}
      {!s.multi && <div style={{ fontSize: TYPE.micro, color: INK.textSecondary }}>{`${pct(s.hits[0]?.fraction || 0)} of cells`}</div>}
    </div>
  );
  return (
    <Tooltip title={<div style={{ whiteSpace: "pre-line", maxWidth: 440 }}>{`${summaryTitle(s)}\nClick to open in ${s.patient} (Drivers layer).`}</div>}>
      <a href={driverHref(s.patient, ev)} onClick={linkClick} style={{ color: "inherit" }}>
        {body}
      </a>
    </Tooltip>
  );
}

/**
 * Cohort "Tumour suppressor hits": TSGs x patients. Each cell lists the distinct hits (mutation class / protein change, LOH, homozygous
 * deletion, SV), how many there are, whether they share cells (fraction of tumour cells with two hits in one cell) and clonal vs
 * subclonal. Patients are sorted by the number of TSGs with >= 2 hits; the tally line names the biallelic ones.
 * @param tsg result of useCohortTsg ({ callsByPatient, hasLoss, status, phase })
 */
export default function CohortTsgHitsPanel({ tsg, dataset }) {
  const [view, setView] = useState(DEFAULT_TSG_VIEW);
  const set = (patch) => setView((v) => ({ ...v, ...patch }));
  const loss = useCohortExport(dataset, "tsg_loss.json");
  const grid = useMemo(() => tsgHitGrid(tsg.callsByPatient, view), [tsg.callsByPatient, view]);
  const info = useMemo(() => tsgGeneInfo(tsg.callsByPatient, Object.keys(loss.data?.genes || {})), [tsg.callsByPatient, loss.data]);
  const patients = grid.patients;
  return (
    <Card size="small" title="Tumour suppressor hits" data-tsg-hits-panel>
      <Space direction="vertical" size={10} style={{ width: "100%" }}>
        <Text type="secondary" style={{ fontSize: TYPE.label }}>
          Which tumour suppressors have more than one hit, and whether the hits fall in the same cells. A cell reads ×N (distinct hits: each mutation, LOH, SV; a homozygous deletion is two), the hit types, the share of tumour cells carrying two hits in the same cell, and clonal (at least 90% of tumour cells) or subclonal.
          Two mutations count as two hits in one cell only when they are phased in trans from read fragments (_cohort/tsg_phase.json).
        </Text>
        {!tsg.hasLoss && <Alert type="warning" showIcon message="not available (_cohort/tsg_loss.json: per-cell allelic LOH calls not exported); LOH hits are missing" />}
        <Space wrap size={[12, 6]}>
          <span>
            <Text type="secondary">Gene list </Text>
            <Select size="small" style={{ width: 230 }} value={view.source} onChange={(source) => set({ source })} options={TSG_SOURCES.map((s) => ({ value: s, label: TSG_SOURCE_LABEL[s] }))} />
          </span>
          <Segmented size="small" value={view.minHits} onChange={(minHits) => set({ minHits })} options={[{ value: 2, label: "2+ hits" }, { value: 1, label: "any hit" }]} />
          <span>
            <Text type="secondary">Hit in at least </Text>
            <InputNumber size="small" min={0} max={100} step={5} style={{ width: 64 }} value={Math.round(view.minFraction * 100)} onChange={(x) => set({ minFraction: Math.max(0, Number(x) || 0) / 100 })} />
            <Text type="secondary"> % of tumour cells</Text>
          </span>
          <Input size="small" allowClear style={{ width: 170 }} placeholder="Filter genes (TP53 NF1)" value={view.genes} onChange={(e) => set({ genes: e.target.value })} />
        </Space>
        <Collapse
          size="small"
          ghost
          items={[
            {
              key: "genes",
              label: <Text style={{ fontSize: TYPE.label }}>{`Gene list used: ${TSG_SOURCE_LABEL[view.source]} (${info.curated.length} curated${info.oncokbOnly.length ? `, ${info.oncokbOnly.length} more by OncoKB role` : ""})`}</Text>,
              children: (
                <div style={{ fontSize: TYPE.label }}>
                  <p>{info.text}</p>
                  <p><b>Curated GBM list:</b> {info.curated.join(", ")}</p>
                  <p><b>Added by OncoKB role in this cohort:</b> {info.oncokbOnly.length ? info.oncokbOnly.join(", ") : "none"}</p>
                  <p><b>Allelic LOH available for:</b> {info.lossCovered.length ? info.lossCovered.join(", ") : "not available"}. chrX genes (e.g. STAG2, ATRX) have no allelic CN, so only their mutations are listed.</p>
                </div>
              ),
            },
          ]}
        />
        <div data-tsg-tally>
          {patients.map((p) => (
            <div key={p.patient} style={{ fontSize: TYPE.label }}>
              <b>{p.patient}</b>
              {`: ${p.text}`}
            </div>
          ))}
        </div>
        {grid.rows.length === 0 ? (
          <Text type="secondary">{tsg.status === "loading" ? "loading" : "no gene matches the filters"}</Text>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "2px 6px", position: "sticky", left: 0, background: INK.panel || "var(--sc-panel, #fff)" }}>Gene</th>
                  {patients.map((p) => (
                    <th key={p.patient} style={{ padding: "2px 4px", fontSize: TYPE.label, minWidth: 104 }}>
                      <div>{p.patient}</div>
                      <div style={{ fontWeight: 400, color: INK.textSecondary }}>{`${p.nMulti} with 2+ hits`}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.rows.map((r) => (
                  <tr key={r.gene} style={{ borderTop: "1px solid rgba(128,128,128,0.2)" }}>
                    <td style={{ padding: "2px 6px", fontWeight: 600, position: "sticky", left: 0, background: INK.panel || "var(--sc-panel, #fff)" }}>
                      {r.gene}
                      <div style={{ fontWeight: 400, fontSize: TYPE.micro, color: INK.textSecondary }}>{`${r.nMulti} patient${r.nMulti === 1 ? "" : "s"} with 2+ hits`}</div>
                    </td>
                    {patients.map((p) => (
                      <td key={p.patient} style={{ padding: 2, verticalAlign: "middle" }}>
                        <Cell s={r.cells[p.patient]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Space size={10} wrap>
          {Object.entries({ snv: "mutation (protein change)", loh: "LOH (loss or copy-neutral)", homdel: "homozygous deletion (both copies)", sv: "SV breaking the gene" }).map(([k, label]) => (
            <span key={k}>
              <Tag color={KIND_COLOR[k]} style={{ marginRight: 4 }}>{KIND_SHORT[k]}</Tag>
              <Text style={{ fontSize: TYPE.label }}>{label}</Text>
            </span>
          ))}
          {view.minHits === 2 && grid.hiddenSingle > 0 && <Text type="secondary" style={{ fontSize: TYPE.label }}>{`${grid.hiddenSingle} gene${grid.hiddenSingle === 1 ? "" : "s"} with a single hit hidden`}</Text>}
        </Space>
      </Space>
    </Card>
  );
}
