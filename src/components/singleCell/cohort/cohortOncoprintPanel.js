import React, { useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import * as d3 from "d3";
import { Button, Card, Empty, InputNumber, Segmented, Select, Space, Switch, Tag, Typography } from "antd";
import { TableOutlined } from "@ant-design/icons";
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
  oncoprintGrid,
  sortColumns,
  sortRowsByFrequency,
} from "../../../helpers/singleCell/cohortOncoprint";
import { classLabel } from "../../../helpers/singleCell/driverLayer";
import { FONT, Swatches } from "./charts";
import HintLine, { Provenance } from "../hintLine";
import { INK, TYPE } from "../../../helpers/singleCell/plotTheme";

const { Text } = Typography;
const CLASS_COLORS = { amp: "#D7191C", homdel: "#2C7BB6", fusion: "#7B3294", snv: "#1B9E77", complex: "#E66101" };
const CLASS_NAMES = { snv: "SNV / indel", amp: "Amplification", homdel: "Homozygous deletion", fusion: "Fusion", complex: "Complex (DM / TIC / BFB)" };
const PRESET_NAMES = { recommended: "Recommended", gbm: "GBM genes", oncokb: "OncoKB / CGC", all: "All" };
const CELL_H = 24;
const GENE_W = 130;
const pct = d3.format(".0%");

/** Glyph of an event class centred at (cx, cy), r = half size. */
function Glyph({ shape, cx, cy, r, fill }) {
  if (shape === "up") return <path d={`M${cx - r},${cy + r} L${cx + r},${cy + r} L${cx},${cy - r} Z`} fill={fill} />;
  if (shape === "down") return <path d={`M${cx - r},${cy - r} L${cx + r},${cy - r} L${cx},${cy + r} Z`} fill={fill} />;
  if (shape === "diamond") return <path d={`M${cx},${cy - r} L${cx + r},${cy} L${cx},${cy + r} L${cx - r},${cy} Z`} fill={fill} />;
  if (shape === "circle") return <circle cx={cx} cy={cy} r={r} fill={fill} />;
  return <rect x={cx - r * 0.8} y={cy - r * 0.8} width={r * 1.6} height={r * 1.6} fill={fill} />;
}

/**
 * Cross-patient oncoprint: genes x patients from every patient's filtered events. Each cell draws the
 * event-class glyph on a fill whose intensity is the fraction of tumour cells carrying it; clonal calls
 * (more than 95% of cells) have a solid outline, subclonal ones a dashed outline. Presets, class / tier /
 * fraction filters, gene picker, row and column sorting. Click a cell: that patient's Single-Cell tab opens
 * on the Drivers layer with the event's drawer.
 */
export default function CohortOncoprintPanel({ summaries, files }) {
  const dispatch = useDispatch();
  const [ref, width] = useContainerWidth(900);
  const [sel, setSel] = useState(DEFAULT_ONCOPRINT);
  const [colSort, setColSort] = useState("exclusivity");
  const [rowSort, setRowSort] = useState("frequency");
  const [showFractions, setShowFractions] = useState(true);
  const patch = (o) => setSel((s) => ({ ...s, ...o }));

  const entriesByPatient = useMemo(
    () => Object.fromEntries(summaries.filter((s) => files[s.caseReportId]?.events).map((s) => [s.caseReportId, cohortEntries(files[s.caseReportId].events)])),
    [summaries, files]
  );
  const choices = useMemo(() => geneChoices(entriesByPatient), [entriesByPatient]);
  const grid = useMemo(() => oncoprintGrid(entriesByPatient, sel), [entriesByPatient, sel]);
  const rows = useMemo(() => {
    if (rowSort === "name") return [...grid.rows].sort((a, b) => a.gene.localeCompare(b.gene));
    if (rowSort === "fraction") return [...grid.rows].sort((a, b) => b.maxFraction - a.maxFraction || b.nPatients - a.nPatients);
    return sortRowsByFrequency(grid.rows);
  }, [grid, rowSort]);
  const patients = useMemo(() => sortColumns({ ...grid, rows }, colSort), [grid, rows, colSort]);

  if (!grid.patients.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No filtered events loaded yet." />;

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
  const svgH = top + CELL_H * rows.length + 8;
  const alpha = (f) => 0.28 + 0.72 * Math.max(0, Math.min(1, f));
  const burden = Object.fromEntries(patients.map((p) => [p, rows.filter((r) => r.cells[p]).length]));
  const barMax = Math.max(1, ...Object.values(burden));
  const fmtRowLabel = (g) => (g.length > 18 ? `${g.slice(0, 17)}…` : g);

  return (
    <Card
      size="small"
      title={<Space><TableOutlined />{`Cross-patient oncoprint (${rows.length} rows x ${patients.length} patients)`}<Provenance id="oncoprint" /></Space>}
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
              onChange={(v) => patch({ addGenes: v })}
              options={choices.map((c) => ({ value: c.gene, label: `${c.gene} (${c.nPatients} pt)` }))}
              filterOption={(input, o) => `${o.label}`.toUpperCase().includes(input.toUpperCase())}
            />
          </Space>
        </Space>
        <Space wrap size={[12, 6]}>
          <Space size={4}>
            <Text type="secondary">Sort rows</Text>
            <Segmented size="small" value={rowSort} onChange={setRowSort} options={[{ value: "frequency", label: "Frequency" }, { value: "fraction", label: "Cell fraction" }, { value: "name", label: "Name" }]} />
          </Space>
          <Space size={4}>
            <Text type="secondary">Sort patients</Text>
            <Segmented size="small" value={colSort} onChange={setColSort} options={[{ value: "exclusivity", label: "Mutual exclusivity" }, { value: "burden", label: "Rows altered" }, { value: "name", label: "Name" }]} />
          </Space>
          <Space size={4}>
            <Switch size="small" checked={showFractions} onChange={setShowFractions} />
            <Text>Fractions</Text>
          </Space>
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
            {patients.map((p, j) => {
              const x = GENE_W + j * cellW;
              const h = (burden[p] / barMax) * 26;
              return (
                <g key={p}>
                  <rect x={x + 3} y={top - 4 - h} width={cellW - 6} height={h} fill={INK.empty} />
                  <text x={x + cellW / 2} y={top - 6 - h} textAnchor="middle" fontSize={TYPE.micro} fill={INK.textSecondary}>{burden[p]}</text>
                  <text x={x + cellW / 2 - 4} y={top - 38} textAnchor="start" fontSize={FONT.label} fontWeight="600" fill={INK.text} transform={`rotate(-55 ${x + cellW / 2 - 4} ${top - 38})`}>{p}</text>
                </g>
              );
            })}
            {rows.map((r, i) => {
              const y = top + i * CELL_H;
              return (
                <g key={r.gene}>
                  <text x={GENE_W - 8} y={y + CELL_H / 2} dy="0.35em" textAnchor="end" fontSize={FONT.axis} fill={INK.text} style={{ cursor: "pointer" }} onClick={() => patch({ removeGenes: [...sel.removeGenes, r.gene] })}>
                    {fmtRowLabel(r.gene)}
                    <title>{`${r.gene}: click to hide this row`}</title>
                  </text>
                  <text x={GENE_W + cellW * patients.length + 8} y={y + CELL_H / 2} dy="0.35em" fontSize={TYPE.micro} fill={INK.muted}>
                    {`${r.nPatients}/${patients.length} (${pct(r.nPatients / patients.length)})`}
                  </text>
                  {patients.map((p, j) => {
                    const x = GENE_W + j * cellW;
                    const cell = r.cells[p];
                    const classes = cell ? cell.classes : [];
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
                        {cell && (
                          <rect x={x + 2.5} y={y + 2.5} width={cellW - 5} height={CELL_H - 5} fill="none" stroke={INK.text} strokeWidth={cell.clonal ? 1.6 : 1} strokeDasharray={cell.clonal ? undefined : "3 2"} rx={2} pointerEvents="none" />
                        )}
                        {cell && (
                          <title>
                            {`${r.gene} in ${p}\n` +
                              cell.entries.map((d) => `${classLabel(d)}${d.event.Variant && d.event.Variant !== "None" ? ` ${d.event.Variant}` : ""}: ${d.n} cells (${pct(d.fraction)}, ${d.subclonal ? "subclonal" : "clonal"}${d.tier ? `, tier ${d.tier}` : ""})`).join("\n") +
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
          <Swatches style={{ marginTop: 6 }} items={ONCOPRINT_CLASSES.map((c) => ({ key: c, color: CLASS_COLORS[c], label: `${CLASS_NAMES[c]} (${GLYPH[c]})` }))} />
          <HintLine text="Fill intensity is the fraction of tumour cells that carry the event; the number is that fraction. Solid outline = clonal (more than 95% of cells), dashed = subclonal. Several event classes of one gene stack as stripes. Bars on top count rows altered per patient; the right column counts patients per row. Click a cell to open that patient's Single-Cell tab on the Drivers layer at the event; click a gene name to hide the row." />
        </div>
      )}
    </Card>
  );
}
