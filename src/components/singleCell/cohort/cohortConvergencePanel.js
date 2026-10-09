import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Card, Select, Space, Switch, Table, Tag, Typography } from "antd";
import { BranchesOutlined } from "@ant-design/icons";
import { eventClass } from "../../../helpers/singleCell/cohortStats";
import { isStrongEvent } from "../../../helpers/singleCell/strongEvents";
import { patientColor } from "./charts";
import HintLine from "../hintLine";

const { Text } = Typography;
const CLASS_COLORS = { amp: "#D7191C", homdel: "#2C7BB6", fusion: "#7B3294", trunc: "#1A1A1A", splice: "#E6AB02", missense: "#1B9E77", other: "#8c8c8c" };
const CLONALITY_COLORS = { clonal: "#237804", subclonal: "#d46b08", rare: "#8c8c8c" };
const clonalityOf = (f) => (f >= 0.85 ? "clonal" : f >= 0.1 ? "subclonal" : "rare");

/**
 * Convergent evolution: genes altered in several patients, with the
 * clonality of the alteration in each (clonal / subclonal / rare) and the
 * alteration class. Genes that are truncal in some patients and subclonal
 * in others, or subclonal in several, are the parallel events.
 */
export default function CohortConvergencePanel({ summaries, files, onEvent }) {
  const { t } = useTranslation("common");
  const [maxTier, setMaxTier] = useState(2);
  const [strongOnly, setStrongOnly] = useState(true);
  const [minPatients, setMinPatients] = useState(2);
  const rows = useMemo(() => {
    const byGene = new Map();
    summaries.forEach((s) => {
      (files[s.caseReportId]?.events || []).forEach((e) => {
        if (Number(e.Tier ?? 9) > maxTier || (strongOnly && !isStrongEvent(e))) return;
        const gene = `${e.gene || e.fusion_genes || ""}`.split("::")[0];
        if (!gene) return;
        const f = Number(e.cell_fraction) || 0;
        if (!byGene.has(gene)) byGene.set(gene, new Map());
        const m = byGene.get(gene);
        const cur = m.get(s.caseReportId);
        if (!cur || f > cur.fraction) m.set(s.caseReportId, { fraction: f, cls: eventClass(e), event: e, summary: s });
      });
    });
    return [...byGene.entries()]
      .map(([gene, m]) => {
        const per = [...m.values()];
        const clon = per.map((p) => clonalityOf(p.fraction));
        return {
          gene,
          nPatients: per.length,
          nClonal: clon.filter((c) => c === "clonal").length,
          nSubclonal: clon.filter((c) => c === "subclonal").length,
          classes: [...new Set(per.map((p) => p.cls))],
          per: m,
          pattern: clon.every((c) => c === "clonal") ? "truncal-everywhere" : clon.filter((c) => c === "subclonal").length >= 2 ? "parallel-subclonal" : clon.includes("clonal") && clon.includes("subclonal") ? "mixed" : "other",
        };
      })
      .filter((r) => r.nPatients >= minPatients)
      .sort((a, b) => b.nPatients - a.nPatients || b.nSubclonal - a.nSubclonal || a.gene.localeCompare(b.gene));
  }, [summaries, files, maxTier, strongOnly, minPatients]);
  const pct = d3.format(".0%");
  const columns = [
    { title: t("components.single-cell.results.gene"), dataIndex: "gene", width: 120, render: (g, r) => <Space size={4}>{r.classes.map((c) => <span key={c} style={{ width: 8, height: 8, borderRadius: 2, background: CLASS_COLORS[c], display: "inline-block" }} />)}<Text strong>{g}</Text></Space> },
    { title: t("components.single-cell.cohort.conv-pattern"), dataIndex: "pattern", width: 170, filters: ["truncal-everywhere", "parallel-subclonal", "mixed", "other"].map((p) => ({ text: t(`components.single-cell.cohort.conv-${p}`), value: p })), onFilter: (v, r) => r.pattern === v, render: (p) => <Tag color={p === "parallel-subclonal" ? "volcano" : p === "truncal-everywhere" ? "green" : p === "mixed" ? "gold" : "default"}>{t(`components.single-cell.cohort.conv-${p}`)}</Tag> },
    { title: t("components.single-cell.cohort.patients"), dataIndex: "nPatients", width: 90, sorter: (a, b) => a.nPatients - b.nPatients },
    ...summaries.map((s, k) => ({
      title: <span style={{ color: patientColor(k) }}>{s.caseReportId}</span>,
      key: s.caseReportId,
      width: 130,
      render: (_, r) => {
        const p = r.per.get(s.caseReportId);
        if (!p) return <Text type="secondary">–</Text>;
        const c = clonalityOf(p.fraction);
        return (
          <Tag color={CLONALITY_COLORS[c]} style={{ cursor: "pointer" }} onClick={() => onEvent && onEvent(p.summary, p.event)}>
            {`${t(`components.single-cell.cohort.conv-${c}`)} ${pct(p.fraction)}`}
          </Tag>
        );
      },
    })),
  ];
  return (
    <Card
      size="small"
      title={<Space><BranchesOutlined />{t("components.single-cell.cohort.conv-title", { count: rows.length })}</Space>}
      extra={
        <Space wrap>
          <Text type="secondary">{t("components.single-cell.cohort.oncoprint-tier")}</Text>
          <Select size="small" value={maxTier} onChange={setMaxTier} style={{ width: 80 }} options={[1, 2, 3].map((v) => ({ value: v, label: `≤ ${v}` }))} />
          <Text type="secondary">{t("components.single-cell.cohort.conv-min")}</Text>
          <Select size="small" value={minPatients} onChange={setMinPatients} style={{ width: 70 }} options={[1, 2, 3, 4].map((v) => ({ value: v, label: `≥ ${v}` }))} />
          <Switch size="small" checked={strongOnly} onChange={setStrongOnly} />
          <Text>{t("components.single-cell.events.strong-only")}</Text>
        </Space>
      }
      bodyStyle={{ padding: 0 }}
    >
      <Table size="small" className="sc-events-table" rowKey="gene" columns={columns} dataSource={rows} pagination={{ pageSize: 15, size: "small" }} scroll={{ x: true }} />
      <HintLine text={t("components.single-cell.cohort.conv-help")} />
    </Card>
  );
}
