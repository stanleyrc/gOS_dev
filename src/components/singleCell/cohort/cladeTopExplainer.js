import React from "react";
import { useDispatch } from "react-redux";
import { Alert, Button, Card, Table, Tag, Typography } from "antd";
import datasetsActions from "../../../redux/datasets/actions";
import settingsActions from "../../../redux/settings/actions";
import { cladeCompareSpecs, cladeTopRows, fmtDiff, leadFlag, shortClade } from "../../../helpers/singleCell/covariateDe";

const { Text, Paragraph } = Typography;
const ADJUST = { "plate+cycling+qc": "plate x cycling x library quality", "cycling+qc": "cycling x library quality", "plate+cycling": "plate x cycling", cycling: "cycling only", none: "unadjusted" };

/**
 * "What this test is" for the highest-burden subclonal clade test, with the per-patient table (who is in and why, clade,
 * burden, cells, signature, adjustment, mt% / library-size difference). A clade id opens that patient's Single-Cell tab on
 * the Clade comparison card (clade vs sister).
 */
export default function CladeTopExplainer({ test, summaries = [] }) {
  const dispatch = useDispatch();
  const rows = cladeTopRows(test);
  const open = (row) => {
    const summary = summaries.find((s) => `${s.caseReportId}` === `${row.patient}`);
    if (!summary || !row.clade) return;
    const { a, b } = cladeCompareSpecs(row.clade);
    const url = new URL(window.location.href);
    url.searchParams.set("report", row.patient);
    url.searchParams.set("cmpA", a);
    url.searchParams.set("cmpB", b);
    url.searchParams.set("tab", "7");
    window.history.replaceState(window.history.state, "", url.toString());
    dispatch(datasetsActions.openCaseReport(summary.record.datasetId, summary.caseReportId, { allowNewTab: true }));
    dispatch(settingsActions.updateTab("7"));
  };
  const flag = leadFlag([...(test.robust_up || []), ...(test.robust_down || [])]);
  const columns = [
    { title: "Patient", dataIndex: "patient", width: 90, render: (v, r) => <Text strong type={r.included ? undefined : "secondary"}>{v}</Text> },
    { title: "Clade", dataIndex: "clade", render: (v, r) => (v ? <Button size="small" type="link" style={{ padding: 0 }} onClick={() => open(r)}>{shortClade(v)}</Button> : <Text type="secondary">–</Text>) },
    { title: "Burden vs median clade", dataIndex: "burden_rel", align: "right", render: (v) => (Number.isFinite(v) ? `${v.toFixed(1)}x` : "–") },
    { title: "Private SNVs", dataIndex: "n_private_snv", align: "right", render: (v) => (Number.isFinite(v) ? v : "–") },
    { title: "Signature", dataIndex: "top_signature", render: (v) => v || "–" },
    { title: "Cells A / B", key: "cells", align: "right", render: (_, r) => (r.n_a != null ? `${r.n_a} / ${r.n_b}` : "–") },
    { title: "Adjusted for", dataIndex: "adjust", render: (v) => (v ? ADJUST[v] || v : "–") },
    { title: "mt% A - B", dataIndex: "d_mt", align: "right", render: (v) => fmtDiff(v, 1) },
    { title: "log10 nCount A - B", dataIndex: "d_lib", align: "right", render: (v) => fmtDiff(v, 2) },
    { title: "In the test?", key: "in", render: (_, r) => (r.included ? <Tag color="green" style={{ margin: 0 }}>in</Tag> : <Tooltip2 text={r.reason} />) },
  ];
  return (
    <Card size="small" style={{ marginTop: 8, background: "rgba(22,119,255,0.03)" }} title="What this test is">
      <Paragraph style={{ marginBottom: 6 }}>
        In each patient, take the subclonal clade with the most private SNVs relative to that patient&apos;s other clades (burden = the clade&apos;s private SNVs per callable site divided by the patient&apos;s median clade, from clades.json) and compare its tumour cells with those of its sister clade(s), the rest of its parent clade. Only malignant tumour cells with RNA are used, the comparison is made inside each patient (plate, cycling and library quality controlled), and the per-patient results are combined across patients.
      </Paragraph>
      <Paragraph style={{ marginBottom: 6 }}>
        Why it is interesting: these are the hypermutated subclones, compared with their nearest relatives, so the comparison is lineage-matched (the same ancestry, differing by the mutational burst) rather than tumour vs normal.
      </Paragraph>
      <Paragraph type="secondary" style={{ marginBottom: 6 }}>
        Caveats: only patients with an SNV-based burden and at least 15 RNA tumour cells on each side are included (the table says why the others are out); a high-burden clade is often also a spatial or plate subclone, so region, plate and library quality can still contribute; the clade is picked on the data (burden), cells are not independent, and mitochondrial, ribosomal and stress genes can reflect cell quality.
      </Paragraph>
      {flag && <Alert type="warning" showIcon style={{ marginBottom: 6 }} message={flag === "mito" ? "The leading genes are mitochondrial: check the mt% column before reading this as biology." : "The leading genes are ribosomal: this can be a translation program or a library-size effect."} />}
      <Table size="small" rowKey="key" pagination={false} dataSource={rows} columns={columns} scroll={{ x: true }} />
    </Card>
  );
}

function Tooltip2({ text }) {
  return <Text type="secondary" style={{ fontSize: 12 }}>{`out: ${text}`}</Text>;
}
