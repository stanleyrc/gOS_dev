import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Card, Empty, Segmented, Space } from "antd";
import { BarChartOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import { callableMbOf, snvCategoryCounts } from "../../../helpers/singleCell/cohortStats";
import { cellsForPatient } from "../../../helpers/singleCell/cellFiles";
import { FONT, Swatches, XBandLabels, YAxis } from "./charts";
import HintLine, { Provenance } from "../hintLine";
import { INK } from "../../../helpers/singleCell/plotTheme";

const CATS = [
  ["truncal", "#2F6DB5"],
  ["subclonal", "#F28E2B"],
  ["private", "#BAB0AC"],
];
const HEIGHT = 300;

/**
 * Mutation burden per patient from the tree-mapped CellPhy-input SNV sites:
 * truncal (tumor MRCA), subclonal and private counts, stacked or as fractions.
 */
export default function TmbPanel({ summaries, files, datafiles = [], onOpen }) {
  const { t } = useTranslation("common");
  const [ref, width] = useContainerWidth(800);
  const [mode, setMode] = useState("count");
  const rows = useMemo(
    () =>
      summaries
        .map((s) => ({
          patient: s.caseReportId,
          summary: s,
          counts: files[s.caseReportId]?.variants ? snvCategoryCounts(files[s.caseReportId].variants) : null,
          callableMb: callableMbOf(cellsForPatient(datafiles, s.patientKey).filter((c) => !/^normal$/i.test(`${c.clone_id || ""}`))),
        }))
        .filter((r) => r.counts),
    [summaries, files, datafiles]
  );
  if (!rows.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.cohort.tmb-empty")} />;

  const M = { top: 12, right: 12, bottom: 56, left: 64 };
  const total = (c) => CATS.reduce((s, [k]) => s + (c[k] || 0), 0);
  const x = d3.scaleBand().domain(rows.map((r) => r.patient)).range([M.left, width - M.right]).padding(0.3);
  const perMb = (r, k) => (Number.isFinite(r.callableMb) && r.callableMb > 0 ? r.counts[k] / r.callableMb : 0);
  const totalPerMb = (r) => CATS.reduce((s, [k]) => s + perMb(r, k), 0);
  const ymax = mode === "count" ? d3.max(rows, (r) => total(r.counts)) || 1 : mode === "perMb" ? d3.max(rows, totalPerMb) || 1 : 1;
  const y = d3.scaleLinear().domain([0, ymax]).nice().range([HEIGHT - M.bottom, M.top]);
  const value = (r, k) => (mode === "count" ? r.counts[k] : mode === "perMb" ? perMb(r, k) : r.counts[k] / Math.max(1, total(r.counts)));
  const hasBreadth = rows.some((r) => Number.isFinite(r.callableMb));

  return (
    <Card
      size="small"
      title={<Space><BarChartOutlined />{t("components.single-cell.cohort.tmb-title")}<Provenance id="tmb" /></Space>}
      extra={
        <Segmented
          size="small"
          value={mode}
          onChange={setMode}
          options={[
            { value: "count", label: t("components.single-cell.cohort.tmb-count") },
            ...(hasBreadth ? [{ value: "perMb", label: t("components.single-cell.cohort.tmb-per-mb") }] : []),
            { value: "fraction", label: t("components.single-cell.cohort.tmb-fraction") },
          ]}
        />
      }
    >
      <div ref={ref}>
        <svg width={width} height={HEIGHT}>
          <YAxis scale={y} x0={M.left} x1={width - M.right} title={mode === "count" ? t("components.single-cell.cohort.tmb-y") : mode === "perMb" ? t("components.single-cell.cohort.tmb-y-per-mb") : t("components.single-cell.cohort.tmb-y-fraction")} format={mode === "fraction" ? d3.format(".0%") : d3.format("~g")} />
          {rows.map((r) => {
            let y0 = 0;
            return (
              <g key={r.patient} style={{ cursor: "pointer" }} onClick={() => onOpen(r.summary)}>
                {CATS.map(([k, color]) => {
                  const v = value(r, k);
                  const top = y(y0 + v);
                  const h = y(y0) - top;
                  y0 += v;
                  return (
                    <rect key={k} x={x(r.patient)} y={top} width={x.bandwidth()} height={Math.max(0, h)} fill={color}>
                      <title>{`${r.patient} · ${t(`components.single-cell.snv.category-${k}`)}: ${r.counts[k]} (${d3.format(".0%")(r.counts[k] / Math.max(1, total(r.counts)))})`}</title>
                    </rect>
                  );
                })}
                <text x={x(r.patient) + x.bandwidth() / 2} y={y(mode === "count" ? total(r.counts) : mode === "perMb" ? totalPerMb(r) : 1) - 4} textAnchor="middle" fontSize={FONT.axis} fill={INK.text}>
                  {mode === "count" ? d3.format(",")(total(r.counts)) : mode === "perMb" ? (Number.isFinite(r.callableMb) ? `${d3.format(".2f")(totalPerMb(r))}/Mb` : "n/a") : `${r.counts.truncal}`}
                </text>
              </g>
            );
          })}
          <XBandLabels scale={x} y={HEIGHT - M.bottom + 20} rotate={rows.length > 8} onClick={(p) => onOpen(rows.find((r) => r.patient === p)?.summary)} />
        </svg>
        <Swatches items={CATS.map(([k, color]) => ({ key: k, color, label: t(`components.single-cell.snv.category-${k}`) }))} />
        <HintLine text={t("components.single-cell.cohort.tmb-help")} />
      </div>
    </Card>
  );
}
