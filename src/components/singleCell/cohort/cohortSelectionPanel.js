import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Card, Col, Progress, Row, Space, Table, Tag, Typography } from "antd";
import { CloseOutlined, ExperimentOutlined, SelectOutlined } from "@ant-design/icons";
import HintLine from "../hintLine";
import { SC_GUTTER_INNER } from "../density";
import { loadRnaMatrix } from "../../../redux/singleCell/loaders";
import { crossStratumDE, selectionComposition } from "../../../helpers/singleCell/cohortContrast";
import { formatP } from "../../../helpers/singleCell/tests";
import { fieldLabel } from "../../../helpers/singleCell/fieldLabels";

const { Text } = Typography;
const pct = (x) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : "–");

function CompositionTable({ title, rows }) {
  return (
    <div>
      <Text strong>{title}</Text>
      <Table
        size="small"
        rowKey="level"
        pagination={false}
        dataSource={rows}
        columns={[
          { title: "", dataIndex: "level", key: "l" },
          { title: "Selected", key: "s", align: "right", render: (_, r) => `${r.sel} (${pct(r.fracSel)})` },
          { title: "All", key: "a", align: "right", render: (_, r) => `${r.all} (${pct(r.fracAll)})` },
          {
            title: "×",
            dataIndex: "ratio",
            key: "r",
            align: "right",
            render: (v, r) => (Number.isFinite(v) ? <Text type={r.p < 0.01 ? (v > 1 ? "success" : "danger") : "secondary"}>{v.toFixed(1)}</Text> : "–"),
          },
          { title: "p", dataIndex: "p", key: "p", align: "right", render: (p) => formatP(p) || "–" },
        ]}
      />
    </div>
  );
}

/**
 * What a lasso on the integrated UMAP picked: the selected cells' patients,
 * states and cycle phases against all cells (Fisher's exact test), and their
 * markers against the other cells of the same patients (Wilcoxon per patient,
 * combined across patients), so patient differences do not pass as markers.
 */
export default function CohortSelectionPanel({ selection, loaded, rna, cellsOf, field, datasetOf, onClear, onGene }) {
  const { t } = useTranslation("common");
  const [de, setDe] = useState(null);
  const [progress, setProgress] = useState(null);
  const cells = useMemo(
    () => loaded.flatMap((s) => cellsOf(s).map((c) => ({ key: `${s.caseReportId}::${c.rna_id}`, patient: s.caseReportId, cell: c }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loaded, rna, cellsOf]
  );
  const selKey = [...selection].sort().join("|");
  useEffect(() => setDe(null), [selKey]);
  const nSel = cells.filter((c) => selection.has(c.key)).length;
  const byPatient = useMemo(() => selectionComposition(cells.map((c) => ({ key: c.key, level: c.patient })), selection), [cells, selection]);
  const byField = useMemo(() => (field ? selectionComposition(cells.map((c) => ({ key: c.key, level: c.cell[field] })), selection) : []), [cells, selection, field]);
  const byPhase = useMemo(() => (field !== "Phase" ? selectionComposition(cells.map((c) => ({ key: c.key, level: c.cell.Phase })), selection) : []), [cells, selection, field]);
  if (!nSel) return null;

  const runMarkers = async () => {
    setProgress(0);
    const strata = [];
    for (const s of loaded) {
      const summary = rna[s.caseReportId].summary;
      const rowOf = new Map(summary.cells.map((c, k) => [c, k]));
      const mine = cellsOf(s);
      const rowsA = mine.filter((c) => selection.has(`${s.caseReportId}::${c.rna_id}`)).map((c) => rowOf.get(c));
      const rowsB = mine.filter((c) => !selection.has(`${s.caseReportId}::${c.rna_id}`)).map((c) => rowOf.get(c));
      if (rowsA.length < 3 || rowsB.length < 3) continue;
      try {
        // eslint-disable-next-line no-await-in-loop
        const matrix = await loadRnaMatrix(datasetOf(s), s.caseReportId);
        strata.push({ key: s.caseReportId, matrix, genes: summary.genes, rowsA, rowsB });
      } catch (e) {
        // no matrix: patient left out
      }
    }
    const res = await crossStratumDE(strata, { onProgress: (f) => setProgress(Math.round(f * 100)) });
    setProgress(null);
    setDe(res);
  };
  const top = (sign) => (de?.rows || []).filter((r) => r.q_val < 0.1 && Math.sign(r.avg_log2FC) === sign).slice(0, 25);
  const geneTags = (rows, color) =>
    rows.length ? (
      rows.map((r) => (
        <Tag key={r.gene} color={color} style={{ cursor: "pointer", marginBottom: 3 }} onClick={() => onGene(r.gene)} title={`log2FC ${r.avg_log2FC.toFixed(2)}, ${pct(r.pct_1)} vs ${pct(r.pct_2)}, q ${r.q_val.toExponential(1)}, ${r.nStrata} patients`}>
          {r.gene}
        </Tag>
      ))
    ) : (
      <Text type="secondary">{t("components.single-cell.cohort.sel-none")}</Text>
    );

  return (
    <Card
      size="small"
      title={
        <Space>
          <SelectOutlined />
          {t("components.single-cell.cohort.sel-title", { n: nSel, patients: byPatient.filter((r) => r.sel > 0).length })}
        </Space>
      }
      extra={
        <Button size="small" type="text" icon={<CloseOutlined />} onClick={onClear}>
          {t("components.single-cell.cohort.sel-clear")}
        </Button>
      }
    >
      <Space direction="vertical" size={8} style={{ width: "100%" }}>
        <HintLine text={t("components.single-cell.cohort.sel-help")} />
        <Row gutter={SC_GUTTER_INNER}>
          <Col xs={24} lg={8}>
            <CompositionTable title={t("components.single-cell.cohort.patient")} rows={byPatient} />
          </Col>
          {byField.length > 0 && (
            <Col xs={24} lg={8}>
              <CompositionTable title={fieldLabel(field)} rows={byField} />
            </Col>
          )}
          {byPhase.length > 0 && (
            <Col xs={24} lg={8}>
              <CompositionTable title={fieldLabel("Phase")} rows={byPhase} />
            </Col>
          )}
        </Row>
        <Space wrap>
          <Button size="small" icon={<ExperimentOutlined />} onClick={runMarkers} loading={progress != null}>
            {t("components.single-cell.cohort.sel-markers")}
          </Button>
          {progress != null && <Progress percent={progress} size="small" style={{ width: 160 }} />}
          {de && <Text type="secondary">{t("components.single-cell.cohort.sel-strata", { strata: de.strata.map((s) => `${s.key} (${s.nA} vs ${s.nB})`).join(", ") || "–" })}</Text>}
        </Space>
        {de && !de.strata.length && <Alert type="info" showIcon message={t("components.single-cell.cohort.sel-no-strata")} />}
        {de && de.strata.length > 0 && (
          <Row gutter={SC_GUTTER_INNER}>
            <Col xs={24} lg={12}>
              <Text strong>{t("components.single-cell.cohort.sel-up")}</Text>
              <div style={{ marginTop: 4 }}>{geneTags(top(1), "volcano")}</div>
            </Col>
            <Col xs={24} lg={12}>
              <Text strong>{t("components.single-cell.cohort.sel-down")}</Text>
              <div style={{ marginTop: 4 }}>{geneTags(top(-1), "geekblue")}</div>
            </Col>
          </Row>
        )}
      </Space>
    </Card>
  );
}
