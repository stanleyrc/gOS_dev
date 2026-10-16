import React, { useMemo } from "react";
import { driverColors } from "./driverColors";
import { Button, Checkbox, InputNumber, Popover, Radio, Segmented, Select, Space, Tag, Tooltip, Typography } from "antd";
import { FilterOutlined } from "@ant-design/icons";
import {
  CLADE_F1_CHOICES,
  DEFAULT_FILTERS,
  f1HiddenCount,
  noF1Keys,
  DM_HELP,
  DRIVER_CLASSES,
  classLabel,
  selectDrivers,
  selectionForKeys,
  effectiveMaxTier,
} from "../../../helpers/singleCell/driverLayer";
import { TIER_OPTIONS } from "../../../helpers/singleCell/cohortStats";

const { Text } = Typography;

export const PRESET_LABELS = {
  recommended: "Recommended",
  subclonal: "Subclonal only",
  hotspots: "Hotspots",
  all: "All",
};
export const PRESET_HELP = {
  recommended:
    "OncoKB tier 1-2 events in a cancer gene (OncoKB, GBM gene or COSMIC CGC) that pass QC: at least 3 carrier cells, no 'upstream of GENE' fusion, site evidence not artefact- or germline-like. " +
    `Complex events (${DM_HELP}, BFB, TIC) have no tier and are included when 3 or more cells carry them. Also tier-3 missense predicted damaging by SIFT and PolyPhen, in any gene, if they pass QC (Tier limit in Filters).`,
  subclonal: "Tier 1-2 drivers carried by 95% of the tumor cells or fewer, passing QC.",
  hotspots: "Point mutations at known hotspot sites (site evidence) or OncoKB-flagged driver sites, passing QC.",
  all: "Every driver event of the patient, including 'upstream of GENE' fusions and tier 3 events.",
};
const CLASS_NAMES = {
  snv: "SNV / indel",
  amp: "Amplification",
  homdel: "Deep deletion",
  fusion: "SV fusion",
  complex: "Complex (DM / TIC / BFB)",
};

const Sw = ({ c, label, tip }) => (
  <Tooltip title={tip}>
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, marginRight: 6 }}>
      <span style={{ width: 10, height: 10, background: c, display: "inline-block", border: "1px solid rgba(0,0,0,0.15)" }} />
      <Text type="secondary" style={{ fontSize: 11 }}>{label}</Text>
    </span>
  </Tooltip>
);

/** Compact colour key of the layer, next to the presets. */
function MiniLegend() {
  const c = driverColors();
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center" }}>
      <Sw c={c.mutant} label="mutant" />
      <Sw c={c.wildtype} label="WT" tip="Wild type. For hotspots rescued from site evidence (TERT promoter ...) and SNVs called but not tree sites: the cell has reads at the site but no alt read (allele dropout is common, so not proven wild type)" />
      <Sw c={c.noCoverage} label="no coverage" tip="SNV sites with no reads in the cell" />
      <Sw c={c.loss} label="loss only" tip="Tumour-suppressor SNV column with a second hit (LOH or deletion at the gene, per-cell allelic CN): the cell has the loss but no SNV read" />
      <Sw c={c.bothHit} label="SNV + loss" tip="Both hits in the cell: the SNV and LOH / deletion of the other copy (biallelic)" />
      <Sw c="#92C5DE" label="del" tip="Deletion / low copy number (CN heatmap palette: 0-1 copies)" />
      <Sw c="#FDB863" label="amp" tip="Amplification; darker orange to black = higher copy number (CN heatmap palette, black = highest level)" />
      <Sw c={c.dna} label="fusion DNA" />
      <Sw c={c.rna} label="RNA" />
      <Sw c={c.both} label="both" />
      <Sw c={c.complex} label="complex" tip="Complex event present (DM / TIC / BFB, gGnome event classifier)" />
    </span>
  );
}

/** Filters of the Drivers layer in a popover. */
function FilterPanel({ selection, onChange, hasCgc, hasRna }) {
  const f = { ...DEFAULT_FILTERS, ...selection.filters };
  const set = (patch) => onChange({ ...selection, filters: { ...f, ...patch } });
  const row = { display: "grid", gridTemplateColumns: "120px 1fr", gap: 8, alignItems: "center", marginBottom: 8 };
  return (
    <div style={{ width: 430 }}>
      <div style={row}>
        <Text type="secondary">QC tier</Text>
        <Checkbox.Group value={f.tiers || []} onChange={(v) => set({ tiers: v.length ? v : null })} options={[1, 2, 3].map((x) => ({ value: x, label: `Tier ${x}` }))} />
      </div>
      <div style={row}>
        <Tooltip title="Highest OncoKB tier shown. With the default (≤ 2 + damaging missense) the Recommended preset also includes tier-3 missense predicted deleterious by SIFT and probably / possibly damaging by PolyPhen, in any gene, if they pass QC. The other presets are not limited unless you pick a tier.">
          <Text type="secondary">Tier limit</Text>
        </Tooltip>
        <Select
          size="small"
          style={{ width: 220 }}
          value={f.maxTier ?? (selection.preset === "recommended" ? effectiveMaxTier(f) : "any")}
          onChange={(v) => set({ maxTier: v === "any" || (selection.preset === "recommended" && v === "2d") ? null : v })}
          options={[...(selection.preset === "recommended" ? [] : [{ value: "any", label: "No limit" }]), ...TIER_OPTIONS]}
        />
      </div>
      <div style={row}>
        <Text type="secondary">Gene list</Text>
        <Checkbox.Group
          value={f.lists || []}
          onChange={(v) => set({ lists: v.length ? v : null })}
          options={[
            { value: "oncokb", label: "OncoKB" },
            { value: "cgc", label: <Tooltip title={hasCgc ? "COSMIC Cancer Gene Census" : "The Census list could not be loaded"}>CGC</Tooltip>, disabled: !hasCgc },
            { value: "gbm", label: "GBM genes" },
          ]}
        />
      </div>
      <div style={row}>
        <Text type="secondary">Custom genes</Text>
        <Select size="small" mode="tags" tokenSeparators={[",", " "]} placeholder="e.g. EGFR, PTEN" value={f.genes} onChange={(v) => set({ genes: v.map((g) => g.toUpperCase()) })} />
      </div>
      <div style={row}>
        <Text type="secondary">Event class</Text>
        <Checkbox.Group value={f.classes || []} onChange={(v) => set({ classes: v.length ? v : null })} options={DRIVER_CLASSES.map((c) => ({ value: c, label: CLASS_NAMES[c] }))} />
      </div>
      <div style={row}>
        <Text type="secondary">Clonality</Text>
        <Radio.Group size="small" value={f.clonality} onChange={(e) => set({ clonality: e.target.value })} optionType="button" options={[{ value: "any", label: "Any" }, { value: "clonal", label: "Clonal" }, { value: "subclonal", label: "Subclonal" }]} />
      </div>
      <div style={row}>
        <Text type="secondary">Min cells</Text>
        <InputNumber size="small" min={1} value={f.minCells} onChange={(v) => set({ minCells: v || 1 })} />
      </div>
      <div style={row}>
        <Tooltip title="Best F1 between an event's carrier cells and one clade of the patient tree (same score as the Clade F1 column of Filtered Events). Events with no carrier cells have no score and stay visible.">
          <Text type="secondary">Clade F1</Text>
        </Tooltip>
        <Select
          size="small"
          style={{ width: 120 }}
          value={f.minF1 || 0}
          onChange={(v) => set({ minF1: v })}
          options={CLADE_F1_CHOICES.map((v) => ({ value: v, label: v ? `≥ ${v}` : "Any" }))}
        />
      </div>
      <div style={row}>
        <Text type="secondary">Fusion support</Text>
        <Radio.Group
          size="small"
          value={f.fusionSupport}
          onChange={(e) => set({ fusionSupport: e.target.value })}
          optionType="button"
          options={[{ value: "any", label: "Any" }, { value: "dna", label: "DNA" }, { value: "rna", label: "RNA", disabled: !hasRna }, { value: "both", label: "DNA + RNA", disabled: !hasRna }]}
        />
      </div>
      <Button size="small" onClick={() => onChange({ ...selection, filters: DEFAULT_FILTERS })}>
        Reset filters
      </Button>
    </div>
  );
}

const nFilters = (f) => {
  const x = { ...DEFAULT_FILTERS, ...f };
  return [x.tiers?.length, x.maxTier != null, x.lists?.length, x.genes?.length, x.classes?.length, x.clonality !== "any", x.minCells > 1, x.fusionSupport !== "any", x.minF1 > 0].filter(Boolean).length;
};

/**
 * Driver picker of the Drivers layer: presets, filters, an add / remove
 * picker for single events and the "drivers on tree" toggle. All of it lives in
 * redux (layout.drivers) and the URL, and the Report tab's clonal history
 * reads the same selection.
 */
export default function DriverControls({ driverLayer, branches, onBranches, canBranches }) {
  const { entries, shown, fits, selection, setSelection, hasCgc, hasRna, collapsed } = driverLayer;
  const options = useMemo(
    () =>
      DRIVER_CLASSES.map((cls) => ({
        label: CLASS_NAMES[cls],
        options: entries
          .filter((d) => d.cls === cls)
          .map((d) => ({
            value: d.key,
            search: `${d.label} ${d.genes.join(" ")}`,
            label: (
              <Space size={4}>
                <span>{d.label}</span>
                <Text type="secondary">{`${d.n} cells`}</Text>
                {d.tier != null && <Tag style={{ marginInlineEnd: 0 }}>{`tier ${d.tier}`}</Tag>}
                {d.upstreamOnly && <Tag color="orange" style={{ marginInlineEnd: 0 }}>upstream</Tag>}
              </Space>
            ),
          })),
      })).filter((g) => g.options.length),
    [entries]
  );
  const nShown = shown.length;
  const nPreset = useMemo(() => selectDrivers(entries, { ...selection, add: [], remove: [] }, fits).length, [entries, selection, fits]);
  const nF1Hidden = useMemo(() => f1HiddenCount(entries, selection, fits), [entries, selection, fits]);
  const noF1 = useMemo(() => noF1Keys(shown, fits), [shown, fits]);
  const edited = (selection.add?.length || 0) + (selection.remove?.length || 0);
  return (
    <Space wrap size={[12, 6]}>
      <Segmented
        size="small"
        value={selection.preset}
        onChange={(preset) => setSelection({ ...selection, preset, add: [], remove: [] })}
        options={Object.keys(PRESET_LABELS).map((value) => ({ value, label: <Tooltip title={PRESET_HELP[value]}>{PRESET_LABELS[value]}</Tooltip> }))}
      />
      <MiniLegend />
      <Popover trigger="click" placement="bottomLeft" content={<FilterPanel selection={selection} onChange={setSelection} hasCgc={hasCgc} hasRna={hasRna} />}>
        <Button size="small" icon={<FilterOutlined />} type={nFilters(selection.filters) ? "primary" : "default"} ghost={Boolean(nFilters(selection.filters))}>
          {`Filters${nFilters(selection.filters) ? ` (${nFilters(selection.filters)})` : ""}`}
        </Button>
      </Popover>
      <Space size={4}>
        <Text type="secondary">Drivers</Text>
        <Select
          size="small"
          mode="multiple"
          allowClear
          showSearch
          maxTagCount="responsive"
          style={{ minWidth: 260, maxWidth: 520 }}
          placeholder="Add or remove drivers"
          value={shown.map((d) => d.key)}
          options={options}
          optionFilterProp="search"
          onChange={(keys) => setSelection(selectionForKeys(entries, selection, keys, fits))}
        />
      </Space>
      <Text type="secondary">{`${nShown} shown of ${entries.length}${collapsed ? ` (${collapsed} collapsed into shared-CN columns)` : ""}${edited ? ` · ${edited} hand-picked` : ""}`}</Text>
      {nF1Hidden > 0 && <Text type="secondary">{`· ${nF1Hidden} hidden by Clade F1 ≥ ${selection.filters.minF1}`}</Text>}
      {selection.filters?.minF1 > 0 && noF1.size > 0 && (
        <Tooltip title={`No carrier cells on the tree, so no Clade F1 score: ${shown.filter((d) => noF1.has(d.key)).map((d) => d.label).join(", ")}`}>
          <Tag style={{ marginInlineEnd: 0 }}>{`${noF1.size} no F1`}</Tag>
        </Tooltip>
      )}
      {edited > 0 && (
        <Button size="small" type="link" onClick={() => setSelection({ ...selection, add: [], remove: [] })}>
          {`Back to preset (${nPreset})`}
        </Button>
      )}
      {canBranches && (
        <Tooltip title="Mark the tree branch where each shown driver arises: the clade its carrier cells fit best (fit 0.5 or more). Clonal drivers sit on the root stem and are not marked.">
          <Checkbox checked={branches} onChange={(e) => onBranches(e.target.checked)}>
            Drivers on tree
          </Checkbox>
        </Tooltip>
      )}
    </Space>
  );
}

export { classLabel };
