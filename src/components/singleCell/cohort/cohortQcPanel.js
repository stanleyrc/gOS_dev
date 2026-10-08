import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, Empty, Select, Space, Switch, Typography } from "antd";
import { ExperimentOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import { cellsForPatient } from "../../../helpers/singleCell/cellFiles";
import { robustOutliers } from "../../../helpers/singleCell/cohortStats";
import { BoxStrips, patientColor } from "./charts";

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
  if (!metrics.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.qc.empty")} />;
  return (
    <Card
      size="small"
      title={<Space><ExperimentOutlined />{t("components.single-cell.qc.cohort-title")}</Space>}
      extra={
        <Space>
          <Select size="small" style={{ width: 230 }} value={key} onChange={setMetric} options={metrics.map(([k, label]) => ({ value: k, label }))} />
          <Switch size="small" checked={tumorOnly} onChange={setTumorOnly} />
          <Text>{t("components.single-cell.qc.tumor-only")}</Text>
        </Space>
      }
    >
      <div ref={ref}>
        <BoxStrips
          groups={groups}
          width={Math.max(400, width - 16)}
          height={300}
          yTitle={def?.[1]}
          log={Boolean(def?.[2])}
          flagged={flagged}
          onPoint={(g, k) => onOpenCell && onOpenCell(g.cells[k])}
        />
        <Text type="secondary" style={{ fontSize: 12 }}>
          {t("components.single-cell.qc.cohort-help", { count: flagged.size })}
        </Text>
      </div>
    </Card>
  );
}
