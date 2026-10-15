import React, { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Button, Checkbox, InputNumber, Popover, Select, Space, Tag, Tooltip, Typography } from "antd";
import { DownOutlined, RightOutlined } from "@ant-design/icons";
import singleCellActions from "../../redux/singleCell/actions";
import { REGION_CLASSES, catLegend, describeFilter, removeFilterKey, setRange, setValues } from "../../helpers/singleCell/snvAnnot";
import { LABEL_MODES } from "../../helpers/singleCell/snvLabels";

const { Text } = Typography;
const TREE_LABEL = { truncal: "truncal", subclonal: "subclonal", private: "private", outside_tumor: "outside tumour", unmapped: "unmapped" };

/** Min / max boxes of one numeric filter key. */
function RangeBox({ label, title, filter, field, onChange, step = 1, max = null }) {
  const f = filter?.[field] || {};
  const box = (which, ph) => (
    <InputNumber
      size="small"
      style={{ width: 62 }}
      placeholder={ph}
      step={step}
      min={0}
      max={max == null ? undefined : max}
      value={f[which] ?? null}
      onChange={(x) => {
        const next = { min: f.min ?? null, max: f.max ?? null, [which]: x == null ? null : x };
        onChange(setRange(filter, field, next.min, next.max));
      }}
    />
  );
  return (
    <Tooltip title={title}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
        <Text type="secondary">{label}</Text>
        {box("min", "min")}
        {box("max", "max")}
      </span>
    </Tooltip>
  );
}

/**
 * Filter bar over the SNV matrices (Single-Cell tab and Compare Trees share
 * the layout state): gene, consequence/region, signature, tree site, driver,
 * CellPhy, carriers, depth, alt-cell fraction and clade F1; removable chips,
 * "N of M sites", label mode, missing-colour option and the Isolate action.
 * Track click-filters and this bar write the same layout.snvAnnotFilter /
 * snvCategories, so they stay in sync.
 */
export default function SnvFilterBar({ annot, nShown, onIsolate = null }) {
  const dispatch = useDispatch();
  const layout = useSelector((s) => s.SingleCell.layout) || {};
  const filter = layout.snvAnnotFilter || null;
  const update = (patch) => dispatch(singleCellActions.updateLayout(patch));
  const setFilter = (next) => update({ snvAnnotFilter: next });

  const geneOptions = useMemo(() => {
    const counts = {};
    (annot?.cat.gene || []).forEach((g) => g && (counts[g] = (counts[g] || 0) + 1));
    return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([g, k]) => ({ value: g, label: `${g} (${k})` }));
  }, [annot]);
  if (!annot) return null;
  const regionOptions = REGION_CLASSES.map((r) => ({ ...r, count: (annot.cat.region || []).filter((x) => x === r.key).length })).filter((r) => r.count).map((r) => ({ value: r.key, label: `${r.label} (${r.count})` }));
  const sigOptions = catLegend(annot, "signature").map((e) => ({ value: e.value, label: `${e.label} (${e.count})` }));
  const treeCounts = {};
  (annot.cat.category || []).forEach((c) => (treeCounts[c] = (treeCounts[c] || 0) + 1));
  const treeOptions = Object.keys(TREE_LABEL).filter((k) => treeCounts[k]).map((k) => ({ value: k, label: `${TREE_LABEL[k]} (${treeCounts[k]})` }));
  const nDrivers = (annot.variants || []).filter((v) => v.driver).length;

  const multi = (key, options, placeholder, width) => (
    <Select
      size="small"
      mode="multiple"
      allowClear
      showSearch
      optionFilterProp="label"
      maxTagCount="responsive"
      style={{ minWidth: width, maxWidth: 260 }}
      placeholder={placeholder}
      value={filter?.[key]?.values || []}
      options={options}
      onChange={(values) => setFilter(setValues(filter, key, values))}
    />
  );

  const chips = [];
  Object.entries(filter || {}).forEach(([key, f]) => chips.push({ id: key, text: describeFilter(annot, key, f), remove: () => setFilter(removeFilterKey(filter, key)) }));
  if (layout.snvCategories?.length) chips.push({ id: "cat", text: `Tree site: ${layout.snvCategories.map((k) => TREE_LABEL[k] || k).join(", ")}`, remove: () => update({ snvCategories: null }) });
  if (layout.snvDriversOnly) chips.push({ id: "drv", text: "Drivers only", remove: () => update({ snvDriversOnly: false }) });
  if (layout.snvCellphyOnly) chips.push({ id: "cp", text: "CellPhy input only", remove: () => update({ snvCellphyOnly: false }) });
  if (layout.snvMinCladeScore > 0) chips.push({ id: "f1min", text: `Clade score >= ${layout.snvMinCladeScore}`, remove: () => update({ snvMinCladeScore: null }) });
  const active = chips.length > 0;
  const clearAll = () => update({ snvAnnotFilter: null, snvCategories: null, snvDriversOnly: false, snvCellphyOnly: false, snvMinCladeScore: null, snvIsolate: false });

  const inputs = (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, width: 680, maxWidth: "80vw" }}>
      {multi("gene", geneOptions, "Gene (multi)", 130)}
      {multi("region", regionOptions, "Consequence / region", 150)}
      {multi("signature", sigOptions, "Signature", 110)}
      <Select
        size="small"
        mode="multiple"
        allowClear
        maxTagCount="responsive"
        style={{ minWidth: 120, maxWidth: 220 }}
        placeholder="Tree site"
        value={layout.snvCategories || []}
        options={treeOptions}
        onChange={(values) => update({ snvCategories: values.length ? values : null })}
      />
      {nDrivers > 0 && (
        <Checkbox checked={Boolean(layout.snvDriversOnly)} onChange={(e) => update({ snvDriversOnly: e.target.checked })}>
          driver only
        </Checkbox>
      )}
      {(annot.cat.cellphy || []).some(Boolean) && (
        <Checkbox checked={Boolean(layout.snvCellphyOnly)} onChange={(e) => update({ snvCellphyOnly: e.target.checked })}>
          CellPhy input
        </Checkbox>
      )}
      <RangeBox label="alt cells" title="Cells carrying the alt allele: min / max" filter={filter} field="carriers" onChange={setFilter} />
      <RangeBox label="mean depth" title="Mean read depth over cells with reads: min / max" filter={filter} field="depth" onChange={setFilter} />
      <RangeBox label="alt fraction" title="Fraction of called cells with the alt allele (0 to 1)" filter={filter} field="vaf" onChange={setFilter} step={0.05} max={1} />
      {annot.num.phylo && <RangeBox label="clade F1" title="Best-clade F1 on the tree (0 to 1)" filter={filter} field="phylo" onChange={setFilter} step={0.05} max={1} />}
      <Space size={4}>
        <Text type="secondary">Label</Text>
        <Select size="small" style={{ width: 96 }} value={layout.snvLabel || "protein"} onChange={(v) => update({ snvLabel: v === "protein" ? null : v })} options={LABEL_MODES.map((m) => ({ value: m, label: m }))} />
      </Space>
      <Space size={4}>
        <Tooltip title="Colour of sites with no reads in a cell, in every mutation matrix and its legend">
          <Text type="secondary">Missing (no coverage)</Text>
        </Tooltip>
        <Select size="small" style={{ width: 76 }} value={layout.snvNaColor === "white" ? "white" : "grey"} onChange={(v) => update({ snvNaColor: v === "white" ? "white" : null })} options={[{ value: "grey", label: "grey" }, { value: "white", label: "white" }]} />
      </Space>
    </div>
  );
  const hidden = Boolean(layout.snvFiltersHidden);
  const toggle = (
    <Button type="text" size="small" aria-label={hidden ? "Show filters" : "Hide filters"} icon={hidden ? <RightOutlined /> : <DownOutlined />} onClick={() => update({ snvFiltersHidden: !hidden })} />
  );
  if (hidden)
    return (
      <div className="sc-filter-bar" style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {toggle}
        <Text type="secondary">{`Filters (${chips.length} active)`}</Text>
        {active && <Text style={{ fontSize: 12 }}>{`${nShown} of ${annot.n} sites`}</Text>}
      </div>
    );
  return (
    <div className="sc-filter-bar" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, padding: "2px 0" }}>
      {toggle}
      <Popover trigger="click" placement="bottomLeft" title="Filter sites" content={inputs}>
        <Button size="small">{`Filters (${chips.length})`}</Button>
      </Popover>
      {chips.map((c) => (
        <Tag key={c.id} closable color="blue" style={{ marginInlineEnd: 0 }} onClose={c.remove}>
          {c.text}
        </Tag>
      ))}
      <Text strong style={{ fontSize: 12 }}>
        {nShown} of {annot.n} sites
      </Text>
      <Tooltip title="Show where the filtered sites sit: counts on the tree branches, carrier cells highlighted, a table with the clade and signature fit">
        <Button size="small" type={layout.snvIsolate ? "primary" : "default"} disabled={!active && !layout.snvIsolate} onClick={() => (onIsolate ? onIsolate(!layout.snvIsolate) : update({ snvIsolate: !layout.snvIsolate }))}>
          {layout.snvIsolate ? "Isolating" : "Isolate"}
        </Button>
      </Tooltip>
      {active && (
        <Button type="link" size="small" onClick={clearAll}>
          clear all
        </Button>
      )}
    </div>
  );
}
