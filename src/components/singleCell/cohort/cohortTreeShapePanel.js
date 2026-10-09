import React, { useMemo } from "react";
import { Card, Space, Table, Typography } from "antd";
import { patientTreeStats } from "../../../helpers/singleCell/treeShape";

const { Text } = Typography;
const pct = (x) => (Number.isFinite(x) ? `${Math.round(100 * x)}%` : "–");
const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "–");

/**
 * Tree shape and chromosomal instability per patient (cohort): trunk
 * fraction of tumour SNVs (truncal / truncal + subclonal + private), share
 * of private one-cell SNVs (ongoing mutation), Sackin imbalance of the tumour
 * tree relative to a Yule tree (> 1 = more imbalanced / caterpillar-like,
 * e.g. selective sweeps), spread of the local branching index across cells,
 * and subclonal / one-cell copy-number events from the filtered events.
 */
export default function CohortTreeShapePanel({ summaries, files, datafiles }) {
  const rows = useMemo(
    () =>
      summaries.map((s) => {
        const f = files?.[s.caseReportId];
        const tumourIds = new Set(
          (datafiles || [])
            .filter((r) => `${r.patient_id ?? r.patient ?? ""}` === `${s.caseReportId}` && (r.entry_type ?? "cell") === "cell")
            .filter((r) => !/^normal$/i.test(`${r.clone_id || ""}`))
            .map((r) => `${r.pair ?? r.cell_id}`)
        );
        if (!f) return { patient: s.caseReportId, loading: true };
        return { patient: s.caseReportId, ...patientTreeStats({ layout: f.tree, variants: f.variants, events: f.events, tumourIds }) };
      }),
    [summaries, files, datafiles]
  );
  return (
    <Card size="small" title="Tree shape and chromosomal instability per patient">
      <Space direction="vertical" style={{ width: "100%" }} size="small">
        <Text type="secondary" style={{ fontSize: 12 }}>
          Trunk fraction: truncal share of tumour SNVs (mapped onto the tree). Private share: SNVs in one cell, the ongoing mutation burden.
          Sackin / Yule: imbalance of the tumour tree (1 = as balanced as random branching; higher = caterpillar-like). LBI CV: spread of the
          local branching index (uneven expansion). Copy-number events from the patient&apos;s filtered events (subclonal: in &lt; 90% of tumour
          cells).
        </Text>
        <Table
          size="small"
          rowKey="patient"
          pagination={false}
          dataSource={rows}
          scroll={{ x: 900 }}
          columns={[
            { title: "Patient", dataIndex: "patient", fixed: "left" },
            { title: "Tumour cells", dataIndex: "nCells", render: (x, r) => (r.loading ? "loading…" : x ?? "–") },
            { title: "Tumour SNVs", dataIndex: "nSnv", render: (x) => x ?? "–" },
            { title: "Trunk fraction", dataIndex: "trunkFrac", sorter: (a, b) => (a.trunkFrac ?? -1) - (b.trunkFrac ?? -1), render: pct },
            { title: "Private SNVs", dataIndex: "privateFrac", sorter: (a, b) => (a.privateFrac ?? -1) - (b.privateFrac ?? -1), render: pct },
            { title: "Sackin / Yule", dataIndex: "sackinNorm", sorter: (a, b) => (a.sackinNorm ?? -1) - (b.sackinNorm ?? -1), render: (x) => fmt(x) },
            { title: "LBI CV", dataIndex: "lbiCv", render: (x) => fmt(x) },
            { title: "SCNA events", dataIndex: "nScna", render: (x) => x ?? "–" },
            { title: "Subclonal SCNA", dataIndex: "scnaSubclonalFrac", render: pct },
            { title: "One-cell SCNA", dataIndex: "scnaPrivate", render: (x) => x ?? "–" },
          ]}
        />
      </Space>
    </Card>
  );
}
