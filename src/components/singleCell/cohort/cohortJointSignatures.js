import React, { useMemo } from "react";
import { Card, Empty, Space, Table, Tag, Typography } from "antd";
import { ExperimentOutlined } from "@ant-design/icons";
import useCohortExport from "./useCohortExport";
import { signatureColorOf } from "../signaturePanel";
import { cohortDifferences, fmtDiff, fmtP } from "../../../helpers/singleCell/signatureJoint";
import { fmtBurden } from "../../../helpers/singleCell/signatureBurden";

const { Text } = Typography;

/**
 * Signatures whose exposure fraction differs between a non-truncal site set
 * (subclonal / private) and truncal, per patient, from the joint refit
 * (_cohort/signatures_joint.json, skilift sc_signatures_joint_cohort).
 * Shown only for differences with a bootstrap CI excluding 0 and q <= 0.05.
 */
export default function CohortJointSignatures({ dataset }) {
  const { status, data } = useCohortExport(dataset, "signatures_joint.json");
  const rows = useMemo(() => cohortDifferences(data).map((g, i) => ({ key: i, ...g })), [data]);
  if (status === "loading") return null;
  if (!data) return null;
  const columns = [
    { title: "Signature", dataIndex: "signature", render: (s) => <Tag color={signatureColorOf(s)} style={{ color: "#fff" }}>{s}</Tag> },
    { title: "Contrast", dataIndex: "contrast" },
    { title: "Patients (difference [95% CI], q · mutations (share) in the set vs truncal)", dataIndex: "patients", render: (ps) => ps.map((p) => <div key={p.patient}><b>{p.patient}</b> {fmtDiff(p)}, q {fmtP(p.q)} <Text type="secondary">{`· ${fmtBurden(p.count_a, p.frac_a)} vs ${fmtBurden(p.count_b, p.frac_b)} mutations`}</Text></div>) },
    { title: "Direction", dataIndex: "direction" },
  ];
  return (
    <Card size="small" title={<Space><ExperimentOutlined />Signatures that differ between non-truncal and truncal sites (joint refit)</Space>}>
      {rows.length ? (
        <Table size="small" pagination={false} dataSource={rows} columns={columns} />
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="no signature differs between a non-truncal set and truncal with a CI excluding 0 and q <= 0.05" />
      )}
      <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 4 }}>
        {`Patients: ${(data.patients || []).map((p) => `${p.patient} (${p.signatures.join(", ")})`).join("; ")}. Difference = exposure fraction in the first set minus truncal; mutations = fraction x the set's SNVs.`}
      </Text>
    </Card>
  );
}
