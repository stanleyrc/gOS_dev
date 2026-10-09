import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Card, Empty, Select, Space, Typography } from "antd";
import { DotChartOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import { PATIENT_METRICS, patientMetrics } from "../../../helpers/singleCell/cohortStats";
import { cellsForPatient } from "../../../helpers/singleCell/cellFiles";
import { spearman } from "../../../helpers/singleCell/dosage";
import { FONT, YAxis, patientColor } from "./charts";
import HintLine, { Provenance } from "../hintLine";
import { INK } from "../../../helpers/singleCell/plotTheme";

const { Text } = Typography;
const HEIGHT = 360;

/** Per-patient metrics against each other (one point per patient). */
export default function CohortScatterPanel({ summaries, files, datafiles, onOpen }) {
  const { t } = useTranslation("common");
  const [ref, width] = useContainerWidth(800);
  const [xKey, setXKey] = useState("truncal");
  const [yKey, setYKey] = useState("subclonal");
  const metrics = useMemo(
    () =>
      summaries.map((s) =>
        patientMetrics(s, {
          variants: files[s.caseReportId]?.variants || [],
          events: files[s.caseReportId]?.events || [],
          cells: cellsForPatient(datafiles, s.patientKey),
        })
      ),
    [summaries, files, datafiles]
  );
  const points = metrics.map((m, k) => ({ ...m, k, summary: summaries[k] })).filter((m) => Number.isFinite(m[xKey]) && Number.isFinite(m[yKey]));
  if (!summaries.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  const M = { top: 16, right: 16, bottom: 56, left: 72 };
  const x = d3.scaleLinear().domain([0, d3.max(points, (p) => p[xKey]) || 1]).nice().range([M.left, width - M.right]);
  const y = d3.scaleLinear().domain([0, d3.max(points, (p) => p[yKey]) || 1]).nice().range([HEIGHT - M.bottom, M.top]);
  const label = (k) => PATIENT_METRICS.find(([key]) => key === k)?.[1] || k;
  const rho = points.length >= 3 ? spearman(points.map((p) => p[xKey]), points.map((p) => p[yKey])) : NaN;
  const options = PATIENT_METRICS.map(([value, text]) => ({ value, label: text }));
  return (
    <Card
      size="small"
      title={<Space><DotChartOutlined />{t("components.single-cell.cohort.scatter-title")}<Provenance id="cohortScatter" /></Space>}
      extra={
        <Space>
          <Text type="secondary">x</Text>
          <Select size="small" style={{ width: 230 }} value={xKey} onChange={setXKey} options={options} />
          <Text type="secondary">y</Text>
          <Select size="small" style={{ width: 230 }} value={yKey} onChange={setYKey} options={options} />
        </Space>
      }
    >
      <div ref={ref}>
        <svg width={width} height={HEIGHT}>
          <YAxis scale={y} x0={M.left} x1={width - M.right} title={label(yKey)} format={d3.format("~g")} />
          {x.ticks(6).map((v) => (
            <g key={v} transform={`translate(${x(v)},0)`}>
              <line y1={M.top} y2={HEIGHT - M.bottom} stroke={INK.grid} />
              <text y={HEIGHT - M.bottom + 16} textAnchor="middle" fontSize={FONT.axis} fill={INK.textSecondary}>{d3.format("~g")(v)}</text>
            </g>
          ))}
          <text x={(M.left + width - M.right) / 2} y={HEIGHT - 10} textAnchor="middle" fontSize={FONT.label} fill={INK.text}>{label(xKey)}</text>
          {points.map((p) => (
            <g key={p.patient} style={{ cursor: "pointer" }} onClick={() => onOpen(p.summary)}>
              <circle cx={x(p[xKey])} cy={y(p[yKey])} r={7} fill={patientColor(p.k)} stroke={INK.panel} strokeWidth={1.5} />
              <text x={x(p[xKey]) + 10} y={y(p[yKey])} dy="0.35em" fontSize={FONT.axis} fill={INK.text}>{p.patient}</text>
              <title>{`${p.patient}\n${label(xKey)}: ${d3.format("~g")(p[xKey])}\n${label(yKey)}: ${d3.format("~g")(p[yKey])}`}</title>
            </g>
          ))}
          {Number.isFinite(rho) && (
            <text x={width - M.right} y={M.top + 4} textAnchor="end" fontSize={FONT.axis} fill={INK.textSecondary}>{`Spearman ρ = ${rho.toFixed(2)} (n = ${points.length})`}</text>
          )}
        </svg>
        <HintLine text={t("components.single-cell.cohort.scatter-help")} />
      </div>
    </Card>
  );
}
