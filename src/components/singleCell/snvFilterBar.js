import React, { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Button, Checkbox, InputNumber, Popover, Select, Slider, Space, Tag, Tooltip, Typography } from "antd";
import { DownOutlined, RightOutlined } from "@ant-design/icons";
import singleCellActions from "../../redux/singleCell/actions";
import { REGION_CLASSES, catLegend, finiteRange, describeFilter, removeFilterKey, setRange, setValues } from "../../helpers/singleCell/snvAnnot";
import { LABEL_MODES } from "../../helpers/singleCell/snvLabels";
import { PHYLO_PRESET, isPhyloPreset } from "../../helpers/singleCell/snvPhyloFit";

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
 * Always-visible "label >= [slider] [number] [presets]" control for one numeric
 * filter key (Tree fit F1, Site QC). `unscored` adds keep/drop for sites without a value.
 */
function MinControl({ label, help, field, range, step, presets, filter, setFilter, unscored = false, busy = false, na = null }) {
  const f = filter?.[field];
  if (na) return <Text type="secondary" title={na}>{`${label}: not available`}</Text>;
  const [lo, hi] = range;
  const value = f?.min ?? lo;
  const keep = f?.exclude ? { exclude: true } : {};
  const set = (x) => setFilter(x != null && x > lo ? { ...(filter || {}), [field]: { min: x, ...keep } } : removeFilterKey(filter, field));
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <Tooltip title={help}>
        <Text strong>{label} {"\u2265"}</Text>
      </Tooltip>
      <Slider min={lo} max={hi} step={step} value={value} onChange={set} style={{ width: 110, margin: "0 6px" }} tooltip={{ formatter: (x) => Number(x.toFixed(2)) }} />
      <InputNumber size="small" style={{ width: 66 }} min={lo} max={hi} step={step} value={f?.min ?? null} placeholder={`${Number(lo.toFixed(2))}`} onChange={(x) => set(x == null ? null : x)} />
      {presets.map(([x, title]) => (
        <Tooltip key={x} title={title}>
          <Button size="small" type={f?.min === x ? "primary" : "default"} style={{ padding: "0 6px" }} onClick={() => set(f?.min === x ? null : x)}>
            {x}
          </Button>
        </Tooltip>
      ))}
      {unscored && (
        <Tooltip title="Sites with too few carriers to score: keep them or drop them when the filter is on">
          <Select size="small" style={{ width: 118 }} value={f?.exclude ? "exclude" : "include"} disabled={!f} onChange={(v) => f && setFilter({ ...filter, [field]: { min: f.min, ...(v === "exclude" ? { exclude: true } : {}) } })} options={[{ value: "include", label: "unscored: keep" }, { value: "exclude", label: "unscored: drop" }]} />
        </Tooltip>
      )}
      {busy && <Text type="secondary">scoring...</Text>}
    </span>
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
export default function SnvFilterBar({ annot, nShown, onIsolate = null, fitBusy = false }) {
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
  const presetCount = useMemo(() => {
    const n = annot?.num;
    if (!n?.changes || !n.phylo || !n.outside) return null;
    let k = 0;
    for (let c = 0; c < annot.n; c += 1) if (n.phylo[c] >= 0.8 && n.changes[c] <= 2 && n.outside[c] <= 2) k += 1;
    return k;
  }, [annot]);
  const qcRange = useMemo(() => finiteRange(annot?.num.qc), [annot]);
  if (!annot) return null;
  const presetOn = isPhyloPreset(filter);
  const togglePreset = () => {
    if (presetOn) {
      const next = { ...filter };
      Object.keys(PHYLO_PRESET).forEach((k) => delete next[k]);
      setFilter(Object.keys(next).length ? next : null);
    } else setFilter({ ...(filter || {}), ...PHYLO_PRESET });
  };
  const presetButton = (
    <Tooltip title="Sites that obey the tree: rule: best-clade F1 >= 0.8 AND parsimony changes <= 2 AND outside-clade carriers <= 2. Computed from called genotypes on the current tree.">
      <Button size="small" type={presetOn ? "primary" : "default"} loading={fitBusy && presetCount == null} disabled={presetCount == null} onClick={togglePreset}>
        {presetCount == null ? "Phylogeny-consistent" : `Phylogeny-consistent (${presetCount})`}
      </Button>
    </Tooltip>
  );
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
  if (layout.snvSelectedOnly && layout.snvSelected?.length) chips.push({ id: "selonly", text: `Selected only (${layout.snvSelected.length})`, remove: () => update({ snvSelectedOnly: false }) });
  const active = chips.length > 0;
  const clearAll = () => update({ snvSelectedOnly: false, snvAnnotFilter: null, snvCategories: null, snvDriversOnly: false, snvCellphyOnly: false, snvMinCladeScore: null, snvIsolate: false });

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
      <div style={{ width: "100%", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "4px 6px", background: "var(--sc-panel-alt, rgba(22,119,255,.06))", borderRadius: 4 }}>
        <Text strong>Phylogeny fit</Text>
        {presetButton}
        {fitBusy && <Text type="secondary">computing on the current tree...</Text>}
        {annot.num.phylo && <RangeBox label="clade F1" title="Best-clade F1 on the tree (0 to 1)" filter={filter} field="phylo" onChange={setFilter} step={0.05} max={1} />}
        {annot.num.prec && <RangeBox label="precision" title="Carriers inside the best clade / all carriers (low = leaks)" filter={filter} field="prec" onChange={setFilter} step={0.05} max={1} />}
        {annot.num.recall && <RangeBox label="recall" title="Carriers / called cells in the best clade (low = dropout)" filter={filter} field="recall" onChange={setFilter} step={0.05} max={1} />}
        {annot.num.dropout && <RangeBox label="dropout" title="Fraction of called cells in the best clade that are ref" filter={filter} field="dropout" onChange={setFilter} step={0.05} max={1} />}
        {annot.num.outside && <RangeBox label="outside carriers" title="Carriers outside the best clade (count)" filter={filter} field="outside" onChange={setFilter} />}
        {annot.num.changes && <RangeBox label="changes" title="Fitch parsimony changes (gains + losses)" filter={filter} field="changes" onChange={setFilter} />}
        {annot.num.ci && <RangeBox label="consistency idx" title="1 / parsimony changes (1 = compatible)" filter={filter} field="ci" onChange={setFilter} step={0.05} max={1} />}
      </div>
      {annot.num.qc && (
        <div style={{ width: "100%", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <Text strong>Site QC fields</Text>
          <RangeBox label="score" title="Site QC score (sum log-odds): min / max" filter={filter} field="qc" onChange={setFilter} step={0.5} />
          {annot.num.qnalt && <RangeBox label="n_alt" title="QC n_alt: min / max" filter={filter} field="qnalt" onChange={setFilter} />}
          {annot.num.qncov && <RangeBox label="n_cov" title="QC n_cov: min / max" filter={filter} field="qncov" onChange={setFilter} />}
          {annot.num.qfrac && <RangeBox label="frac informative" title="QC frac_informative (0 to 1)" filter={filter} field="qfrac" onChange={setFilter} step={0.05} max={1} />}
          {annot.num.qvaf && <RangeBox label="pooled VAF" title="QC pooled_alt_vaf (0 to 1)" filter={filter} field="qvaf" onChange={setFilter} step={0.05} max={1} />}
          {annot.num.qcohq && <RangeBox label="coh_q" title="QC coh_q (cohort q-value, 0 to 1)" filter={filter} field="qcohq" onChange={setFilter} step={0.01} max={1} />}
        </div>
      )}
      <RangeBox label="alt cells" title="Cells carrying the alt allele: min / max" filter={filter} field="carriers" onChange={setFilter} />
      <RangeBox label="mean depth" title="Mean read depth over cells with reads: min / max" filter={filter} field="depth" onChange={setFilter} />
      <RangeBox label="alt fraction" title="Fraction of called cells with the alt allele (0 to 1)" filter={filter} field="vaf" onChange={setFilter} step={0.05} max={1} />
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
      {presetButton}
      {annot.num.phylo && (
        <MinControl label="Tree fit (F1)" help="Best-clade F1 of the site on the tree, from called genotypes (the Compare Trees concordance metric). Sites with fewer than 3 carriers are unscored." field="phylo" range={[0, 1]} step={0.05} presets={[[0.5, "F1 >= 0.5"], [0.8, "F1 >= 0.8"], [0.9, "F1 >= 0.9"]]} filter={filter} setFilter={setFilter} unscored busy={fitBusy} />
      )}
      <MinControl label="Site QC" help="Site QC score (sum of log-odds, snv_qc.json). Pipeline thresholds: 2 = sf7 default (MIN_SUM_LOGODDS), 6 = strict BWH69 rebuild." field="qc" range={qcRange || [0, 1]} step={0.5} presets={[[2, "sf7 pipeline threshold (MIN_SUM_LOGODDS 2)"], [6, "strict BWH69 rebuild threshold"]]} filter={filter} setFilter={setFilter} na={qcRange ? null : "This patient has no snv_qc.json"} />
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
