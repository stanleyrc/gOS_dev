import React, { useMemo, useState } from "react";
import { Button, Input, Select, Space, Table, Typography } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import { tableTsv } from "../../../helpers/singleCell/paperSidecar";

const { Text } = Typography;

const download = (text, name) => {
  const url = URL.createObjectURL(new Blob([text], { type: "text/tab-separated-values;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/**
 * The data behind a figure panel: one of its tables (plot data frames, row areas), sortable by any column,
 * filtered by a text search over every column, downloadable as TSV (the whole table, not only the filtered rows
 * when no filter is set).
 */
export default function PanelDataTable({ tables, name = "panel" }) {
  const [k, setK] = useState(0);
  const [q, setQ] = useState("");
  const t = tables[Math.min(k, tables.length - 1)];
  const rows = useMemo(() => {
    if (!t) return [];
    const needle = q.trim().toLowerCase();
    return t.rows
      .map((r, i) => ({ key: i, ...Object.fromEntries(t.columns.map((c, j) => [`c${j}`, r[j]])) }))
      .filter((r) => !needle || t.columns.some((_, j) => `${r[`c${j}`] ?? ""}`.toLowerCase().includes(needle)));
  }, [t, q]);
  if (!t) return <Text type="secondary">not available (no data table exported for this panel)</Text>;
  const columns = t.columns.map((c, j) => ({
    title: c,
    dataIndex: `c${j}`,
    key: `c${j}`,
    sorter: (a, b) => {
      const x = a[`c${j}`];
      const y = b[`c${j}`];
      if (typeof x === "number" && typeof y === "number") return x - y;
      return `${x ?? ""}`.localeCompare(`${y ?? ""}`, undefined, { numeric: true });
    },
    render: (v) => (typeof v === "number" ? Number(v.toPrecision(5)) : v == null ? "–" : `${v}`),
  }));
  return (
    <div>
      <Space wrap style={{ marginBottom: 6 }}>
        {tables.length > 1 && <Select size="small" value={Math.min(k, tables.length - 1)} onChange={setK} options={tables.map((x, i) => ({ value: i, label: x.title || `table ${i + 1}` }))} style={{ minWidth: 200 }} />}
        <Input.Search size="small" allowClear placeholder="filter rows" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
        <Text type="secondary">{`${rows.length.toLocaleString()} of ${t.rows.length.toLocaleString()} rows · ${t.columns.length} columns`}</Text>
        <Button size="small" icon={<DownloadOutlined />} onClick={() => download(tableTsv(q ? { columns: t.columns, rows: rows.map((r) => t.columns.map((_, j) => r[`c${j}`])) } : t), `${name}.tsv`)}>
          TSV
        </Button>
      </Space>
      <Table size="small" columns={columns} dataSource={rows} pagination={{ pageSize: 25, showSizeChanger: true }} scroll={{ x: true }} />
    </div>
  );
}
