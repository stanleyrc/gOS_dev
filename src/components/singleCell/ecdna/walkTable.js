import React from "react";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Checkbox, InputNumber, Space, Table, Tag, Typography } from "antd";
import HintLine from "../hintLine";

const { Text } = Typography;
const fmtBp = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(2)} Mb` : v >= 1e3 ? `${(v / 1e3).toFixed(0)} kb` : `${v} bp`);

/** Filter toolbar + table of walks; ticked rows are the walks shown on the tree, clicking a name focuses its diagram. */
export default function WalkTable({ walks, total, filters, setFilters, colorOf, selected, onSelect, focus, onFocus, nCells }) {
  const { t } = useTranslation("common");
  const set = (k) => (v) => setFilters({ ...filters, [k]: v });
  const columns = [
    { title: t("components.single-cell.ecdna.col-walk"), dataIndex: "label", width: 160, render: (v, w) => <Space size={6}><span style={{ width: 10, height: 10, borderRadius: 5, background: colorOf(w.id), display: "inline-block" }} /><Text strong style={{ cursor: "pointer", color: focus === w.id ? "#fa541c" : undefined }} onClick={() => onFocus(w.id)}>{v}</Text>{w.curated && <Tag color="green" style={{ margin: 0 }}>{t("components.single-cell.ecdna.curated")}</Tag>}</Space> },
    { title: t("components.single-cell.ecdna.col-genes"), dataIndex: "genes", render: (g) => (g || []).length ? (g || []).map((x) => <Tag key={x} style={{ margin: 1 }}>{x}</Tag>) : <Text type="secondary">–</Text> },
    { title: t("components.single-cell.ecdna.col-shape"), key: "shape", width: 90, render: (_, w) => (w.circular ? t("components.single-cell.ecdna.circular") : t("components.single-cell.ecdna.linear")) },
    { title: t("components.single-cell.ecdna.col-span"), dataIndex: "span", width: 90, sorter: (a, b) => a.span - b.span, render: fmtBp },
    { title: t("components.single-cell.ecdna.col-nodes"), dataIndex: "n_nodes", width: 70, sorter: (a, b) => a.n_nodes - b.n_nodes },
    { title: t("components.single-cell.ecdna.col-cells"), key: "cells", width: 110, sorter: (a, b) => a.stats.ncells - b.stats.ncells, defaultSortOrder: "descend", render: (_, w) => `${w.stats.ncells} (${d3.format(".0%")(w.stats.fraction)})` },
    { title: t("components.single-cell.ecdna.col-median"), key: "median", width: 90, sorter: (a, b) => a.stats.medianCn - b.stats.medianCn, render: (_, w) => w.stats.medianCn.toFixed(0) },
    { title: t("components.single-cell.ecdna.col-max"), key: "max", width: 70, render: (_, w) => w.stats.maxCn.toFixed(0) },
  ];
  return (
    <div>
      <Space wrap style={{ marginBottom: 8 }}>
        <Text type="secondary">{t("components.single-cell.ecdna.min-cells")}</Text>
        <InputNumber size="small" min={1} value={filters.minCells} onChange={(v) => set("minCells")(v ?? 1)} style={{ width: 70 }} />
        <Text type="secondary">{t("components.single-cell.ecdna.min-median")}</Text>
        <InputNumber size="small" min={0} value={filters.minMedianCn} onChange={(v) => set("minMedianCn")(v ?? 0)} style={{ width: 70 }} />
        <Text type="secondary">{t("components.single-cell.ecdna.min-cn")}</Text>
        <InputNumber size="small" min={1} value={filters.minCn} onChange={(v) => set("minCn")(v ?? 1)} style={{ width: 70 }} />
        <Checkbox checked={filters.curatedOnly} onChange={(e) => set("curatedOnly")(e.target.checked)}>{t("components.single-cell.ecdna.curated-only")}</Checkbox>
        <Checkbox checked={filters.circularOnly} onChange={(e) => set("circularOnly")(e.target.checked)}>{t("components.single-cell.ecdna.circular-only")}</Checkbox>
        <Checkbox checked={filters.driverOnly} onChange={(e) => set("driverOnly")(e.target.checked)}>{t("components.single-cell.ecdna.driver-only")}</Checkbox>
        <Text type="secondary">{t("components.single-cell.ecdna.showing", { shown: walks.length, total, cells: nCells })}</Text>
      </Space>
      <Table
        size="small"
        className="sc-events-table"
        rowKey="id"
        columns={columns}
        dataSource={walks}
        pagination={{ pageSize: 10, size: "small", hideOnSinglePage: true }}
        rowSelection={{ selectedRowKeys: selected, onChange: onSelect, columnWidth: 36 }}
        onRow={(w) => ({ onClick: () => onFocus(w.id) })}
      />
      <HintLine text={t("components.single-cell.ecdna.table-help")} />
    </div>
  );
}
