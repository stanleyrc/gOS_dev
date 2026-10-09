import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Button, Card, Col, Row, Space, Tag, Typography } from "antd";
import { buildPatientReport } from "../../../helpers/singleCell/patientReport";
import { cellsForPatient } from "../../../helpers/singleCell/cellFiles";
import { signatureColorOf } from "../signaturePanel";
import { SC_GUTTER_INNER } from "../density";
import { Provenance } from "../hintLine";

const { Text } = Typography;
const CLASS_COLORS = { amp: "#D7191C", homdel: "#2C7BB6", fusion: "#7B3294", trunc: "#1A1A1A", splice: "#E6AB02", missense: "#1B9E77", other: "#8c8c8c" };

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

/** Body of a patient card: cells, clone bar, clonal / subclonal drivers, signatures, burden. */
export function PatientCardBody({ report, cloneCounts, cloneColors }) {
  const { t } = useTranslation("common");
  return (
    <Space direction="vertical" size={6} style={{ width: "100%" }}>
      <Text>{t("components.single-cell.cohort.card-cells", { tumor: report.nTumorCells, normal: report.nNormalCells, clones: report.clones.length })}</Text>
      <CloneBar counts={cloneCounts} colors={cloneColors} />
      <div>
        <Text type="secondary" style={{ fontSize: 13 }}>{t("components.single-cell.cohort.card-clonal")}</Text>
        <div>
          {report.clonal.length ? (
            report.clonal.slice(0, 8).map((d) => (
              <Tag key={d.label} style={{ borderColor: CLASS_COLORS[d.class], color: CLASS_COLORS[d.class], marginBottom: 2 }}>{d.gene}</Tag>
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
            <Tag key={d.label} style={{ borderColor: CLASS_COLORS[d.class], color: CLASS_COLORS[d.class], marginBottom: 2 }}>{`${d.gene} ${d3.format(".0%")(d.fraction)}`}</Tag>
          ))}
        </div>
      </div>
      <div>
        <Text type="secondary" style={{ fontSize: 13 }}>{t("components.single-cell.cohort.card-signatures")}</Text>
        <SigBar items={report.signatures.all} />
        <Text type="secondary" style={{ fontSize: 12.5 }}>{report.signatures.all.slice(0, 3).map((x) => `${x.signature} ${d3.format(".0%")(x.share)}`).join(" · ")}</Text>
      </div>
      <Text type="secondary" style={{ fontSize: 13 }}>
        <Provenance id="burden">{t("components.single-cell.cohort.card-burden", { truncal: report.burden.truncal, subclonal: report.burden.subclonal, private: report.burden.private })}</Provenance>
      </Text>
    </Space>
  );
}

/** One card per patient: cells, clones, clonal drivers, top signatures. */
export default function PatientCards({ summaries, files, datafiles, cloneColors, onOpen }) {
  const { t } = useTranslation("common");
  const reports = useMemo(
    () =>
      summaries.map((s) => ({
        s,
        report: buildPatientReport({
          patient: s.caseReportId,
          events: files[s.caseReportId]?.events || [],
          cells: cellsForPatient(datafiles, s.patientKey),
          variants: files[s.caseReportId]?.variants || [],
          signatures: files[s.caseReportId]?.signatures || null,
        }),
      })),
    [summaries, files, datafiles]
  );
  return (
    <Row gutter={SC_GUTTER_INNER}>
      {reports.map(({ s, report }) => (
        <Col key={s.caseReportId} xs={24} md={12} xl={8} xxl={6}>
          <Card
            size="small"
            hoverable
            onClick={() => onOpen(s)}
            title={
              <Space>
                <Text strong style={{ fontSize: 15 }}>{s.caseReportId}</Text>
                <Text type="secondary">{s.record.tumor_type || s.record.disease || ""}</Text>
              </Space>
            }
            extra={<Button type="link" size="small" onClick={(e) => { e.stopPropagation(); onOpen(s); }}>{t("components.single-cell.cohort.open")}</Button>}
          >
            <PatientCardBody report={report} cloneCounts={s.cloneCounts} cloneColors={cloneColors} />
          </Card>
        </Col>
      ))}
    </Row>
  );
}
