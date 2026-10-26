import React, { useMemo, useState } from "react";
import { Alert, Button, Card, Input, InputNumber, Select, Space, Switch, Table, Tag, Typography } from "antd";
import { DownloadOutlined, UnorderedListOutlined } from "@ant-design/icons";
import { CATALOG_TYPES, TYPE_LABEL, UNAVAILABLE_TYPES, buildPatientRows, catalogLinkQuery, catalogToCsv, countOmittedNoncoding, countsByType, emptyCatalogFilters, filterCatalogRows, missingSources, sortCatalogRows } from "../../../helpers/singleCell/eventsCatalog";
import { DataSwatch } from "../neutralTag";
import { INK } from "../../../helpers/singleCell/plotTheme";

const { Text } = Typography;
const TYPE_COLORS = { amp: "#D7191C", homdel: "#2C7BB6", cnother: "#8c8c8c", armgain: "#E8837C", armloss: "#74ADD1", junction: "#5B7083", snv: "#1B9E77", fusion: "#7B3294", rnafusion: "#B58BD0", complex: "#E66101", ecdna: "#C2185B" };
const SCROLL_Y = 560;
const pct = (f) => (Number.isFinite(f) ? `${(100 * f).toFixed(f < 0.1 ? 1 : 0)}%` : "");

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Searchable events table shared by the cohort "Events catalog" view and the per-patient Events tab: copy-number events, SNVs,
 * fusions (DNA, RNA), complex SVs and ecDNA walks, one row each. Virtualised (antd Table virtual), so thousands of rows scroll.
 * @param filesByPatient { patientId: { events, variants, walks, rnaFusions, tree } | null while loading }
 * @param onOpen optional (row) => void; without it the link opens the report in a new tab
 */
export default function EventsCatalogTable({ filesByPatient, patients, datasetKey = "gbm-sc", scope = "cohort", onOpen = null, loading = false, versionToggle = null }) {
  const [filters, setFilters] = useState(emptyCatalogFilters());
  const [includeNoncoding, setIncludeNoncoding] = useState(false);
  const [sort, setSort] = useState({ key: "nCells", dir: "desc" });
  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));
  const ids = patients || Object.keys(filesByPatient);
  const rows = useMemo(() => ids.flatMap((id) => (filesByPatient[id] ? buildPatientRows(id, filesByPatient[id], { includeNoncoding }) : [])), [filesByPatient, ids.join("|"), includeNoncoding]); // eslint-disable-line react-hooks/exhaustive-deps
  const omitted = useMemo(() => ids.reduce((n, id) => n + countOmittedNoncoding(filesByPatient[id] || {}, includeNoncoding), 0), [filesByPatient, ids.join("|"), includeNoncoding]); // eslint-disable-line react-hooks/exhaustive-deps
  const missing = useMemo(() => ids.flatMap((id) => (filesByPatient[id] ? missingSources(filesByPatient[id]).map((m) => ({ ...m, patient: id })) : [])), [filesByPatient, ids.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => sortCatalogRows(filterCatalogRows(rows, filters), sort.key, sort.dir), [rows, filters, sort]);
  const counts = useMemo(() => countsByType(rows), [rows]);
  const nLoaded = ids.filter((id) => filesByPatient[id]).length;
  const onSort = (key) => (sort.key === key ? setSort({ key, dir: sort.dir === "desc" ? "asc" : "desc" }) : setSort({ key, dir: key === "patient" || key === "gene" || key === "type" || key === "locus" ? "asc" : "desc" }));
  const head = (key, title) => ({ title, sorter: true, sortOrder: sort.key === key ? (sort.dir === "asc" ? "ascend" : "descend") : null, onHeaderCell: () => ({ onClick: () => onSort(key) }) });
  const columns = [
    ...(scope === "cohort" ? [{ ...head("patient", "Patient"), dataIndex: "patient", width: 100, render: (p) => <Text strong>{p}</Text> }] : []),
    { ...head("type", "Type"), dataIndex: "type", width: 190, render: (t) => <DataSwatch color={TYPE_COLORS[t]}>{TYPE_LABEL[t]}</DataSwatch> },
    { ...head("gene", "Gene(s)"), dataIndex: "gene", width: 170, render: (g) => (g ? <Text strong>{g}</Text> : <Text type="secondary">intergenic / unnamed</Text>) },
    { ...head("locus", "Locus"), dataIndex: "locus", width: 190, ellipsis: true, render: (v) => <Text type="secondary" style={{ fontSize: 13 }}>{v}</Text> },
    { title: "Detail", dataIndex: "detail", width: 260, ellipsis: true, render: (v) => <Text type="secondary" style={{ fontSize: 13 }}>{v}</Text> },
    {
      ...head("nCells", "Cells"),
      dataIndex: "nCells",
      width: 190,
      render: (n, r) => (
        <Space size={6}>
          <svg width={70} height={10}>
            <rect x={0} y={0} width={70} height={10} fill={INK.empty} rx={2} />
            <rect x={0} y={0} width={70 * Math.min(1, Number.isFinite(r.fraction) ? r.fraction : 0)} height={10} fill={TYPE_COLORS[r.type]} rx={2} />
          </svg>
          <Text style={{ fontSize: 13, whiteSpace: "nowrap" }}>{Number.isFinite(r.fraction) ? `${n.toLocaleString("en-US")} (${pct(r.fraction)})` : n.toLocaleString("en-US")}</Text>
        </Space>
      ),
    },
    { ...head("clonality", "Clonality"), dataIndex: "clonality", width: 110, render: (v) => (v ? <Text type={v === "clonal" ? undefined : "secondary"}>{v}</Text> : "–") },
    { title: "Clade", dataIndex: "clade", width: 150, ellipsis: true, render: (v) => v || "–" },
    { ...head("tier", "Tier"), dataIndex: "tier", width: 70, render: (v, r) => (v != null ? v : r.driver ? "driver" : "–") },
    { ...head("driver", "Driver"), dataIndex: "driver", width: 96, render: (v) => (v ? <Tag color="volcano">driver</Tag> : "–") },
    {
      title: "Open",
      width: 90,
      render: (_v, r) => {
        const q = catalogLinkQuery(r, { dataset: datasetKey });
        return onOpen ? (
          <a href={`?${q}`} onClick={(e) => { e.preventDefault(); onOpen(r); }}>open</a>
        ) : (
          <a href={`?${q}`} target="_blank" rel="noopener noreferrer">open</a>
        );
      },
    },
  ];
  const totalWidth = columns.reduce((n, c) => n + c.width, 0);
  return (
    <Card
      size="small"
      title={<Space><UnorderedListOutlined />{`Events catalog: ${shown.length.toLocaleString("en-US")} of ${rows.length.toLocaleString("en-US")} events${scope === "cohort" ? ` in ${nLoaded} patients` : ""}`}</Space>}
      extra={
        <Space wrap>
          <Input.Search size="small" allowClear placeholder="Search gene, locus, type, patient" style={{ width: 240 }} onChange={(e) => set({ query: e.target.value })} />
          <Select size="small" mode="multiple" allowClear placeholder="Event types" style={{ minWidth: 220 }} value={filters.types} onChange={(types) => set({ types })} maxTagCount="responsive" options={counts.map((t) => ({ value: t.key, label: `${t.label} (${t.count.toLocaleString("en-US")})` }))} />
          <Text type="secondary">Min cells</Text>
          <InputNumber size="small" min={0} value={filters.minCells} style={{ width: 70 }} onChange={(v) => set({ minCells: v || 0 })} />
          <Switch size="small" checked={filters.driverOnly} onChange={(driverOnly) => set({ driverOnly })} />
          <Text>Drivers only</Text>
          <Switch size="small" checked={includeNoncoding} onChange={setIncludeNoncoding} />
          <Text>Include non-coding SNVs</Text>
          {versionToggle && (
            <>
              <Switch size="small" checked={versionToggle.checked} onChange={versionToggle.onChange} />
              <Text>Show report versions</Text>
            </>
          )}
          <Button size="small" icon={<DownloadOutlined />} disabled={!shown.length} onClick={() => download(`events_${scope === "cohort" ? "cohort" : ids[0] || "patient"}.csv`, catalogToCsv(shown))}>CSV ({shown.length.toLocaleString("en-US")})</Button>
        </Space>
      }
      bodyStyle={{ padding: 0 }}
    >
      <Table
        size="small"
        className="sc-events-catalog"
        rowKey="key"
        virtual
        loading={loading}
        columns={columns}
        dataSource={shown}
        pagination={false}
        scroll={{ x: totalWidth, y: SCROLL_Y }}
        locale={{ emptyText: loading ? "Loading events..." : "No events match the filters" }}
      />
      <div style={{ padding: "8px 12px", fontSize: 12.5 }}>
        <Text type="secondary">
          {omitted > 0 ? `${omitted.toLocaleString("en-US")} non-coding SNV sites are not listed (switch on "Include non-coding SNVs"). ` : ""}
          Cells = carrier cells; for SNV sites, the fraction is of cells with coverage. Clonality: exported call, else the carrier-cell fraction rule.
        </Text>
        {missing.length > 0 && (
          <Alert style={{ marginTop: 6 }} type="warning" showIcon message={`Missing source files: ${Array.from(new Set(missing.map((m) => `${m.patient}: ${m.reason}`))).slice(0, 6).join("; ")}${missing.length > 6 ? " ..." : ""}`} />
        )}
      </div>
    </Card>
  );
}
