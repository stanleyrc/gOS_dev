import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Card, Empty, Select, Space, Statistic, Switch, Table, Typography } from "antd";
import { ExperimentOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import { cellsForPatient } from "../../../helpers/singleCell/cellFiles";
import { robustOutliers } from "../../../helpers/singleCell/cohortStats";
import { BoxStrips, patientColor } from "./charts";
import HintLine, { Provenance } from "../hintLine";
import ColorTag from "../colorTag";
import { formatValue } from "../../../helpers/singleCell/figureStyle";
import { INK } from "../../../helpers/singleCell/plotTheme";

const { Text } = Typography;

// Per-cell metrics present in datafiles.json (pipeline QC export + counts).
export const CELL_QC_METRICS = [
  ["ploidy", "Ploidy", false],
  ["snv_count", "SNVs called per cell", true],
  ["junction_count", "Junctions per cell", true],
  ["qc_reads", "Total reads", true],
  ["qc_depth", "Mean depth", false],
  ["qc_breadth", "Breadth (% genome covered)", false],
  ["qc_mad", "MAD of coverage", false],
  ["qc_gini", "Gini coefficient", false],
  ["qc_ado", "Allelic dropout", false],
  ["qc_unmapped_pct", "Unmapped reads (%)", false],
  ["qc_mito_pct", "Mitochondrial reads (%)", false],
];

/** Which of the metrics any of the given cells carry. */
export const availableQcMetrics = (cells) => CELL_QC_METRICS.filter(([k]) => cells.some((c) => Number.isFinite(Number(c[k]))));

/**
 * Library / call QC of every cell across patients: one box-and-strip per
 * patient for the chosen metric, outliers (3 MADs within a patient) in red.
 */
export default function CohortQcPanel({ summaries, datafiles, onOpenCell }) {
  const { t } = useTranslation("common");
  const [ref, width] = useContainerWidth(800);
  const allCells = useMemo(() => summaries.flatMap((s) => cellsForPatient(datafiles, s.patientKey).map((c) => ({ ...c, _patient: s }))), [summaries, datafiles]);
  const metrics = useMemo(() => availableQcMetrics(allCells), [allCells]);
  const [metric, setMetric] = useState(null);
  const [tumorOnly, setTumorOnly] = useState(true);
  const key = metric || metrics[0]?.[0];
  const def = CELL_QC_METRICS.find(([k]) => k === key);
  const groups = useMemo(() => {
    if (!key) return [];
    return summaries.map((s, k) => {
      const cells = allCells.filter((c) => c._patient === s && (!tumorOnly || !/^normal$/i.test(`${c.clone_id || ""}`)));
      return { key: s.caseReportId, label: s.caseReportId, color: patientColor(k), values: cells.map((c) => Number(c[key])), ids: cells.map((c) => c.cell_id), cells };
    });
  }, [summaries, allCells, key, tumorOnly]);
  const flagged = useMemo(() => {
    const out = new Set();
    groups.forEach((g) => robustOutliers(g.values).forEach((i) => out.add(g.ids[i])));
    return out;
  }, [groups]);
  // per-patient summary under the plot: cells, median, IQR, flagged outliers
  const rows = groups.map((g) => {
    const v = g.values.filter(Number.isFinite).sort(d3.ascending);
    const nFlag = g.ids.filter((id) => flagged.has(id)).length;
    return { key: g.key, color: g.color, n: v.length, median: d3.quantile(v, 0.5), q1: d3.quantile(v, 0.25), q3: d3.quantile(v, 0.75), flagged: nFlag };
  });
  const allValues = groups.flatMap((g) => g.values).filter(Number.isFinite).sort(d3.ascending);
  if (!metrics.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.qc.empty")} />;
  return (
    <Card
      size="small"
      title={<Space><ExperimentOutlined />{t("components.single-cell.qc.cohort-title")}<Provenance id="cohortQc" /></Space>}
      extra={
        <Space>
          <Select size="small" style={{ width: 230 }} value={key} onChange={setMetric} options={metrics.map(([k, label]) => ({ value: k, label }))} />
          <Switch size="small" checked={tumorOnly} onChange={setTumorOnly} />
          <Text>{t("components.single-cell.qc.tumor-only")}</Text>
        </Space>
      }
    >
      <div ref={ref}>
        <Space size="large" wrap style={{ marginBottom: 4 }}>
          <Statistic title={t("components.single-cell.qc.stat-cells")} value={allValues.length} />
          <Statistic title={t("components.single-cell.qc.stat-flagged")} value={flagged.size} valueStyle={flagged.size ? { color: INK.danger } : undefined} />
          <Statistic title={t("components.single-cell.qc.cohort-median", { metric: def?.[1] || "" })} value={formatValue(d3.quantile(allValues, 0.5))} />
        </Space>
        <BoxStrips
          groups={groups}
          width={Math.max(400, width - 16)}
          height={300}
          yTitle={def?.[1]}
          log={Boolean(def?.[2])}
          flagged={flagged}
          onPoint={(g, k) => onOpenCell && onOpenCell(g.cells[k])}
        />
        <HintLine text={t("components.single-cell.qc.cohort-help", { count: flagged.size })} />
        <Table
          size="small"
          rowKey="key"
          pagination={false}
          style={{ marginTop: 8 }}
          dataSource={rows}
          columns={[
            { title: t("components.single-cell.cohort.patient"), dataIndex: "key", render: (k, r) => <ColorTag color={r.color} style={{ border: "none" }}>{k}</ColorTag> },
            { title: t("components.single-cell.qc.stat-cells"), dataIndex: "n", align: "right", sorter: (a, b) => a.n - b.n },
            { title: t("components.single-cell.qc.col-median"), dataIndex: "median", align: "right", sorter: (a, b) => (a.median ?? -Infinity) - (b.median ?? -Infinity), render: (v) => formatValue(v) },
            { title: t("components.single-cell.qc.col-iqr"), key: "iqr", align: "right", render: (_, r) => (Number.isFinite(r.q1) ? `${formatValue(r.q1)} – ${formatValue(r.q3)}` : "–") },
            { title: t("components.single-cell.qc.stat-flagged"), dataIndex: "flagged", align: "right", sorter: (a, b) => a.flagged - b.flagged, render: (v, r) => (v ? <Text type="danger">{`${v} (${d3.format(".0%")(v / Math.max(1, r.n))})`}</Text> : "0") },
          ]}
        />
      </div>
    </Card>
  );
}
