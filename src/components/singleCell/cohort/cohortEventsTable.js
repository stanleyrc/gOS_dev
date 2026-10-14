import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Card, Input, Select, Space, Switch, Table, Typography } from "antd";
import { UnorderedListOutlined } from "@ant-design/icons";
import { EVENT_CLASS_ORDER, eventClass, eventLabel } from "../../../helpers/singleCell/cohortStats";
import { isStrongEvent } from "../../../helpers/singleCell/strongEvents";
import { INK } from "../../../helpers/singleCell/plotTheme";
import { Provenance } from "../hintLine";
import { DataSwatch } from "../neutralTag";
import useMultiSort from "./multiSort";

const { Text } = Typography;
const CLASS_COLORS = { amp: "#D7191C", homdel: "#2C7BB6", fusion: "#7B3294", trunc: "#1A1A1A", splice: "#E6AB02", missense: "#1B9E77", complex: "#E66101", other: "#8c8c8c" };
const pct = d3.format(".0%");

/**
 * Every patient's filtered events in one table: patient, gene, alteration
 * class, variant, tier, role, effect, and the carrier cells as a bar.
 * Filters by tier / class / strong events / text; click a row for the popup.
 */
export default function CohortEventsTable({ summaries, files, onEvent }) {
  const { t } = useTranslation("common");
  const [maxTier, setMaxTier] = useState(2);
  const [classes, setClasses] = useState([]);
  const [strongOnly, setStrongOnly] = useState(true);
  const [query, setQuery] = useState("");
  const rows = useMemo(
    () =>
      summaries.flatMap((s, k) =>
        (files[s.caseReportId]?.events || []).map((e, i) => ({
          key: `${s.caseReportId}-${i}`,
          summary: s,
          k,
          patient: s.caseReportId,
          event: e,
          gene: eventLabel(e),
          cls: eventClass(e),
          variant: e.Variant && e.Variant !== "None" ? e.Variant : e.Variant_g || "",
          tier: Number(e.Tier ?? 9),
          role: e.role && e.role !== "None" ? e.role : "",
          effect: e.effect && e.effect !== "None" ? e.effect : "",
          nCells: Number(e.n_cells) || 0,
          fraction: Number(e.cell_fraction) || 0,
          cells: e.cells || "",
          strong: isStrongEvent(e),
        }))
      ),
    [summaries, files]
  );
  const q = query.trim().toUpperCase();
  const shown = rows.filter((r) => r.tier <= maxTier && (!classes.length || classes.includes(r.cls)) && (!strongOnly || r.strong) && (!q || `${r.gene} ${r.variant} ${r.role} ${r.effect}`.toUpperCase().includes(q)));
  const baseColumns = [
    { title: t("components.single-cell.cohort.patient"), dataIndex: "patient", width: 110, sortable: true, filters: summaries.map((s) => ({ text: s.caseReportId, value: s.caseReportId })), onFilter: (v, r) => r.patient === v, render: (p) => <Text strong>{p}</Text> },
    { title: t("components.single-cell.results.gene"), dataIndex: "gene", width: 150, sortable: true, render: (g) => <Text strong>{g}</Text> },
    { title: t("components.single-cell.cohort.ev-class"), dataIndex: "cls", width: 160, sortable: true, sortValue: (r) => EVENT_CLASS_ORDER.indexOf(r.cls), render: (c) => <DataSwatch color={CLASS_COLORS[c]}>{t(`components.single-cell.cohort.class-${c}`, { defaultValue: c })}</DataSwatch> },
    { title: t("components.single-cell.cohort.ev-variant"), dataIndex: "variant", ellipsis: true, sortable: true, render: (v) => <Text type="secondary" style={{ fontSize: 13 }}>{v}</Text> },
    { title: "Tier", dataIndex: "tier", width: 64, sortable: true, render: (v) => (v <= 3 ? v : "–") },
    { title: t("components.single-cell.report.col-role"), dataIndex: "role", width: 140, sortable: true, render: (v) => (v ? <Text type="secondary">{v}</Text> : "–") },
    { title: t("components.single-cell.cohort.ev-effect"), dataIndex: "effect", width: 170, ellipsis: true, sortable: true },
    {
      title: t("components.single-cell.report.col-cells"),
      dataIndex: "fraction",
      width: 200,
      sortable: true,
      firstDir: "desc",
      render: (f, r) => (
        <Space size={6}>
          <svg width={90} height={10}>
            <rect x={0} y={0} width={90} height={10} fill={INK.empty} rx={2} />
            <rect x={0} y={0} width={90 * f} height={10} fill={CLASS_COLORS[r.cls]} rx={2} />
          </svg>
          <Text style={{ fontSize: 13, whiteSpace: "nowrap" }}>{`${r.cells} (${pct(f)})`}</Text>
        </Space>
      ),
    },
  ];
  const sort = useMultiSort(baseColumns, shown, [{ key: "fraction", dir: "desc" }]);
  return (
    <Card
      size="small"
      title={<Space><UnorderedListOutlined />{t("components.single-cell.cohort.events-title", { count: shown.length, total: rows.length })}<Provenance id="cohortEvents" /></Space>}
      extra={
        <Space wrap>
          <Input.Search size="small" allowClear placeholder={t("components.single-cell.cohort.ev-search")} style={{ width: 200 }} onChange={(e) => setQuery(e.target.value)} />
          <Text type="secondary">{t("components.single-cell.cohort.oncoprint-tier")}</Text>
          <Select size="small" value={maxTier} onChange={setMaxTier} style={{ width: 80 }} options={[1, 2, 3].map((v) => ({ value: v, label: `≤ ${v}` }))} />
          <Select size="small" mode="multiple" allowClear placeholder={t("components.single-cell.cohort.ev-class")} style={{ minWidth: 180 }} value={classes} onChange={setClasses} options={EVENT_CLASS_ORDER.filter((c) => c !== "other").map((c) => ({ value: c, label: t(`components.single-cell.cohort.class-${c}`) }))} maxTagCount="responsive" />
          <Switch size="small" checked={strongOnly} onChange={setStrongOnly} />
          <Text>{t("components.single-cell.events.strong-only")}</Text>
        </Space>
      }
      bodyStyle={{ padding: 0 }}
    >
      <div style={{ padding: "4px 12px" }}>{sort.hint}</div>
      <Table
        size="small"
        className="sc-events-table"
        rowKey="key"
        columns={sort.columns}
        dataSource={sort.rows}
        pagination={{ pageSize: 25, size: "small", showSizeChanger: true }}
        onRow={(r) => ({ onClick: () => onEvent(r.summary, r.event), style: { cursor: "pointer" } })}
        scroll={{ x: 1100 }}
      />
    </Card>
  );
}
