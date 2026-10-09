import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Card, Empty, Segmented, Select, Space, Switch, Table, Typography } from "antd";
import { BarChartOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import SvgExportButton from "../svgExportButton";
import { EVENT_CLASS_ORDER, eventClass } from "../../../helpers/singleCell/cohortStats";
import { isStrongEvent } from "../../../helpers/singleCell/strongEvents";
import { FONT, Swatches, XBandLabels, YAxis } from "./charts";
import { setPendingEvent } from "../pendingEventOpener";
import { INK, TYPE } from "../../../helpers/singleCell/plotTheme";
import { Provenance } from "../hintLine";

const { Text } = Typography;
const CLASS_COLORS = { amp: "#D7191C", homdel: "#2C7BB6", fusion: "#7B3294", trunc: "#1A1A1A", splice: "#E6AB02", missense: "#1B9E77", complex: "#E66101", other: "#8c8c8c" };
const HEIGHT = 320;

/**
 * Aggregate of the filtered events across patients. Pick genes (default:
 * the genes altered in most patients / cells); for each gene one group of
 * bars (one per patient) stacked by alteration class, as cells or % of
 * tumor cells. Below, the aggregated event table (gene x patient).
 */
export default function CohortGenePanel({ summaries, files, onOpen, onEvent = null }) {
  const { t } = useTranslation("common");
  const [ref, width] = useContainerWidth(1000);
  const [mode, setMode] = useState("fraction");
  const [strongOnly, setStrongOnly] = useState(true);
  const [maxTier, setMaxTier] = useState(2);
  const [picked, setPicked] = useState(null);

  // gene -> patient -> class -> { cells, fraction } (strongest event per class)
  const agg = useMemo(() => {
    const out = new Map();
    summaries.forEach((s) => {
      (files[s.caseReportId]?.events || []).forEach((e) => {
        if (Number(e.Tier ?? 9) > maxTier) return;
        if (strongOnly && !isStrongEvent(e)) return;
        const gene = e.gene || e.fusion_genes || e.name;
        if (!gene) return;
        const cls = eventClass(e);
        const n = Number(e.n_cells) || 0;
        const f = Number(e.cell_fraction) || 0;
        if (!out.has(gene)) out.set(gene, new Map());
        const byP = out.get(gene);
        if (!byP.has(s.caseReportId)) byP.set(s.caseReportId, {});
        const cur = byP.get(s.caseReportId)[cls];
        if (!cur || f > cur.fraction) byP.get(s.caseReportId)[cls] = { cells: n, fraction: f, event: e };
      });
    });
    return out;
  }, [summaries, files, strongOnly, maxTier]);
  const ranked = useMemo(
    () =>
      [...agg.entries()]
        .map(([gene, byP]) => ({
          gene,
          patients: byP.size,
          cells: d3.sum([...byP.values()], (c) => d3.max(Object.values(c), (x) => x.cells) || 0),
          maxFraction: d3.max([...byP.values()], (c) => d3.max(Object.values(c), (x) => x.fraction) || 0) || 0,
        }))
        .sort((a, b) => b.patients - a.patients || b.cells - a.cells),
    [agg]
  );
  const genes = picked ?? ranked.slice(0, 8).map((r) => r.gene);
  const patients = summaries.map((s) => s.caseReportId);
  if (!ranked.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.cohort.oncoprint-empty")} />;

  const M = { top: 16, right: 12, bottom: 64, left: 60 };
  const x0 = d3.scaleBand().domain(genes).range([M.left, width - M.right]).paddingInner(0.25);
  const x1 = d3.scaleBand().domain(patients).range([0, x0.bandwidth()]).padding(0.1);
  const valueOf = (c) => (mode === "fraction" ? c.fraction : c.cells);
  const stackTotal = (gene, p) => d3.sum(Object.values(agg.get(gene)?.get(p) || {}), valueOf);
  const ymax = d3.max(genes, (g) => d3.max(patients, (p) => stackTotal(g, p))) || 1;
  const y = d3.scaleLinear().domain([0, mode === "fraction" ? Math.min(1, ymax * 1.05) : ymax]).nice().range([HEIGHT - M.bottom, M.top]);
  const patientFill = d3.scaleOrdinal(d3.schemeTableau10).domain(patients);
  const pct = d3.format(".0%");

  const columns = [
    { title: t("components.single-cell.results.gene"), dataIndex: "gene", key: "gene", fixed: "left", width: 120, render: (g) => <Text strong>{g}</Text> },
    { title: t("components.single-cell.cohort.patients"), dataIndex: "patients", key: "patients", width: 80, sorter: (a, b) => a.patients - b.patients, defaultSortOrder: "descend" },
    { title: t("components.single-cell.cohort.cells"), dataIndex: "cells", key: "cells", width: 80, sorter: (a, b) => a.cells - b.cells },
    ...patients.map((p) => ({
      title: p,
      key: p,
      width: 150,
      render: (_, r) => {
        const byClass = agg.get(r.gene)?.get(p);
        if (!byClass) return <Text type="secondary">–</Text>;
        return (
          <Space size={2} wrap>
            {Object.entries(byClass).map(([cls, c]) => (
              <span key={cls} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 13 }}>
                <span style={{ width: 8, height: 8, background: CLASS_COLORS[cls], borderRadius: 2 }} />
                {`${c.cells} (${pct(c.fraction)})`}
              </span>
            ))}
          </Space>
        );
      },
    })),
  ];

  return (
    <Card
      size="small"
      title={<Space><BarChartOutlined />{t("components.single-cell.cohort.genes-title")}<Provenance id="oncoprint" /></Space>}
      extra={
        <Space wrap>
          <Select
            size="small"
            mode="multiple"
            showSearch
            maxTagCount="responsive"
            style={{ minWidth: 300, maxWidth: 560 }}
            value={genes}
            onChange={(v) => setPicked(v)}
            options={ranked.map((r) => ({ value: r.gene, label: `${r.gene} (${r.patients} pt · ${r.cells} cells)` }))}
            filterOption={(input, o) => o.label.toUpperCase().includes(input.toUpperCase())}
          />
          <Segmented size="small" value={mode} onChange={setMode} options={[{ value: "fraction", label: t("components.single-cell.cohort.genes-fraction") }, { value: "cells", label: t("components.single-cell.cohort.genes-cells") }]} />
          <Text type="secondary">{t("components.single-cell.cohort.oncoprint-tier")}</Text>
          <Select size="small" value={maxTier} onChange={setMaxTier} style={{ width: 80 }} options={[1, 2, 3].map((v) => ({ value: v, label: `≤ ${v}` }))} />
          <Switch size="small" checked={strongOnly} onChange={setStrongOnly} />
          <Text>{t("components.single-cell.events.strong-only")}</Text>
          <SvgExportButton containerRef={ref} name="cohort-genes" />
        </Space>
      }
    >
      <div ref={ref}>
        <svg width={width} height={HEIGHT}>
          <YAxis scale={y} x0={M.left} x1={width - M.right} title={mode === "fraction" ? t("components.single-cell.cohort.genes-y-fraction") : t("components.single-cell.cohort.genes-y-cells")} format={mode === "fraction" ? d3.format(".0%") : d3.format("~s")} />
          {genes.map((g) => (
            <g key={g} transform={`translate(${x0(g)},0)`}>
              {patients.map((p) => {
                const byClass = agg.get(g)?.get(p) || {};
                let acc = 0;
                return (
                  <g
                    key={p}
                    style={{ cursor: "pointer" }}
                    onClick={() => {
                      const best = Object.values(byClass).sort((a, b) => b.fraction - a.fraction)[0];
                      const s = summaries.find((x) => x.caseReportId === p);
                      if (best && onEvent) return onEvent(s, best.event);
                      if (best) setPendingEvent(p, best.event);
                      return onOpen(s);
                    }}
                  >
                    <rect x={x1(p)} y={y.range()[1]} width={x1.bandwidth()} height={y.range()[0] - y.range()[1]} fill={patientFill(p)} fillOpacity={0.06} />
                    {EVENT_CLASS_ORDER.filter((cls) => byClass[cls]).map((cls) => {
                      const v = valueOf(byClass[cls]);
                      const yTop = y(acc + v);
                      const h = y(acc) - yTop;
                      acc += v;
                      return (
                        <rect key={cls} x={x1(p)} y={yTop} width={x1.bandwidth()} height={Math.max(0, h)} fill={CLASS_COLORS[cls]} stroke={INK.panel} strokeWidth={0.5}>
                          <title>{`${g} · ${p} · ${t(`components.single-cell.cohort.class-${cls}`)}: ${byClass[cls].cells} cells (${pct(byClass[cls].fraction)})`}</title>
                        </rect>
                      );
                    })}
                    <text x={x1(p) + x1.bandwidth() / 2} y={HEIGHT - M.bottom + 12} textAnchor="middle" fontSize={TYPE.micro} fill={INK.muted} transform={`rotate(-50 ${x1(p) + x1.bandwidth() / 2} ${HEIGHT - M.bottom + 12})`}>{p}</text>
                  </g>
                );
              })}
            </g>
          ))}
          <XBandLabels scale={x0} y={HEIGHT - 8} />
          <text x={width - M.right} y={M.top - 4} textAnchor="end" fontSize={FONT.axis} fill={INK.muted}>{t("components.single-cell.cohort.genes-note")}</text>
        </svg>
        <Swatches items={EVENT_CLASS_ORDER.filter((c) => c !== "other").map((c) => ({ key: c, color: CLASS_COLORS[c], label: t(`components.single-cell.cohort.class-${c}`) }))} />
        <Table size="small" rowKey="gene" columns={columns} dataSource={ranked} pagination={{ pageSize: 10, size: "small" }} scroll={{ x: true }} style={{ marginTop: 12 }} />
      </div>
    </Card>
  );
}
