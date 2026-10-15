import React, { useEffect, useMemo, useState } from "react";
import GeneInfoCard from "../rna/geneInfoCard";
import { Alert, Button, Card, Col, Empty, Input, Row, Segmented, Skeleton, Space, Switch, Table, Tag, Tooltip, Typography } from "antd";
import useCohortExport from "./useCohortExport";
import VolcanoPlot from "../rna/volcanoPlot";
import ScErrorBoundary from "../errorBoundary";
import HintLine from "../hintLine";
import { FAMILIES, FAMILY_LABELS, describeTest, sharedPrograms, formatQ, isRobust, looselyAdjusted, perPatientLfc, testRows, volcanoRows } from "../../../helpers/singleCell/covariateDe";

const { Text } = Typography;
const Q_CUT = 0.05;
const LFC_CUT = 0.5;
const ADJUST_NAME = { "plate+cycling+qc": "plate x cycling x library quality", "cycling+qc": "cycling x library quality (plates not separable)", "plate+cycling": "plate x cycling", cycling: "cycling only", none: "unadjusted" };

function EnrichmentList({ title, items }) {
  return (
    <div style={{ minWidth: 220, flex: 1 }}>
      <Text strong>{title}</Text>
      {items.length ? (
        <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
          {items.slice(0, 6).map((e) => (
            <li key={`${e.collection}-${e.term}`}>
              <Tooltip title={`${e.collection}; ${e.n} genes; leading: ${(e.leading || []).join(", ")}`}>
                <span>{e.term.replace(/^HALLMARK_|^3CA_\d+_/, "").replace(/_/g, " ").toLowerCase()}</span>
              </Tooltip>
              <Text type="secondary">{` · mean z ${e.mean_z.toFixed(2)} · q ${formatQ(e.q)}`}</Text>
            </li>
          ))}
        </ul>
      ) : (
        <div><Text type="secondary">no set tested</Text></div>
      )}
    </div>
  );
}

/**
 * Covariate DE: carriers vs non-carriers of recurrent drivers, high vs low oncogene copy number and clade vs sister clade,
 * each tested inside every patient (stratified Wilcoxon) and combined across patients. A table of tests, a volcano per
 * test, the top genes with their per-patient fold changes, and gene-set / program enrichment. `onGene` opens a gene in the
 * cohort expression plot; `focusTest` preselects a test (from a Key findings card).
 */
export default function CohortCovariateDePanel({ dataset, focusTest = null, onGene = null }) {
  const { status, data } = useCohortExport(dataset, "rna_covariate_de.json");
  const [family, setFamily] = useState("all");
  const [query, setQuery] = useState("");
  const [combinableOnly, setCombinableOnly] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedGene, setSelectedGene] = useState(null);
  const rows = useMemo(() => testRows(data, { family, query, combinableOnly }), [data, family, query, combinableOnly]);
  useEffect(() => {
    if (focusTest?.id) {
      setSelectedId(focusTest.id);
      setFamily("all");
      setQuery("");
    }
  }, [focusTest]);
  const selected = rows.find((r) => r.id === selectedId) || (rows.length && !selectedId ? rows[0] : null);
  useEffect(() => setSelectedGene(null), [selected?.id]);
  const volcano = useMemo(() => volcanoRows(selected), [selected]);
  const shared = useMemo(() => sharedPrograms(data), [data]);

  if (status === "loading") return <Skeleton active />;
  if (!data) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Covariate differential not computed yet (_cohort/rna_covariate_de.json; srctools gos_sc_rna_covariate_de.py)." />;

  const columns = [
    { title: "Test", dataIndex: "label", render: (v) => <Text strong>{v}</Text>, sorter: (a, b) => a.label.localeCompare(b.label) },
    { title: "Kind", dataIndex: "family_label", width: 130 },
    { title: "Patients", dataIndex: "k_patients", width: 80, align: "right", sorter: (a, b) => a.k_patients - b.k_patients },
    { title: "Cells A / B", key: "cells", width: 100, align: "right", render: (_, r) => `${r.cells.a} / ${r.cells.b}` },
    { title: "Robust genes", dataIndex: "n_robust", width: 100, align: "right", defaultSortOrder: "descend", sorter: (a, b) => a.n_robust - b.n_robust, render: (v, r) => (r.combinable ? <Text strong={v > 0}>{v}</Text> : <Tooltip title="One patient only: not combinable"><Text type="secondary">–</Text></Tooltip>) },
    { title: "Genes q<0.05", dataIndex: "n_sig_q05", width: 100, align: "right", sorter: (a, b) => a.n_sig_q05 - b.n_sig_q05 },
    { title: "Top higher in A", dataIndex: "top_up", render: (v) => (v || []).slice(0, 4).join(", ") },
    { title: "Top lower in A", dataIndex: "top_down", render: (v) => (v || []).slice(0, 4).join(", ") },
  ];
  const geneColumns = [
    { title: "Gene", dataIndex: "gene", width: 100, render: (g) => <Text strong style={{ cursor: "pointer", color: selectedGene === g ? "#fa541c" : undefined }} onClick={() => setSelectedGene(g)}>{g}</Text> },
    { title: "log2FC", dataIndex: "avg_log2FC", width: 76, align: "right", render: (v) => v.toFixed(2) },
    { title: "z", dataIndex: "z", width: 64, align: "right", render: (v) => v.toFixed(1) },
    { title: "q", dataIndex: "q_val", width: 76, align: "right", render: formatQ },
    { title: "Fisher q", dataIndex: "fisher_q", width: 76, align: "right", render: formatQ },
    { title: "Same direction", key: "conc", width: 100, align: "right", render: (_, r) => <Text type={r.n_concordant === r.n_patients ? undefined : "secondary"}>{`${r.n_concordant}/${r.n_patients}`}</Text> },
    { title: "Robust", key: "robust", width: 70, render: (_, r) => (isRobust(r) ? <Tag color="green" style={{ margin: 0 }}>yes</Tag> : null) },
    { title: "Per patient log2FC", key: "per", render: (_, r) => perPatientLfc(r).map((x) => <Tag key={x.patient} color={x.lfc > 0 ? "volcano" : "geekblue"} style={{ margin: 1 }}>{`${x.patient} ${x.lfc > 0 ? "+" : ""}${x.lfc.toFixed(2)}`}</Tag>) },
    ...(onGene ? [{ title: "", key: "open", width: 90, render: (_, r) => <Button size="small" type="link" onClick={() => onGene(r.gene)}>Expression</Button> }] : []),
  ];
  const labels = selected ? { A: selected.group_a, B: selected.group_b } : { A: "A", B: "B" };
  const loose = selected ? looselyAdjusted(selected) : [];

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Card size="small" title="Covariate differential expression">
        <Space wrap size={[12, 6]} style={{ marginBottom: 8 }}>
          <Segmented size="small" value={family} onChange={setFamily} options={[{ value: "all", label: "All" }, ...FAMILIES.map((f) => ({ value: f, label: FAMILY_LABELS[f] }))]} />
          <Input.Search size="small" allowClear placeholder="search tests or genes" style={{ width: 200 }} value={query} onChange={(e) => setQuery(e.target.value)} />
          <Space size={4}><Switch size="small" checked={combinableOnly} onChange={setCombinableOnly} /><Text type="secondary">2+ patients only</Text></Space>
        </Space>
        {shared.length > 0 && <Alert type="info" showIcon style={{ marginBottom: 8 }} message={`Shared by most driver tests: ${shared.slice(0, 4).map((x) => `${x.pretty} ${x.direction}`).join(", ")} (${shared[0].n} of ${shared[0].of}). Carriers of different drivers share clades, so read these as a tumour-wide / clade effect, not per-driver biology; they are left out of the per-test sentences.`} />}
        {data.tumour_filter && <Text type="secondary" style={{ display: "block", marginBottom: 6, fontSize: 12 }}>{`Malignant tumour cells only. Dropped per patient (non-malignant or DNA Normal): ${Object.entries(data.tumour_filter).map(([p, v]) => `${p} ${v.cells_with_covariates - v.kept}`).join(", ")}.`}</Text>}
        <Table size="small" rowKey="id" dataSource={rows} columns={columns} pagination={{ pageSize: 10, showSizeChanger: false }} scroll={{ x: true }}
          onRow={(r) => ({ onClick: () => setSelectedId(r.id), style: { cursor: "pointer", background: selected?.id === r.id ? "rgba(22,119,255,0.08)" : undefined } })} />
        <HintLine text={`Each test is run inside every patient (Wilcoxon, stratified by plate x cycling so that region and S-phase copy-number inflation are not read as biology) and the signed z scores are combined across patients (Stouffer; Fisher shown too). Robust gene = q < ${Q_CUT}, |log2FC| >= ${LFC_CUT}, 2+ patients, same direction in every patient. Cells are not independent samples, so p values are optimistic; concordance across patients is the safer evidence. Created ${data.created || ""}.`} />
      </Card>
      {selected && (
        <ScErrorBoundary resetKey={selected.id} title="Covariate DE view failed">
          <Card size="small" title={selected.label} extra={<Text type="secondary">{`${selected.cells.a} ${selected.group_a} vs ${selected.cells.b} ${selected.group_b} cells`}</Text>}>
            <Text>{describeTest(selected, { shared })}</Text>
            {!selected.combinable && <Alert type="warning" showIcon style={{ marginTop: 6 }} message="One patient only, so this cannot be called a cross-patient finding." />}
            {loose.length > 0 && <Alert type="info" showIcon style={{ marginTop: 6 }} message={`Less adjustment in ${loose.map((p) => `${p} (${ADJUST_NAME[selected.patients.find((x) => x.patient === p)?.adjust] || "?"})`).join(", ")}: the groups sit on different plates, so plate and group cannot be separated there (library quality is still controlled where listed).`} />}
            {selected.self_gene && <Text type="secondary" style={{ display: "block", marginTop: 4 }}>{`${selected.self_gene.gene} itself: log2FC ${selected.self_gene.avg_log2FC.toFixed(2)}, q ${formatQ(selected.self_gene.q_val)} (dosage positive control).`}</Text>}
            <Row gutter={[16, 12]} style={{ marginTop: 8 }}>
              <Col xs={24} xl={12}>
                <VolcanoPlot genes={volcano} labels={labels} qCut={Q_CUT} lfcCut={LFC_CUT} selectedGene={selectedGene} onGene={setSelectedGene} />
                <Text type="secondary" style={{ fontSize: 12 }}>{`Top ${volcano.length} genes by combined p are drawn; fold change is the mean over patients.`}</Text>
              </Col>
              <Col xs={24} xl={12}>
                <Table size="small" rowKey="gene" dataSource={selected.genes} columns={geneColumns} pagination={{ pageSize: 10, showSizeChanger: false }} scroll={{ x: true }}
                  onRow={(r) => ({ style: { background: selectedGene === r.gene ? "rgba(250,84,28,0.08)" : undefined } })} />
              </Col>
              {selectedGene && (
                <Col xs={24}>
                  {/* same gene card as the patient RNA DE panel: description, cancer roles, links */}
                  <GeneInfoCard gene={selectedGene} row={selected.genes.find((g) => g.gene === selectedGene)} labels={{ A: selected.group_a, B: selected.group_b }} />
                </Col>
              )}
            </Row>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 12 }}>
              <EnrichmentList title={`Programs higher in ${selected.group_a}`} items={selected.enrichment?.up || []} />
              <EnrichmentList title={`Programs lower in ${selected.group_a}`} items={selected.enrichment?.down || []} />
            </div>
            <Table size="small" style={{ marginTop: 12 }} rowKey="patient" pagination={false} dataSource={selected.patients}
              columns={[{ title: "Patient", dataIndex: "patient" }, { title: "Cells A", dataIndex: "n_a", align: "right" }, { title: "Cells B", dataIndex: "n_b", align: "right" }, { title: "Strata", dataIndex: "n_strata", align: "right" }, { title: "Adjusted for", dataIndex: "adjust", render: (v) => ADJUST_NAME[v] || v }]} />
          </Card>
        </ScErrorBoundary>
      )}
      {(data.caveats || []).length > 0 && (
        <Card size="small" title="Caveats"><ul style={{ margin: 0, paddingLeft: 18 }}>{data.caveats.map((c) => <li key={c}><Text type="secondary">{c}</Text></li>)}</ul></Card>
      )}
    </Space>
  );
}
