import React from "react";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Card, Space, Table, Typography } from "antd";
import { naturalCompare } from "../../../helpers/singleCell/matrix";
import NeutralTag from "../neutralTag";
import { signatureColorOf } from "../signaturePanel";
import RnaFindingsList from "../rna/rnaFindingsList";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import { Provenance } from "../hintLine";

const { Text } = Typography;

const CLASS_SHORT = { amp: "amp", homdel: "del", fusion: "fusion", trunc: "trunc", splice: "splice", missense: "mis", complex: "SV", other: "" };
// complex SVs have no gene: name them by their pattern (e.g. "TIC (19,20)", "DM (7)")
const driverName = (d) => d.gene || (d.class === "complex" ? `${d.event?.Variant || d.event?.vartype || ""}`.trim() : "") || "?";
const driverText = (d, withFraction = false) => `${driverName(d)}${CLASS_SHORT[d.class] && !(d.class === "complex" && !d.gene) ? ` ${CLASS_SHORT[d.class]}` : ""}${withFraction ? ` ${d3.format(".0%")(d.fraction)}` : ""}`;

function CloneBar({ counts, colors, width = 220 }) {
  const total = d3.sum(Object.values(counts)) || 1;
  let x = 0;
  return (
    <svg width={width} height={12}>
      {Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([clone, n]) => {
          const w = (width * n) / total;
          const r = <rect key={clone} x={x} y={0} width={Math.max(0, w - 0.5)} height={12} fill={colors[clone] || "#d9d9d9"}><title>{`${clone}: ${n}`}</title></rect>;
          x += w;
          return r;
        })}
    </svg>
  );
}

function SigBar({ items, width = 220 }) {
  if (!items.length) return <Text type="secondary">–</Text>;
  let x = 0;
  return (
    <svg width={width} height={12}>
      {items.map((s) => {
        const w = width * s.share;
        const r = <rect key={s.signature} x={x} y={0} width={Math.max(0, w - 0.5)} height={12} fill={signatureColorOf(s.signature)}><title>{`${s.signature}: ${d3.format(".0%")(s.share)}`}</title></rect>;
        x += w;
        return r;
      })}
    </svg>
  );
}

/** Body of a patient card: cells, clone bar, clonal / subclonal drivers, signatures, burden, RNA. */
export function PatientCardBody({ report, cloneCounts, cloneColors, rna = null }) {
  const { t } = useTranslation("common");
  return (
    <Space direction="vertical" size={6} style={{ width: "100%" }}>
      <Text>{t("components.single-cell.cohort.card-cells", { tumor: report.nTumorCells, normal: report.nNormalCells, count: report.clones.length })}</Text>
      <CloneBar counts={cloneCounts} colors={cloneColors} />
      <div>
        <Text type="secondary" style={{ fontSize: 13 }}>{t("components.single-cell.cohort.card-clonal")}</Text>
        <div>
          {report.clonal.length ? (
            report.clonal.slice(0, 8).map((d) => (
              <NeutralTag key={d.label} style={{ marginBottom: 2 }}>{driverText(d)}</NeutralTag>
            ))
          ) : (
            <Text type="secondary">–</Text>
          )}
          {report.clonal.length > 8 && <Text type="secondary">{`+${report.clonal.length - 8}`}</Text>}
        </div>
      </div>
      <div>
        <Text type="secondary" style={{ fontSize: 13 }}>{t("components.single-cell.cohort.card-subclonal", { count: report.subclonal.length })}</Text>
        <div>
          {report.subclonal.slice(0, 8).map((d) => (
            <NeutralTag key={d.label} style={{ marginBottom: 2 }}>{driverText(d, true)}</NeutralTag>
          ))}
        </div>
      </div>
      {report.signatures.all.length > 0 && (
        <div>
          <Text type="secondary" style={{ fontSize: 13, display: "block" }}>{t("components.single-cell.cohort.card-signatures")}</Text>
          <SigBar items={report.signatures.all} />
          <Text type="secondary" style={{ fontSize: 12.5, display: "block" }}>{report.signatures.all.slice(0, 3).map((x) => `${x.signature} ${d3.format(".0%")(x.share)}`).join(" · ")}</Text>
        </div>
      )}
      <Text type="secondary" style={{ fontSize: 13 }}>
        {report.burden.truncal + report.burden.subclonal + report.burden.private > 0 ? (
          <Provenance id="burden">{t("components.single-cell.cohort.card-burden", { truncal: report.burden.truncal, subclonal: report.burden.subclonal, private: report.burden.private })}</Provenance>
        ) : (
          t("components.single-cell.cohort.card-no-burden")
        )}
      </Text>
      {rna && rna.status !== "none" && (
        <div onClick={(e) => e.stopPropagation()} role="presentation">
          <Text type="secondary" style={{ fontSize: TYPE.label }}>{t("components.single-cell.rna-findings.title")}</Text>
          <RnaFindingsList findings={rna.data} status={rna.status} cloneColors={cloneColors} driverGenes={new Set([...report.clonal, ...report.subclonal].flatMap((d) => `${d.gene || ""}`.split("::")))} max={4} />
        </div>
      )}
    </Space>
  );
}

function DriverList({ items, max, withFraction = false }) {
  if (!items.length) return <Text type="secondary">–</Text>;
  return (
    <span>
      {items.slice(0, max).map((d) => <NeutralTag key={d.label}>{driverText(d, withFraction)}</NeutralTag>)}
      {items.length > max && <Text type="secondary" style={{ fontSize: TYPE.tick }}>{`+${items.length - max}`}</Text>}
    </span>
  );
}

/**
 * Every patient in one compact, neutral table: cells, clone mix (clone
 * colours are data), truncal / subclonal drivers and ecDNA oncogenes.
 * Rows open the patient; the full per-patient findings are in Key findings.
 * patients: [{ s (cohort summary), report (buildPatientReport), ecdna: string[] | null }]
 */
export default function PatientSummaryTable({ patients, cloneColors, onOpen }) {
  const { t } = useTranslation("common");
  const k = (key, opts) => t(`components.single-cell.cohort.${key}`, opts);
  const columns = [
    {
      title: k("patient"),
      key: "patient",
      width: 110,
      sorter: (a, b) => naturalCompare(a.s.caseReportId, b.s.caseReportId),
      render: (_, p) => <Typography.Link strong onClick={() => onOpen(p.s)}>{p.s.caseReportId}</Typography.Link>,
    },
    {
      title: k("col-tumor-normal"),
      key: "cells",
      width: 110,
      sorter: (a, b) => a.report.nTumorCells - b.report.nTumorCells,
      render: (_, p) => (
        <Text style={{ fontVariantNumeric: "tabular-nums" }}>
          {p.report.nTumorCells}
          <Text type="secondary">{` / ${p.report.nNormalCells}`}</Text>
        </Text>
      ),
    },
    {
      title: k("clones"),
      key: "clones",
      width: 190,
      sorter: (a, b) => a.report.clones.length - b.report.clones.length,
      render: (_, p) => (
        <Space size={6}>
          <Text style={{ display: "inline-block", width: 18, textAlign: "right" }}>{p.report.clones.length}</Text>
          <CloneBar counts={p.s.cloneCounts} colors={cloneColors} width={140} />
        </Space>
      ),
    },
    { title: k("col-truncal"), key: "truncal", render: (_, p) => <DriverList items={p.report.clonal} max={5} /> },
    {
      title: k("col-subclonal"),
      key: "subclonal",
      sorter: (a, b) => a.report.subclonal.length - b.report.subclonal.length,
      render: (_, p) => <DriverList items={p.report.subclonal} max={4} withFraction />,
    },
    {
      title: k("col-ecdna"),
      key: "ecdna",
      render: (_, p) => (p.ecdna == null ? <Text type="secondary">n/a</Text> : p.ecdna.length ? <Text>{p.ecdna.join(", ")}</Text> : <Text type="secondary">–</Text>),
    },
  ];
  return (
    <Card size="small" title={<Space size={6}>{k("patients-title")}<Provenance id="cohortOverview" /></Space>}>
      <Table size="small" rowKey={(p) => p.s.caseReportId} columns={columns} dataSource={patients} pagination={{ pageSize: 25, hideOnSinglePage: true }} />
    </Card>
  );
}
