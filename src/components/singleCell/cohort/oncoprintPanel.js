import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Card, Empty, InputNumber, Select, Space, Switch, Typography } from "antd";
import { TableOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import { EVENT_CLASS_ORDER, oncoprintMatrix } from "../../../helpers/singleCell/cohortStats";
import { isStrongEvent } from "../../../helpers/singleCell/strongEvents";
import { FONT, Swatches } from "./charts";

const { Text } = Typography;
const CLASS_COLORS = { amp: "#D7191C", homdel: "#2C7BB6", fusion: "#7B3294", trunc: "#1A1A1A", splice: "#E6AB02", missense: "#1B9E77", other: "#8c8c8c" };
const CELL_W = 64;
const CELL_H = 22;
const GENE_W = 120;

/**
 * Oncoprint across patients: genes x patients, each cell shaded by the
 * fraction of tumor cells carrying the strongest alteration, coloured by
 * its class. Several classes in one gene/patient draw as stacked stripes.
 */
export default function OncoprintPanel({ summaries, files, onOpen }) {
  const { t } = useTranslation("common");
  const [ref, width] = useContainerWidth(900);
  const [maxTier, setMaxTier] = useState(2);
  const [strongOnly, setStrongOnly] = useState(true);
  const [maxGenes, setMaxGenes] = useState(40);
  const eventsByPatient = useMemo(
    () => Object.fromEntries(summaries.filter((s) => files[s.caseReportId]?.events).map((s) => [s.caseReportId, files[s.caseReportId].events])),
    [summaries, files]
  );
  const matrix = useMemo(
    () => oncoprintMatrix(eventsByPatient, { maxTier, maxGenes, filter: strongOnly ? isStrongEvent : null }),
    [eventsByPatient, maxTier, maxGenes, strongOnly]
  );
  if (!matrix.patients.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.cohort.oncoprint-empty")} />;

  const patients = matrix.patients;
  const cellW = Math.max(40, Math.min(CELL_W, (width - GENE_W - 24) / Math.max(1, patients.length)));
  const svgW = GENE_W + cellW * patients.length + 12;
  const top = 70;
  const svgH = top + CELL_H * matrix.genes.length + 8;
  const alpha = d3.scaleLinear().domain([0, 1]).range([0.18, 1]);
  const summaryOf = (p) => summaries.find((s) => s.caseReportId === p);
  // per-patient count of altered genes shown, as a header bar
  const perPatient = Object.fromEntries(patients.map((p) => [p, matrix.genes.filter((g) => g.cells[p]).length]));
  const barMax = Math.max(1, ...Object.values(perPatient));

  return (
    <Card
      size="small"
      title={<Space><TableOutlined />{t("components.single-cell.cohort.oncoprint-title")}</Space>}
      extra={
        <Space wrap>
          <Text type="secondary">{t("components.single-cell.cohort.oncoprint-tier")}</Text>
          <Select size="small" value={maxTier} onChange={setMaxTier} style={{ width: 90 }} options={[1, 2, 3].map((v) => ({ value: v, label: `≤ ${v}` }))} />
          <Text type="secondary">{t("components.single-cell.cohort.oncoprint-genes")}</Text>
          <InputNumber size="small" min={5} max={200} value={maxGenes} onChange={(v) => setMaxGenes(v || 40)} style={{ width: 70 }} />
          <Switch size="small" checked={strongOnly} onChange={setStrongOnly} />
          <Text>{t("components.single-cell.events.strong-only")}</Text>
        </Space>
      }
    >
      <div ref={ref} style={{ overflowX: "auto" }}>
        <svg width={svgW} height={svgH}>
          {patients.map((p, j) => {
            const x = GENE_W + j * cellW;
            const h = (perPatient[p] / barMax) * 28;
            return (
              <g key={p} style={{ cursor: "pointer" }} onClick={() => onOpen(summaryOf(p))}>
                <rect x={x + 4} y={32 - h} width={cellW - 8} height={h} fill="#BAB0AC" />
                <text x={x + cellW / 2} y={30 - h - 3} textAnchor="middle" fontSize={11} fill="#595959">{perPatient[p]}</text>
                <text x={x + cellW / 2} y={top - 10} textAnchor="middle" fontSize={FONT.label} fontWeight="600" fill="#262626">
                  {p}
                </text>
              </g>
            );
          })}
          {matrix.genes.map((g, i) => {
            const y = top + i * CELL_H;
            return (
              <g key={g.gene}>
                <text x={GENE_W - 8} y={y + CELL_H / 2} dy="0.35em" textAnchor="end" fontSize={FONT.axis} fill="#262626">
                  {g.gene.length > 16 ? `${g.gene.slice(0, 15)}…` : g.gene}
                  <title>{g.gene}</title>
                </text>
                <text x={GENE_W - 8} y={y + CELL_H / 2} dy="0.35em" textAnchor="start" fontSize={10} fill="#8c8c8c" transform={`translate(${cellW * patients.length + 14},0)`}>
                  {`${g.nPatients}/${patients.length}`}
                </text>
                {patients.map((p, j) => {
                  const x = GENE_W + j * cellW;
                  const cell = g.cells[p];
                  const classes = cell ? [...new Set(cell.all.map((e) => e.class))].sort((a, b) => EVENT_CLASS_ORDER.indexOf(a) - EVENT_CLASS_ORDER.indexOf(b)) : [];
                  const stripeH = classes.length ? (CELL_H - 4) / classes.length : 0;
                  return (
                    <g key={p} style={{ cursor: cell ? "pointer" : undefined }} onClick={() => cell && onOpen(summaryOf(p))}>
                      <rect x={x + 2} y={y + 2} width={cellW - 4} height={CELL_H - 4} fill="#f5f5f5" rx={2} />
                      {classes.map((c, k) => {
                        const e = cell.all.filter((a) => a.class === c).sort((a, b) => (b.fraction ?? 0) - (a.fraction ?? 0))[0];
                        return (
                          <rect key={c} x={x + 2} y={y + 2 + k * stripeH} width={cellW - 4} height={stripeH} fill={CLASS_COLORS[c]} fillOpacity={alpha(e.fraction ?? 1)} rx={classes.length === 1 ? 2 : 0} />
                        );
                      })}
                      {cell && cell.fraction != null && (
                        <text x={x + cellW / 2} y={y + CELL_H / 2} dy="0.35em" textAnchor="middle" fontSize={10} fill={cell.fraction > 0.5 ? "#fff" : "#262626"} pointerEvents="none">
                          {d3.format(".0%")(cell.fraction)}
                        </text>
                      )}
                      {cell && (
                        <title>
                          {cell.all
                            .map((e) => `${e.event.type || e.class}${e.event.Variant ? ` ${e.event.Variant}` : ""}: ${e.cells || ""}${e.fraction != null ? ` (${d3.format(".0%")(e.fraction)})` : ""}`)
                            .join("\n")}
                        </title>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
        <Swatches
          style={{ marginTop: 6 }}
          items={EVENT_CLASS_ORDER.filter((c) => c !== "other").map((c) => ({ key: c, color: CLASS_COLORS[c], label: t(`components.single-cell.cohort.class-${c}`) }))}
        />
        <Text type="secondary" style={{ fontSize: 12 }}>{t("components.single-cell.cohort.oncoprint-help")}</Text>
      </div>
    </Card>
  );
}
