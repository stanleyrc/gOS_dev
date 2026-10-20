import React, { useEffect, useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import * as d3 from "d3";
import { Alert, Badge, Button, Card, Empty, Input, InputNumber, Popover, Segmented, Select, Slider, Space, Switch, Tag, Tooltip, Typography } from "antd";
import { FilterOutlined, TableOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import SvgExportButton from "../svgExportButton";
import datasetsActions from "../../../redux/datasets/actions";
import settingsActions from "../../../redux/settings/actions";
import {
  DEFAULT_ONCOPRINT,
  GLYPH,
  ONCOPRINT_CLASSES,
  ONCOPRINT_PRESETS,
  cohortEntries,
  drvOpenParams,
  geneChoices,
  sortColumns,
  sortRowsByFrequency,
  addedGeneGaps,
} from "../../../helpers/singleCell/cohortOncoprint";
import { classLabel } from "../../../helpers/singleCell/driverLayer";
import { TIER_OPTIONS } from "../../../helpers/singleCell/cohortStats";
import {
  CONSEQUENCE_CHOICES,
  DEFAULT_OC_FILTERS,
  GENE_LIST_CHOICES,
  OC_URL_PARAMS,
  ROLE_CHOICES,
  VERDICT_CHOICES,
  annotateEntries,
  clearFilter,
  countsLine,
  filterChips,
  filterOncoprint,
  filteredAddedGenes,
  parseGeneList,
  parseOcState,
  serializeOcState,
} from "../../../helpers/singleCell/cohortOncoprintFilters";
import { useCgcGenes } from "../drivers/useDriverLayer";
import { FONT, Swatches } from "./charts";
import HintLine, { Provenance } from "../hintLine";
import { groupOncoprintRows, oncoprintRole, oncoprintRowNote } from "../../../helpers/singleCell/cohortStats";
import { GeneQuickLookText } from "./geneQuickLook";
import { linkGenes } from "../../../helpers/singleCell/externalLinks";
import { INK, TYPE } from "../../../helpers/singleCell/plotTheme";
import { biallelicOnlyRows } from "../../../helpers/singleCell/twoHit";
import { BiallelicSwitch, TwoHitCell, TwoHitLegend } from "./twoHitGlyph";
import { ecdnaHoverLines } from "../../../helpers/singleCell/ecdnaStatus";

const { Text } = Typography;
const CLASS_COLORS = { amp: "#D7191C", homdel: "#2C7BB6", fusion: "#7B3294", snv: "#1B9E77", complex: "#E66101" };
const CLASS_NAMES = { snv: "SNV / indel", amp: "Amplification", homdel: "Homozygous deletion", fusion: "Fusion", complex: "Complex (ecDNA / TIC / BFB)" };
const PRESET_NAMES = { recommended: "Recommended", gbm: "GBM genes", oncokb: "OncoKB / CGC", all: "All" };
const CELL_H = 24;
const GENE_W = 170;
const pct = d3.format(".0%");

/** Glyph of an event class centred at (cx, cy), r = half size. */
function Glyph({ shape, cx, cy, r, fill }) {
  if (shape === "up") return <path d={`M${cx - r},${cy + r} L${cx + r},${cy + r} L${cx},${cy - r} Z`} fill={fill} />;
  if (shape === "down") return <path d={`M${cx - r},${cy - r} L${cx + r},${cy - r} L${cx},${cy + r} Z`} fill={fill} />;
  if (shape === "diamond") return <path d={`M${cx},${cy - r} L${cx + r},${cy} L${cx},${cy + r} L${cx - r},${cy} Z`} fill={fill} />;
  if (shape === "circle") return <circle cx={cx} cy={cy} r={r} fill={fill} />;
  return <rect x={cx - r * 0.8} y={cy - r * 0.8} width={r * 1.6} height={r * 1.6} fill={fill} />;
}

const FIELD = { display: "grid", gridTemplateColumns: "150px 1fr", alignItems: "center", gap: 8, marginBottom: 6 };
function Field({ label, children, hint }) {
  return (
    <div style={FIELD}>
      <Tooltip title={hint}><Text type="secondary">{label}</Text></Tooltip>
      <div>{children}</div>
    </div>
  );
}

/** The Filters popover: genes, events, rows / patients. */
function FiltersForm({ filters: f, setFilter, reset, pasted, setPasted, patients, hasVerdicts, hasRna, hasCgc }) {
  const sectionStyle = { fontWeight: 600, margin: "8px 0 6px" };
  const multi = (key, options, placeholder = "any") => (
    <Select size="small" mode="multiple" allowClear maxTagCount="responsive" placeholder={placeholder} style={{ width: "100%" }} value={f[key]} onChange={(v) => setFilter({ [key]: v })} options={options} />
  );
  return (
    <div style={{ width: 520, maxHeight: "70vh", overflowY: "auto", paddingRight: 4 }}>
      <div style={sectionStyle}>Genes</div>
      <Field label="Gene role">{multi("roles", ROLE_CHOICES)}</Field>
      <Field label="Gene lists" hint={hasCgc ? "Any of the chosen lists (OR); DNA repair lists are fixed symbol sets" : "COSMIC CGC is still loading or not available"}>
        {multi("lists", GENE_LIST_CHOICES.map((c) => (c.value === "cgc" && !hasCgc ? { ...c, disabled: true, label: `${c.label} (not available)` } : c)))}
      </Field>
      <Field label="Pasted gene list" hint="Symbols separated by space, comma or semicolon; joined (OR) with the lists">
        <Input.TextArea size="small" rows={2} placeholder="e.g. PRKDC, XRCC4, LIG4" value={pasted} onChange={(e) => { setPasted(e.target.value); setFilter({ custom: parseGeneList(e.target.value) }); }} />
      </Field>
      <Field label="Search"><Input size="small" allowClear placeholder="row label or gene contains" value={f.search} onChange={(e) => setFilter({ search: e.target.value })} /></Field>
      <div style={sectionStyle}>Events</div>
      <Field label="Consequence">{multi("consequences", CONSEQUENCE_CHOICES)}</Field>
      <Field label="Tier" hint="Highest tier allowed; '≤ 2 + damaging missense' adds tier-3 missense predicted damaging by SIFT and PolyPhen">
        <Select size="small" allowClear placeholder="any" style={{ width: "100%" }} value={f.maxTier} onChange={(v) => setFilter({ maxTier: v ?? null })} options={TIER_OPTIONS} />
      </Field>
      <Field label="Clonality"><Segmented size="small" value={f.clonality} onChange={(v) => setFilter({ clonality: v })} options={[{ value: "any", label: "Both" }, { value: "clonal", label: "Clonal" }, { value: "subclonal", label: "Subclonal" }]} /></Field>
      <Field label="Min carrier cells" hint="Events carried by fewer cells are dropped (default 3)">
        <InputNumber size="small" min={1} max={1000} value={f.minCells} onChange={(v) => setFilter({ minCells: v || 1 })} style={{ width: 80 }} />
      </Field>
      <Field label="Tumour-cell fraction" hint="Share of tumour cells that carry the event">
        <Slider range min={0} max={100} step={1} value={[Math.round(f.minFrac * 100), Math.round(f.maxFrac * 100)]} onChange={([a, b]) => setFilter({ minFrac: a / 100, maxFrac: b / 100 })} tooltip={{ formatter: (v) => `${v}%` }} />
      </Field>
      <Field label="Clade F1" hint="How well the carrier cells form one clade of the patient's tree (events without a score stay)">
        <Slider range min={0} max={1} step={0.05} value={[f.minF1, f.maxF1]} onChange={([a, b]) => setFilter({ minF1: a, maxF1: b })} />
      </Field>
      <Field label="Site-QC verdict" hint={hasVerdicts ? "Only events that have site evidence are filtered" : "not available (site evidence is not loaded in the cohort view; open the patient's Drivers layer)"}>
        <Select size="small" mode="multiple" allowClear disabled={!hasVerdicts} maxTagCount="responsive" placeholder={hasVerdicts ? "any" : "not available (no site evidence loaded)"} style={{ width: "100%" }} value={f.verdicts} onChange={(v) => setFilter({ verdicts: v })} options={VERDICT_CHOICES} />
      </Field>
      <Field label="Fusion support" hint={hasRna ? "DNA = cell carriers; RNA = a matching RNA fusion call" : "RNA fusion calls are not exported for these patients: RNA / both would hide every fusion"}>
        <Segmented size="small" value={f.fusionSupport} onChange={(v) => setFilter({ fusionSupport: v })} options={[{ value: "any", label: "Any" }, { value: "dna", label: "DNA" }, { value: "rna", label: "RNA", disabled: !hasRna }, { value: "both", label: "DNA + RNA", disabled: !hasRna }]} />
      </Field>
      <Field label="Upstream-only fusions"><Switch size="small" checked={f.noUpstream} onChange={(v) => setFilter({ noUpstream: v })} /> <Text type="secondary">exclude</Text></Field>
      <div style={sectionStyle}>Rows and patients</div>
      <Field label="Min patients per row" hint="2 or more shows recurrence only">
        <InputNumber size="small" min={1} max={100} value={f.minPatients} onChange={(v) => setFilter({ minPatients: v || 1 })} style={{ width: 80 }} />
      </Field>
      <Field label="Max rows" hint="Most recurrent rows first; 0 = all">
        <InputNumber size="small" min={0} max={500} value={f.maxRows} onChange={(v) => setFilter({ maxRows: v || 0 })} style={{ width: 80 }} />
      </Field>
      <Field label="Patients">{multi("patients", patients.map((p) => ({ value: p, label: p })), "all patients")}</Field>
      <Field label="Hide empty patients"><Switch size="small" checked={f.hideEmpty} onChange={(v) => setFilter({ hideEmpty: v })} /></Field>
      <Button size="small" onClick={reset}>Reset all filters</Button>
    </div>
  );
}

/**
 * Cross-patient oncoprint: genes x patients from every patient's filtered events. Each cell draws the
 * event-class glyph on a fill whose intensity is the fraction of tumour cells carrying it; clonal calls
 * (more than 95% of cells) have a solid outline, subclonal ones a dashed outline. Presets, class / tier /
 * fraction filters, gene picker, row and column sorting. Click a cell: that patient's Single-Cell tab opens
 * on the Drivers layer with the event's drawer.
 */
export default function CohortOncoprintPanel({ summaries, files, tsg = null }) {
  const dispatch = useDispatch();
  const [ref, width] = useContainerWidth(900);
  const [sel, setSel] = useState(() => parseOcState(typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("ocs"), DEFAULT_ONCOPRINT));
  const [filters, setFilters] = useState(() => parseOcState(typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("ocf"), DEFAULT_OC_FILTERS));
  const [pasted, setPasted] = useState(() => (filters.custom || []).join(" "));
  const cgc = useCgcGenes();
  const setFilter = (o) => setFilters((f) => ({ ...f, ...o }));
  // selection + filters live in the URL (ocs / ocf: only what differs from the default)
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const vals = { ocs: serializeOcState(sel, DEFAULT_ONCOPRINT), ocf: serializeOcState(filters, DEFAULT_OC_FILTERS) };
      OC_URL_PARAMS.forEach((k) => (vals[k] ? url.searchParams.set(k, vals[k]) : url.searchParams.delete(k)));
      if (url.toString() !== window.location.href) window.history.replaceState(window.history.state, "", url.toString());
    } catch (e) {
      // no history
    }
  }, [sel, filters]);
  useEffect(
    () => () => {
      try {
        const url = new URL(window.location.href);
        OC_URL_PARAMS.forEach((k) => url.searchParams.delete(k));
        window.history.replaceState(window.history.state, "", url.toString());
      } catch (e) {
        // no history
      }
    },
    []
  );
  const [colSort, setColSort] = useState("exclusivity");
  const [rowSort, setRowSort] = useState("role");
  const [showFractions, setShowFractions] = useState(true);
  const [biOnly, setBiOnly] = useState(false); // only tumour-suppressor cells with two hits (biallelic or homozygous deletion)
  const patch = (o) => setSel((s) => ({ ...s, ...o }));

  const allEntries = useMemo(
    () =>
      Object.fromEntries(
        summaries
          .filter((s) => files[s.caseReportId]?.events)
          .map((s) => [s.caseReportId, annotateEntries(cohortEntries(files[s.caseReportId].events), { tree: files[s.caseReportId].tree, rnaFusions: files[s.caseReportId].rnaFusions, cgc })])
      ),
    [summaries, files, cgc]
  );
  const result = useMemo(() => filterOncoprint(allEntries, sel, filters), [allEntries, sel, filters]);
  const entriesByPatient = result.entriesByPatient;
  const grid = result.grid;
  const choices = useMemo(() => geneChoices(allEntries), [allEntries]);
  const chips = useMemo(() => filterChips(filters, result.hidden), [filters, result.hidden]);
  const hasVerdicts = useMemo(() => Object.values(allEntries).some((l) => l.some((d) => d.verdict != null)), [allEntries]);
  const hasRna = useMemo(() => Object.values(allEntries).some((l) => l.some((d) => d.rnaKnown)), [allEntries]);
  const rows = useMemo(() => {
    const base = biOnly && tsg ? biallelicOnlyRows(grid.rows, tsg.index) : grid.rows;
    if (rowSort === "name") return [...base].sort((a, b) => a.gene.localeCompare(b.gene));
    if (rowSort === "fraction") return [...base].sort((a, b) => b.maxFraction - a.maxFraction || b.nPatients - a.nPatients);
    return sortRowsByFrequency(base);
  }, [grid, rowSort, biOnly, tsg]);
  // display rows: role groups (oncogenes, tumour suppressors, ...) with header rows, each group in frequency order
  const displayRows = useMemo(() => (rowSort === "role" ? groupOncoprintRows(rows, "role") : rows.map((g) => ({ gene: g }))), [rows, rowSort]);
  const patients = useMemo(() => sortColumns({ ...grid, rows }, colSort), [grid, rows, colSort]);
  const allPatients = useMemo(() => Object.keys(allEntries), [allEntries]);
  // added genes that still have no row, with the reason (filters drop every entry of that gene)
  const missingAdded = useMemo(() => {
    const byFilter = new Map(filteredAddedGenes(allEntries, sel.addGenes, filters).map((m) => [m.gene, m.reason]));
    return addedGeneGaps(entriesByPatient, sel, grid.rows).map((m) => (byFilter.has(m.gene) ? { ...m, reason: byFilter.get(m.gene) } : m));
  }, [allEntries, entriesByPatient, sel, filters, grid]);

  if (!allPatients.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No filtered events loaded yet." />;

  const open = (patient, entry) => {
    const summary = summaries.find((s) => s.caseReportId === patient);
    if (!summary) return;
    const url = new URL(window.location.href);
    ["report", "tab", "heatmap", "drvopen", "drvpreset", "drvadd", "drvrm", "drvf"].forEach((k) => url.searchParams.delete(k));
    Object.entries(drvOpenParams(patient, entry)).forEach(([k, v]) => url.searchParams.set(k, v));
    window.history.replaceState(window.history.state, "", url.toString());
    dispatch(datasetsActions.openCaseReport(summary.record.datasetId, summary.caseReportId, { allowNewTab: true }));
    dispatch(settingsActions.updateTab("7"));
  };

  const cellW = Math.max(34, Math.min(62, (width - GENE_W - 90) / Math.max(1, patients.length)));
  const top = 112;
  const right = 80;
  const svgW = GENE_W + cellW * patients.length + right;
  const svgH = top + CELL_H * displayRows.length + 8;
  const alpha = (f) => 0.28 + 0.72 * Math.max(0, Math.min(1, f));
  const burden = Object.fromEntries(patients.map((p) => [p, rows.filter((r) => r.cells[p]).length]));
  const barMax = Math.max(1, ...Object.values(burden));
  const fmtRowLabel = (g) => (g.length > 18 ? `${g.slice(0, 17)}…` : g);

  return (
    <Card
      size="small"
      title={<Space><TableOutlined />{`Cross-patient oncoprint (${countsLine({ rows, patients }, result.hidden)})`}<Provenance id="oncoprint" /></Space>}
      extra={<SvgExportButton containerRef={ref} name="cohort-oncoprint" />}
    >
      <Space direction="vertical" size={8} style={{ width: "100%" }}>
        <Space wrap size={[12, 6]}>
          <Segmented size="small" value={sel.preset} onChange={(v) => patch({ preset: v })} options={ONCOPRINT_PRESETS.map((p) => ({ value: p, label: PRESET_NAMES[p] }))} />
          <Space size={4}>
            <Text type="secondary">Class</Text>
            <Select size="small" mode="multiple" allowClear placeholder="all" style={{ minWidth: 160 }} maxTagCount="responsive" value={sel.classes || []} onChange={(v) => patch({ classes: v.length ? v : null })} options={ONCOPRINT_CLASSES.map((c) => ({ value: c, label: CLASS_NAMES[c] }))} />
          </Space>
          <Space size={4}>
            <Text type="secondary">Tier</Text>
            <Select size="small" mode="multiple" allowClear placeholder="any" style={{ minWidth: 90 }} maxTagCount="responsive" value={sel.tiers || []} onChange={(v) => patch({ tiers: v.length ? v : null })} options={[1, 2, 3].map((v) => ({ value: v, label: `${v}` }))} />
          </Space>
          <Space size={4}>
            <Text type="secondary">Min cell fraction</Text>
            <InputNumber size="small" min={0} max={100} step={5} value={Math.round(sel.minFraction * 100)} formatter={(v) => `${v}%`} parser={(v) => `${v}`.replace("%", "")} onChange={(v) => patch({ minFraction: (v || 0) / 100 })} style={{ width: 72 }} />
          </Space>
          <Tooltip title="Hide every cell (patient x event) whose event has a Clade F1 below this value in that patient's tree: how well its carrier cells form one clade. Applies to all event classes including SNVs; truncal events (F1 near 1) stay, and events with no score (no tree or no carrier cells) are never hidden. The page-header Clade F1 filter acts first (it exempts SNVs unless 'incl. SNVs' is on), so a value below the header's only shows what the header kept. This is the lower bound of the Clade F1 range under Filters. Hover a cell for each event's F1.">
            <Space size={4} data-oncoprint-f1>
              <Text strong>Clade F1 &gt;=</Text>
              <InputNumber size="small" min={0} max={1} step={0.05} value={filters.minF1 || 0} onChange={(v) => setFilter({ minF1: Math.max(0, Math.min(1, Number(v) || 0)) })} style={{ width: 70 }} />
              <Text type="secondary">{filters.minF1 > 0 ? `in each patient (hides ${result.hidden?.byFilter?.f1 || 0} event${(result.hidden?.byFilter?.f1 || 0) === 1 ? "" : "s"})` : "in each patient (off)"}</Text>
            </Space>
          </Tooltip>
          <Space size={4}>
            <Text type="secondary">Add genes</Text>
            <Select
              size="small"
              mode="multiple"
              showSearch
              allowClear
              maxTagCount="responsive"
              placeholder="search genes"
              style={{ minWidth: 200, maxWidth: 380 }}
              value={sel.addGenes}
              onChange={(v) => patch({ addGenes: v, removeGenes: sel.removeGenes.filter((g) => !v.map((x) => `${x}`.toUpperCase()).includes(`${g}`.toUpperCase())) })}
              options={choices.map((c) => ({ value: c.gene, label: `${c.gene} (${c.nPatients} pt)` }))}
              filterOption={(input, o) => `${o.label}`.toUpperCase().includes(input.toUpperCase())}
            />
          </Space>
        </Space>
        <Space wrap size={[8, 6]}>
          <Popover
            trigger="click"
            placement="bottomLeft"
            title="Oncoprint filters (all combined with AND)"
            content={
              <FiltersForm
                filters={filters}
                setFilter={setFilter}
                reset={() => {
                  setFilters(DEFAULT_OC_FILTERS);
                  setPasted("");
                }}
                pasted={pasted}
                setPasted={setPasted}
                patients={allPatients}
                hasVerdicts={hasVerdicts}
                hasRna={hasRna}
                hasCgc={cgc != null}
              />
            }
          >
            <Badge count={chips.length} size="small">
              <Button size="small" icon={<FilterOutlined />}>Filters</Button>
            </Badge>
          </Popover>
          {chips.map((c) => (
            <Tooltip key={c.key} title={c.tip}>
              <Tag closable color="blue" onClose={() => setFilters((f) => clearFilter(f, c.key))} style={{ marginInlineEnd: 0 }}>{c.label}</Tag>
            </Tooltip>
          ))}
          {chips.length > 0 && <Button size="small" type="link" onClick={() => { setFilters(DEFAULT_OC_FILTERS); setPasted(""); }}>Reset filters</Button>}
          <Text type="secondary">{countsLine({ rows, patients }, result.hidden)}</Text>
        </Space>
        <Space wrap size={[12, 6]}>
          <Space size={4}>
            <Text type="secondary">Sort rows</Text>
            <Segmented size="small" value={rowSort} onChange={setRowSort} options={[{ value: "frequency", label: "Frequency" }, { value: "fraction", label: "Cell fraction" }, { value: "name", label: "Name" }, { value: "role", label: "Gene role groups" }]} />
          </Space>
          <Space size={4}>
            <Text type="secondary">Sort patients</Text>
            <Segmented size="small" value={colSort} onChange={setColSort} options={[{ value: "exclusivity", label: "Mutual exclusivity" }, { value: "burden", label: "Rows altered" }, { value: "name", label: "Name" }]} />
          </Space>
          <Space size={4}>
            <Switch size="small" checked={showFractions} onChange={setShowFractions} />
            <Text>Fractions</Text>
          </Space>
          <BiallelicSwitch checked={biOnly} onChange={setBiOnly} disabled={!tsg || !tsg.hasLoss} note={tsg && tsg.hasLoss ? "Keep only genes and patients where a tumour suppressor has two hits in the same cells (SNV + LOH / deletion) or both copies deleted" : "not available (_cohort/tsg_loss.json not found: per-cell allelic LOH calls)"} />
          {missingAdded.length > 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ marginTop: 6 }}
              message={`Added but not shown: ${missingAdded.map((m) => `${m.gene} (${m.reason})`).join("; ")}`}
            />
          )}
          {sel.removeGenes.length > 0 && (
            <Space size={4} wrap>
              <Text type="secondary">Hidden</Text>
              {sel.removeGenes.map((g) => (
                <Tag key={g} closable onClose={() => patch({ removeGenes: sel.removeGenes.filter((x) => x !== g) })}>{g}</Tag>
              ))}
              <Button size="small" type="link" onClick={() => patch({ removeGenes: [] })}>Show all</Button>
            </Space>
          )}
        </Space>
      </Space>
      {!rows.length ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No events pass these filters." style={{ marginTop: 16 }} />
      ) : (
        <div ref={ref} style={{ overflowX: "auto", marginTop: 8 }}>
          <svg width={svgW} height={svgH}>
            <text x={GENE_W - 6} y={top - 8} textAnchor="end" fontSize={TYPE.tick} fill={INK.muted}>genes altered (n)</text>
            {patients.map((p, j) => {
              const x = GENE_W + j * cellW;
              const h = (burden[p] / barMax) * 26;
              return (
                <g key={p}>
                  <rect x={x + 3} y={top - 4 - h} width={cellW - 6} height={h} fill={INK.empty} />
                  <text x={x + cellW / 2} y={top - 6 - h} textAnchor="middle" fontSize={TYPE.tick} fill={INK.textSecondary}>{burden[p]}</text>
                  <title>{`${p}: ${burden[p]} of ${rows.length} genes altered (the genes shown after the current filters)`}</title>
                  <text x={x + cellW / 2 - 4} y={top - 38} textAnchor="start" fontSize={FONT.label} fontWeight="600" fill={INK.text} transform={`rotate(-55 ${x + cellW / 2 - 4} ${top - 38})`}>{p}</text>
                </g>
              );
            })}
            {displayRows.map((dr, i) => {
              const y = top + i * CELL_H;
              if (dr.header) {
                return (
                  <g key={`h-${dr.header}`}>
                    <rect x={0} y={y + 2} width={GENE_W + cellW * patients.length} height={CELL_H - 4} fill={INK.empty} opacity={0.35} />
                    <text x={6} y={y + CELL_H / 2} dy="0.35em" fontSize={FONT.axis} fontWeight={700} fill={INK.text}>{`${dr.header} (${dr.n})`}</text>
                  </g>
                );
              }
              const r = dr.gene;
              const note = oncoprintRowNote(r.gene);
              const role = oncoprintRole(r.cells);
              const roleTag = role ? (/oncogene/i.test(role) && /suppressor/i.test(role) ? "OG/TSG" : /oncogene/i.test(role) ? "OG" : /suppressor/i.test(role) ? "TSG" : null) : null;
              const genes = note ? [] : linkGenes(r.gene);
              return (
                <g key={r.gene}>
                  {genes.length === 1 ? (
                    <GeneQuickLookText gene={genes[0]} label={fmtRowLabel(r.gene)} x={GENE_W - 22} y={y + CELL_H / 2} dy="0.35em" textAnchor="end" fontSize={FONT.axis} fill={INK.text} />
                  ) : (
                    <text x={GENE_W - 22} y={y + CELL_H / 2} dy="0.35em" textAnchor="end" fontSize={FONT.axis} fill={INK.text} style={{ textDecoration: note ? "underline dotted" : "none", cursor: note ? "help" : undefined }}>
                      {fmtRowLabel(r.gene)}
                      <title>{note || r.gene}</title>
                    </text>
                  )}
                  {roleTag && (
                    <text x={4} y={y + CELL_H / 2} dy="0.35em" fontSize={10} fill={roleTag === "TSG" ? "#2C7BB6" : roleTag === "OG" ? "#D7191C" : "#8c8c8c"}>
                      {roleTag}
                      <title>{`OncoKB role: ${role}`}</title>
                    </text>
                  )}
                  <text x={GENE_W - 8} y={y + CELL_H / 2} dy="0.35em" textAnchor="end" fontSize={11} fill={INK.muted} style={{ cursor: "pointer" }} onClick={() => patch({ removeGenes: [...sel.removeGenes, r.gene] })}>
                    ×
                    <title>{`Hide the ${r.gene} row`}</title>
                  </text>
                  <text x={GENE_W + cellW * patients.length + 8} y={y + CELL_H / 2} dy="0.35em" fontSize={TYPE.micro} fill={INK.muted}>
                    {`${r.nPatients}/${patients.length} (${pct(r.nPatients / patients.length)})`}
                  </text>
                  {patients.map((p, j) => {
                    const x = GENE_W + j * cellW;
                    const cell = r.cells[p];
                    const classes = cell ? cell.classes : [];
                    const call = cell && tsg ? tsg.index.get(`${p}|${r.gene}`) : null;
                    const biallelic = call && call.state === "biallelic";
                    const stripeH = classes.length ? (CELL_H - 4) / classes.length : 0;
                    return (
                      <g key={p} style={{ cursor: cell ? "pointer" : undefined }} onClick={() => cell && open(p, cell.best)}>
                        <rect x={x + 2} y={y + 2} width={cellW - 4} height={CELL_H - 4} fill={INK.panelAlt} rx={2} />
                        {classes.map((c, k) => {
                          const e = cell.entries.find((d) => d.cls === c);
                          const sy = y + 2 + k * stripeH;
                          return (
                            <g key={c}>
                              <rect x={x + 2} y={sy} width={cellW - 4} height={stripeH} fill={CLASS_COLORS[c]} fillOpacity={alpha(e.fraction)} />
                              <Glyph shape={GLYPH[c]} cx={x + (showFractions ? 10 : cellW / 2)} cy={sy + stripeH / 2} r={Math.max(2.5, Math.min(5, stripeH / 2 - 1))} fill="#fff" />
                              {showFractions && cellW >= 40 && (
                                <text x={x + cellW - 6} y={sy + stripeH / 2} dy="0.35em" textAnchor="end" fontSize={TYPE.micro} fill={e.fraction > 0.45 ? "#fff" : "#262626"} pointerEvents="none">{pct(e.fraction)}</text>
                              )}
                            </g>
                          );
                        })}
                        {biallelic && <TwoHitCell x={x} y={y} w={cellW} h={CELL_H} opacity={alpha(cell.fraction)} label={showFractions && cellW >= 40 ? pct(cell.fraction) : null} />}
                        {cell && (
                          <rect x={x + 2.5} y={y + 2.5} width={cellW - 5} height={CELL_H - 5} fill="none" stroke={INK.text} strokeWidth={cell.clonal ? 1.6 : 1} strokeDasharray={cell.clonal ? undefined : "3 2"} rx={2} pointerEvents="none" />
                        )}
                        {cell && (
                          <title>
                            {`${r.gene} in ${p}\n` +
                              cell.entries.map((d) => `${classLabel(d)}${d.event.Variant && d.event.Variant !== "None" ? ` ${d.event.Variant}` : ""}: ${d.n} cells (${pct(d.fraction)}, ${d.subclonal ? "subclonal" : "clonal"}${d.tier ? `, tier ${d.tier}` : ""}${Number.isFinite(d.fit) ? `, Clade F1 ${d.fit.toFixed(2)}` : ", Clade F1 n/a"})`).join("\n") +
                              ecdnaHoverLines(cell.entries, files[p]?.ecdnaStatus).map((l) => `\n${l}`).join("") +
                              (call ? `\nTwo-hit check: ${call.text}${call.state === "monoallelic" ? `\n(loss data: ${call.lossSource})` : ""}` : tsg && tsg.hasLoss && /suppressor/i.test(`${cell.best?.event?.role || ""}`) ? "\nTwo-hit check: no second hit in the allelic CN" : "") +
                              "\nClick to open the patient on this event."}
                          </title>
                        )}
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>
          {tsg && tsg.hasLoss && <TwoHitLegend style={{ marginTop: 6, marginRight: 12 }} />}
          <Swatches style={{ marginTop: 6 }} items={ONCOPRINT_CLASSES.map((c) => ({ key: c, color: CLASS_COLORS[c], label: `${CLASS_NAMES[c]} (${GLYPH[c]})` }))} />
          <HintLine text="Click a gene name for its card (OncoKB role and drugs, cohort evidence, cBioPortal); × hides a row. OG / TSG = OncoKB oncogene / tumour suppressor; rows are grouped by role (switch with Rows). Structural rows: ecDNA = gGnome DM (double minute), TIC = templated insertion chain, rDup / rDel = reciprocal duplication / deletion pair, BFB = breakage-fusion-bridge; bracketed numbers are chromosomes." />
          <HintLine text="Fill intensity is the fraction of tumour cells that carry the event; the number is that fraction. Solid outline = clonal (more than 95% of cells), dashed = subclonal. Several event classes of one gene stack as stripes. Bars on top count rows altered per patient; the right column counts patients per row. Click a cell to open that patient's Single-Cell tab on the Drivers layer at the event; click a gene name to hide the row." />
        </div>
      )}
    </Card>
  );
}
