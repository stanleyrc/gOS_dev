import React, { useMemo } from "react";
import { useSelector } from "react-redux";
import { Card, Empty, Table, Tag, Typography } from "antd";
import { cohortEntries } from "../../../helpers/singleCell/cohortOncoprint";
import { cohortNotableSvs } from "../../../helpers/singleCell/notableSvs";
import { GenesText, NOTE } from "../notableSvCard";
import useGeneSpans from "./useGeneSpans";

const { Text } = Typography;

/** Cohort Overview: one line per complex-SV family (ecDNA first) across patients, by cell fraction. Classifier families, not validated SVs. */
export default function CohortNotableSvs({ summaries = [], files = {}, onPatient, loading = false }) {
  const { spans: geneSpans } = useGeneSpans();
  const genesList = useSelector((s) => s.Genes?.list || []);
  const rows = useMemo(() => {
    const per = {};
    summaries.forEach((s) => {
      const ev = files[s.caseReportId]?.events;
      if (ev) per[s.caseReportId] = cohortEntries(ev);
    });
    return cohortNotableSvs(per, { geneSpans, genesList: genesList.length ? genesList : null });
  }, [summaries, files, genesList, geneSpans]);
  const columns = [
    { title: "Patient", dataIndex: "patient", width: 90, render: (p) => <a onClick={() => onPatient && onPatient(p)}>{p}</a> },
    { title: "Type", render: (_, r) => <Text>{r.members.split(",")[0].replace(/ in \d+ cells?/, "")}</Text> },
    { title: "Family", dataIndex: "label" },
    { title: "Chromosomes", render: (_, r) => r.chromosomes.join(", ") },
    { title: "Cells", width: 110, render: (_, r) => `${r.n}${r.fraction ? ` (${Math.round(100 * r.fraction)}%)` : ""}` },
    { title: "Genes inside (drivers first)", render: (_, r) => <GenesText r={r} /> },
    { title: "ecDNA", width: 110, render: (_, r) => (r.ecdna ? <Tag color="purple">inside ecDNA</Tag> : null) },
  ];
  return (
    <Card size="small" title="Notable SVs across patients" extra={<Text type="secondary" style={{ fontSize: 12 }}>{NOTE}</Text>}>
      {!rows.length ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={loading ? "Loading patients..." : "No complex-SV family"} />
      ) : (
        <Table size="small" pagination={{ pageSize: 15, hideOnSinglePage: true }} rowKey={(r) => `${r.patient}|${r.key}`} dataSource={rows} columns={columns} />
      )}
    </Card>
  );
}
