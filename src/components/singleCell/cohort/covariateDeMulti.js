import React, { useMemo, useState } from "react";
import { Alert, Button, Col, Row, Segmented, Skeleton, Space, Table, Tag, Tooltip, Typography } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import Violins from "../violins";
import CovariateDeDotPlot from "./covariateDeDotPlot";
import GeneQuickLook from "./geneQuickLook";
import useCovariateDeCells from "./useCovariateDeCells";
import { COLOR_DOWN, COLOR_UP } from "../rna/volcanoPlot";
import { dotPlotAggregate, moduleTest, orderByEffect, scaledPerPatient, selectedGeneRows, statsTsv } from "../../../helpers/singleCell/covariateDeMulti";
import { formatQ, isRobust } from "../../../helpers/singleCell/covariateDe";

const { Text } = Typography;

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/tab-separated-values" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Detail view of several selected genes in one covariate test: module score (mean z of the genes per cell, tested like the
 * single genes), dot plot genes x groups, per-gene stats table with patient consistency, and small-multiple violins.
 */
export default function CovariateDeMulti({ dataset, test, genes, summaries = [], datasets = [], onGene = null, onRemove = null }) {
  const cells = useCovariateDeCells({ dataset, test, genes, summaries, datasets });
  const [split, setSplit] = useState(false);
  const [shared, setShared] = useState(false);
  const rows = useMemo(() => orderByEffect(selectedGeneRows(test, genes)), [test, genes]);
  const ordered = useMemo(() => rows.map((r) => r.gene), [rows]);
  const scaled = useMemo(() => scaledPerPatient(cells.perPatient), [cells.perPatient]);
  const loadedGenes = useMemo(() => ordered.filter((g) => scaled.some((p) => p.genes[g])), [ordered, scaled]);
  const mod = useMemo(() => moduleTest(scaled), [scaled]);
  const dot = useMemo(() => dotPlotAggregate(scaled, loadedGenes, { split }), [scaled, loadedGenes, split]);
  const A = test.group_a;
  const B = test.group_b;

  const moduleGroups = useMemo(() => {
    if (!split) {
      return [
        { key: "A", label: "A", color: COLOR_UP, values: scaled.flatMap((p) => p.module.a) },
        { key: "B", label: "B", color: COLOR_DOWN, values: scaled.flatMap((p) => p.module.b) },
      ];
    }
    return scaled.flatMap((p) => [
      { key: `${p.patient} A`, label: "A", color: COLOR_UP, values: p.module.a, cluster: p.patient },
      { key: `${p.patient} B`, label: "B", color: COLOR_DOWN, values: p.module.b, cluster: p.patient },
    ]);
  }, [scaled, split]);

  // small multiples: pooled = scaled values (per patient z) so patients with different baselines mix fairly; split = raw log-normalized per patient
  const gene2groups = (g) => {
    if (!split) return [
      { key: "A", label: "A", color: COLOR_UP, values: scaled.flatMap((p) => p.genes[g]?.a || []) },
      { key: "B", label: "B", color: COLOR_DOWN, values: scaled.flatMap((p) => p.genes[g]?.b || []) },
    ];
    return scaled.filter((p) => p.raw[g]).flatMap((p) => [
      { key: `${p.patient} A`, label: "A", color: COLOR_UP, values: p.raw[g].a, cluster: p.patient },
      { key: `${p.patient} B`, label: "B", color: COLOR_DOWN, values: p.raw[g].b, cluster: p.patient },
    ]);
  };
  const domain = useMemo(() => {
    if (!shared) return null;
    const v = loadedGenes.flatMap((g) => gene2groups(g).flatMap((x) => x.values)).filter(Number.isFinite);
    return v.length ? [Math.min(0, ...v), Math.max(...v)] : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared, loadedGenes, scaled, split]);

  const patients = (test.patients || []).map((p) => p.patient);
  const columns = [
    { title: "Gene", dataIndex: "gene", width: 100, render: (g) => <Space size={2}><Text strong>{g}</Text><GeneQuickLook gene={g} icon /></Space> },
    { title: "log2FC", dataIndex: "lfc", width: 70, align: "right", sorter: (a, b) => (a.lfc ?? 0) - (b.lfc ?? 0), render: (v) => (v == null ? "–" : v.toFixed(2)) },
    { title: `Direction in ${A}`, dataIndex: "direction", width: 100, render: (v) => (v ? <Tag color={v === "higher" ? "volcano" : "geekblue"} style={{ margin: 0 }}>{v}</Tag> : <Text type="secondary">not available</Text>) },
    { title: "p", dataIndex: "p", width: 70, align: "right", render: (v) => (v == null ? "–" : formatQ(v)) },
    { title: "q", dataIndex: "q", width: 70, align: "right", sorter: (a, b) => (a.q ?? 1) - (b.q ?? 1), render: (v) => (v == null ? "–" : formatQ(v)) },
    { title: "Same direction", key: "conc", width: 90, align: "right", render: (_, r) => (r.n_patients == null ? <Text type="secondary">–</Text> : <Text type={r.n_concordant === r.n_patients ? undefined : "secondary"}>{`${r.n_concordant}/${r.n_patients}`}</Text>) },
    { title: "Robust", key: "robust", width: 64, render: (_, r) => (isRobust({ ...r, avg_log2FC: r.lfc, q_val: r.q }) ? <Tag color="green" style={{ margin: 0 }}>yes</Tag> : null) },
    ...patients.map((p) => ({
      title: p, key: p, width: 64, align: "right",
      render: (_, r) => {
        const v = r.per?.[p];
        return v == null ? <Text type="secondary">–</Text> : <Text style={{ color: v > 0 ? COLOR_UP : COLOR_DOWN }}>{`${v > 0 ? "+" : ""}${v.toFixed(2)}`}</Text>;
      },
    })),
    ...(onRemove ? [{ title: "", key: "rm", width: 28, render: (_, r) => <Button size="small" type="text" onClick={() => onRemove(r.gene)}>x</Button> }] : []),
  ];

  const none = rows.filter((r) => r.source === "none").map((r) => r.gene);
  return (
    <div>
      <Space wrap size={[16, 6]} style={{ marginBottom: 8 }}>
        <Text strong>{`${genes.length} genes selected`}</Text>
        <Space size={4}><Text type="secondary">Cells</Text><Segmented size="small" value={split ? "split" : "pooled"} onChange={(v) => setSplit(v === "split")} options={[{ value: "pooled", label: "Pooled" }, { value: "split", label: "By patient" }]} /></Space>
        <Space size={4}><Text type="secondary">Violin y-axis</Text><Segmented size="small" value={shared ? "shared" : "per"} onChange={(v) => setShared(v === "shared")} options={[{ value: "per", label: "Per gene" }, { value: "shared", label: "Shared" }]} /></Space>
        <Button size="small" icon={<DownloadOutlined />} onClick={() => download(`covde_${test.id.replace(/[^A-Za-z0-9]+/g, "_")}_${genes.length}genes.tsv`, statsTsv(test, rows))}>Download stats (TSV)</Button>
      </Space>
      {none.length > 0 && <Alert type="warning" showIcon style={{ marginBottom: 8 }} message={`No statistics in this test for ${none.join(", ")}: not available (only the top genes by p are stored per test).`} />}

      <Table size="small" rowKey="gene" dataSource={rows} columns={columns} pagination={false} scroll={{ x: true }} style={{ marginBottom: 12 }} />

      {cells.loading ? <Skeleton active paragraph={{ rows: 4 }} /> : (
        <>
          <div style={{ marginBottom: 12 }}>
            <Text strong>Module score</Text>
            <Text type="secondary">{` · mean z of ${loadedGenes.length} genes per cell (z per patient over the test's cells), ${A} (A, red) vs ${B} (B, blue)`}</Text>
            {mod ? (
              <div>
                <Text>{`Module score is ${mod.z > 0 ? "higher" : "lower"} in ${A}: combined z ${mod.z.toFixed(2)}, p ${formatQ(mod.p)} (rank-sum inside each of ${mod.nPatients} patient${mod.nPatients === 1 ? "" : "s"}, z combined by Stouffer); ${mod.nConcordant}/${mod.nPatients} patients move the same way.`}</Text>
                <Text type="secondary" style={{ display: "block", fontSize: 12 }}>
                  {`Per patient: ${mod.perPatient.map((x) => `${x.patient} ${x.delta > 0 ? "+" : ""}${x.delta.toFixed(2)} (z ${x.z.toFixed(1)}, ${x.nA} vs ${x.nB})`).join("; ")}. Stratified by patient only: unlike the per-gene tests it is not adjusted for plate x cycling x library quality, and cells are not independent, so p is optimistic.`}
                </Text>
              </div>
            ) : <Text type="secondary" style={{ display: "block" }}>Module test not available (no patient with 3+ cells on each side and expression loaded).</Text>}
            {moduleGroups.some((g) => g.values.length) && <Violins groups={moduleGroups} height={220} yTitle="module score (mean z)" showDetected={false} />}
          </div>

          <Row gutter={[16, 12]}>
            <Col xs={24} xl={10}>
              <Text strong>Dot plot</Text>
              <Text type="secondary">{` · genes ordered by log2FC; A = ${A}, B = ${B}`}</Text>
              <CovariateDeDotPlot genes={loadedGenes} columns={dot.columns} cells={dot.cells} labelA={A} labelB={B} onGene={onGene} />
            </Col>
            <Col xs={24} xl={14}>
              <Text strong>Per-gene violins</Text>
              <Text type="secondary">{split ? " · by patient, log-normalized" : " · patients pooled after z-scoring each gene within the patient"}</Text>
              <Row gutter={[8, 8]}>
                {loadedGenes.slice(0, 24).map((g) => {
                  const r = rows.find((x) => x.gene === g);
                  return (
                    <Col xs={24} md={12} xxl={8} key={g}>
                      <Tooltip title={`${g}: log2FC ${r?.lfc?.toFixed(2) ?? "n/a"}, q ${r?.q != null ? formatQ(r.q) : "n/a"}`}>
                        <Text strong style={{ fontSize: 12 }}>{g}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>{r?.lfc != null ? ` log2FC ${r.lfc.toFixed(2)} · q ${formatQ(r.q)}` : ""}</Text>
                      </Tooltip>
                      <Violins groups={gene2groups(g)} height={split ? 200 : 170} domain={domain} yTitle={split ? "log-norm." : "scaled (z)"} showDetected={!split} />
                    </Col>
                  );
                })}
              </Row>
              {loadedGenes.length > 24 && <Text type="secondary">{`Violins for the first 24 of ${loadedGenes.length} genes (by effect); the dot plot and table show all.`}</Text>}
            </Col>
          </Row>
          {(cells.unavailable.length > 0 || cells.missing.length > 0) && (
            <Space direction="vertical" size={0} style={{ display: "flex", marginTop: 6 }}>
              {cells.unavailable.map((u) => <Text key={u.patient} type="secondary">{`${u.patient}: not available (${u.reason})`}</Text>)}
              {cells.missing.map((m) => <Text key={`m${m.patient}`} type="secondary">{`${m.patient}: not in the expression matrix (${m.genes.join(", ")})`}</Text>)}
            </Space>
          )}
        </>
      )}
    </div>
  );
}
