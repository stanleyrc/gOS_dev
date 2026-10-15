import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Button, Card, Input, InputNumber, Select, Space, Switch, Table, Typography } from "antd";
import { FilterFilled, SearchOutlined, UnorderedListOutlined } from "@ant-design/icons";
import { EVENT_CLASS_ORDER, eventClass, eventLabel } from "../../../helpers/singleCell/cohortStats";
import { isStrongEvent } from "../../../helpers/singleCell/strongEvents";
import { INK } from "../../../helpers/singleCell/plotTheme";
import { Provenance } from "../hintLine";
import { DataSwatch } from "../neutralTag";
import useMultiSort from "./multiSort";
import { activeCount, decodeFilters, distinctValues, emptyFilters, encodeFilters, filterRows, setColumnFilter } from "../../../helpers/singleCell/eventFilters";

const { Text } = Typography;
const CLASS_COLORS = { amp: "#D7191C", homdel: "#2C7BB6", fusion: "#7B3294", trunc: "#1A1A1A", splice: "#E6AB02", missense: "#1B9E77", complex: "#E66101", other: "#8c8c8c" };
const pct = d3.format(".0%");
const EVF_PARAM = "evf";
const stop = (e) => e.stopPropagation();

// header dropdown: min / max range (scale converts the stored value to what the user types, e.g. 100 for percent)
function RangeDropdown({ value, onChange, scale = 1, unit = "", label }) {
  const [lo, hi] = value || [null, null];
  const show = (v) => (v == null ? null : Math.round(v * scale * 1e6) / 1e6);
  const emit = (a, b) => onChange([a == null ? null : a / scale, b == null ? null : b / scale]);
  return (
    <div style={{ padding: 8, width: 210 }} onClick={stop} onKeyDown={stop}>
      <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>
      <Space style={{ marginTop: 4 }}>
        <InputNumber size="small" placeholder="min" value={show(lo)} addonAfter={unit || null} style={{ width: 90 }} onChange={(v) => emit(v, show(hi))} />
        <InputNumber size="small" placeholder="max" value={show(hi)} addonAfter={unit || null} style={{ width: 90 }} onChange={(v) => emit(show(lo), v)} />
      </Space>
      <div style={{ marginTop: 6, textAlign: "right" }}><Button size="small" type="link" disabled={lo == null && hi == null} onClick={() => onChange(null)}>Reset</Button></div>
    </div>
  );
}

// header dropdown: contains search
function TextDropdown({ value, onChange, placeholder }) {
  return (
    <div style={{ padding: 8, width: 220 }} onClick={stop} onKeyDown={stop}>
      <Input size="small" allowClear autoFocus placeholder={placeholder} prefix={<SearchOutlined />} value={value || ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

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
  const [colFilters, setColFilters] = useState(() => decodeFilters(new URLSearchParams(window.location.search).get(EVF_PARAM)));
  useEffect(() => {
    const url = new URL(window.location.href);
    const enc = encodeFilters(colFilters);
    if (enc) url.searchParams.set(EVF_PARAM, enc);
    else url.searchParams.delete(EVF_PARAM);
    if (url.toString() !== window.location.href) window.history.replaceState(window.history.state, "", url.toString());
  }, [colFilters]);
  const setCat = (col, vals) => setColFilters((f) => setColumnFilter(f, "cat", col, vals));
  const setNum = (col, v) => setColFilters((f) => setColumnFilter(f, "num", col, v));
  const setText = (col, v) => setColFilters((f) => setColumnFilter(f, "text", col, v));
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
  const nFilters = activeCount(colFilters);
  const shown = filterRows(rows, colFilters).filter((r) => r.tier <= maxTier && (!classes.length || classes.includes(r.cls)) && (!strongOnly || r.strong) && (!q || `${r.gene} ${r.variant} ${r.role} ${r.effect}`.toUpperCase().includes(q)));
  const catFilter = (col, labelOf = (v) => v) => {
    const values = distinctValues(rows, col);
    return {
      filters: values.map((v) => ({ text: labelOf(v), value: v })),
      filterSearch: values.length > 10,
      filteredValue: colFilters.cat[col] || null,
    };
  };
  const textFilter = (col, placeholder) => ({
    filterDropdown: () => <TextDropdown value={colFilters.text[col]} onChange={(v) => setText(col, v)} placeholder={placeholder} />,
    filterIcon: () => <FilterFilled style={{ color: colFilters.text[col] ? "#1677ff" : undefined }} />,
  });
  const baseColumns = [
    { title: t("components.single-cell.cohort.patient"), dataIndex: "patient", width: 110, sortable: true, ...catFilter("patient"), render: (p) => <Text strong>{p}</Text> },
    { title: t("components.single-cell.results.gene"), dataIndex: "gene", width: 150, sortable: true, ...catFilter("gene"), render: (g) => <Text strong>{g}</Text> },
    { title: t("components.single-cell.cohort.ev-class"), dataIndex: "cls", width: 160, sortable: true, ...catFilter("cls", (c) => t(`components.single-cell.cohort.class-${c}`, { defaultValue: c })), sortValue: (r) => EVENT_CLASS_ORDER.indexOf(r.cls), render: (c) => <DataSwatch color={CLASS_COLORS[c]}>{t(`components.single-cell.cohort.class-${c}`, { defaultValue: c })}</DataSwatch> },
    { title: t("components.single-cell.cohort.ev-variant"), dataIndex: "variant", ellipsis: true, sortable: true, ...textFilter("variant", "Variant contains…"), render: (v) => <Text type="secondary" style={{ fontSize: 13 }}>{v}</Text> },
    { title: "Tier", dataIndex: "tier", width: 64, sortable: true, ...catFilter("tier", (v) => (Number(v) <= 3 ? v : "–")), render: (v) => (v <= 3 ? v : "–") },
    { title: t("components.single-cell.report.col-role"), dataIndex: "role", width: 140, sortable: true, ...catFilter("role"), render: (v) => (v ? <Text type="secondary">{v}</Text> : "–") },
    { title: t("components.single-cell.cohort.ev-effect"), dataIndex: "effect", width: 170, ellipsis: true, sortable: true, ...catFilter("effect") },
    {
      title: t("components.single-cell.report.col-cells"),
      dataIndex: "fraction",
      width: 200,
      sortable: true,
      firstDir: "desc",
      filterDropdown: () => (
        <div onClick={stop} onKeyDown={stop}>
          <RangeDropdown label="Carrier cells (count)" value={colFilters.num.nCells} onChange={(v) => setNum("nCells", v)} />
          <RangeDropdown label="Cell fraction" unit="%" scale={100} value={colFilters.num.fraction} onChange={(v) => setNum("fraction", v)} />
        </div>
      ),
      filterIcon: () => <FilterFilled style={{ color: colFilters.num.nCells || colFilters.num.fraction ? "#1677ff" : undefined }} />,
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
          <Button size="small" disabled={!nFilters} onClick={() => setColFilters(emptyFilters())}>{nFilters ? `Clear filters (${nFilters})` : "Clear filters"}</Button>
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
        onChange={(_p, filters) =>
          setColFilters((f) => {
            let next = f;
            ["patient", "gene", "cls", "tier", "role", "effect"].forEach((col) => {
              if (col in filters) next = setColumnFilter(next, "cat", col, filters[col] || []);
            });
            return next;
          })
        }
        onRow={(r) => ({ onClick: () => onEvent(r.summary, r.event), style: { cursor: "pointer" } })}
        scroll={{ x: 1100 }}
      />
    </Card>
  );
}
