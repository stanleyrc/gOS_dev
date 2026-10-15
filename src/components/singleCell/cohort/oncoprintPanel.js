import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Card, Empty, InputNumber, Select, Space, Switch, Typography } from "antd";
import { TableOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import { EVENT_CLASS_ORDER, TIER_OPTIONS, groupOncoprintRows, oncoprintEventFilter, oncoprintMatrix, oncoprintRole, oncoprintRowNote } from "../../../helpers/singleCell/cohortStats";
import { isStrongEvent } from "../../../helpers/singleCell/strongEvents";
import { FONT, Swatches } from "./charts";
import { setPendingEvent } from "../pendingEventOpener";
import HintLine, { Provenance } from "../hintLine";
import { GeneQuickLookText } from "./geneQuickLook";
import { linkGenes } from "../../../helpers/singleCell/externalLinks";
import { INK, TYPE } from "../../../helpers/singleCell/plotTheme";
import { biallelicOnlyRows } from "../../../helpers/singleCell/twoHit";
import { BiallelicSwitch, TwoHitCell, TwoHitLegend } from "./twoHitGlyph";

const { Text } = Typography;
const CLASS_COLORS = { amp: "#D7191C", homdel: "#2C7BB6", fusion: "#7B3294", trunc: "#1A1A1A", splice: "#E6AB02", missense: "#1B9E77", promoter: "#00838F", complex: "#E66101", other: "#8c8c8c" };
const CELL_W = 64;
const CELL_H = 22;
const GENE_W = 150;

/**
 * Oncoprint across patients: genes x patients, each cell shaded by the
 * fraction of tumor cells carrying the strongest alteration, coloured by
 * its class. Several classes in one gene/patient draw as stacked stripes.
 */
export default function OncoprintPanel({ summaries, files, onOpen, onEvent = null, tsg = null }) {
  const { t } = useTranslation("common");
  const [ref, width] = useContainerWidth(900);
  const [maxTier, setMaxTier] = useState("2d"); // tiers 1-2 plus damaging tier-3 missense
  const [strongOnly, setStrongOnly] = useState(true);
  const [biOnly, setBiOnly] = useState(false); // only tumour-suppressor cells with two hits
  const [maxGenes, setMaxGenes] = useState(40);
  const [classes, setClasses] = useState(EVENT_CLASS_ORDER);
  const [groupBy, setGroupBy] = useState("role"); // "none" | "role": oncogenes, tumour suppressors, both, structural / ecDNA, other // event classes shown (amp, homdel, fusion, ..., complex SV)
  const eventsByPatient = useMemo(
    () => Object.fromEntries(summaries.filter((s) => files[s.caseReportId]?.events).map((s) => [s.caseReportId, files[s.caseReportId].events])),
    [summaries, files]
  );
  const matrix = useMemo(
    () => oncoprintMatrix(eventsByPatient, { maxTier, maxGenes, filter: oncoprintEventFilter({ base: strongOnly ? isStrongEvent : null, classes: classes.length === EVENT_CLASS_ORDER.length ? null : classes }) }),
    [eventsByPatient, maxTier, maxGenes, strongOnly, classes]
  );
  if (!matrix.patients.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.cohort.oncoprint-empty")} />;

  const patients = matrix.patients;
  // rows: genes, optionally grouped by role (each group keeps the oncoprint order: patients carrying, then max fraction)
  const geneRows = biOnly && tsg ? biallelicOnlyRows(matrix.genes, tsg.index) : matrix.genes;
  const rows = groupOncoprintRows(geneRows, groupBy);
  const cellW = Math.max(40, Math.min(CELL_W, (width - GENE_W - 24) / Math.max(1, patients.length)));
  const svgW = GENE_W + cellW * patients.length + 12;
  const top = 70;
  const svgH = top + CELL_H * rows.length + 8;
  const alpha = d3.scaleLinear().domain([0, 1]).range([0.18, 1]);
  const summaryOf = (p) => summaries.find((s) => s.caseReportId === p);
  // per-patient count of altered genes shown, as a header bar
  const perPatient = Object.fromEntries(patients.map((p) => [p, matrix.genes.filter((g) => g.cells[p]).length]));
  const barMax = Math.max(1, ...Object.values(perPatient));

  return (
    <Card
      size="small"
      title={<Space><TableOutlined />{t("components.single-cell.cohort.oncoprint-title")}<Provenance id="oncoprint" /></Space>}
      extra={
        <Space wrap>
          <Text type="secondary">{t("components.single-cell.cohort.oncoprint-tier")}</Text>
          <Select size="small" value={maxTier} onChange={setMaxTier} style={{ width: 200 }} options={TIER_OPTIONS} popupMatchSelectWidth={false} />
          <Text type="secondary">{t("components.single-cell.cohort.oncoprint-genes")}</Text>
          <InputNumber size="small" min={5} max={200} value={maxGenes} onChange={(v) => setMaxGenes(v || 40)} style={{ width: 70 }} />
          <Text type="secondary">Group</Text>
          <Select size="small" value={groupBy} onChange={setGroupBy} style={{ width: 150 }} options={[{ value: "role", label: "by gene role" }, { value: "none", label: "no grouping" }]} />
          <Text type="secondary">Types</Text>
          <Select
            size="small"
            mode="multiple"
            maxTagCount="responsive"
            value={classes}
            onChange={setClasses}
            placeholder="none selected"
            style={{ minWidth: 220 }}
            options={EVENT_CLASS_ORDER.map((c) => ({ value: c, label: t(`components.single-cell.cohort.class-${c}`) }))}
          />
          <Switch size="small" checked={strongOnly} onChange={setStrongOnly} />
          <Text>{t("components.single-cell.events.strong-only")}</Text>
          <BiallelicSwitch checked={biOnly} onChange={setBiOnly} disabled={!tsg || !tsg.hasLoss} note={tsg && tsg.hasLoss ? "Keep only genes and patients where a tumour suppressor has two hits in the same cells (SNV + LOH / deletion) or both copies deleted" : "not available (_cohort/tsg_loss.json not found: per-cell allelic LOH calls)"} />
        </Space>
      }
    >
      <div ref={ref} style={{ overflowX: "auto" }}>
        <svg width={svgW} height={svgH}>
          {patients.map((p, j) => {
            const x = GENE_W + j * cellW;
            const h = (perPatient[p] / barMax) * 28;
            return (
              <g key={p} style={{ cursor: "pointer" }} onClick={() => onOpen(summaryOf(p))}>
                <rect x={x + 4} y={32 - h} width={cellW - 8} height={h} fill="#BAB0AC" />
                <text x={x + cellW / 2} y={30 - h - 3} textAnchor="middle" fontSize={TYPE.tick} fill={INK.textSecondary}>{perPatient[p]}</text>
                <text x={x + cellW / 2} y={top - 10} textAnchor="middle" fontSize={FONT.label} fontWeight="600" fill={INK.text}>
                  {p}
                </text>
              </g>
            );
          })}
          {rows.map((row, i) => {
            const y = top + i * CELL_H;
            if (row.header) {
              return (
                <g key={`h-${row.header}`}>
                  <rect x={0} y={y + 2} width={GENE_W + cellW * patients.length} height={CELL_H - 4} fill={INK.panelAlt} opacity={0.6} />
                  <text x={6} y={y + CELL_H / 2} dy="0.35em" fontSize={FONT.axis} fontWeight={700} fill={INK.text}>{`${row.header} (${row.n})`}</text>
                </g>
              );
            }
            const g = row.gene;
            return (
              <g key={g.gene}>
                {(() => {
                  const short = g.gene.length > 16 ? `${g.gene.slice(0, 15)}…` : g.gene;
                  const note = oncoprintRowNote(g.gene);
                  const role = oncoprintRole(g.cells);
                  const genes = note ? [] : linkGenes(g.gene);
                  const roleTag = role ? (/oncogene/i.test(role) && /suppressor/i.test(role) ? "OG/TSG" : /oncogene/i.test(role) ? "OG" : /suppressor/i.test(role) ? "TSG" : null) : null;
                  return (
                    <>
                      {genes.length === 1 ? (
                        <GeneQuickLookText gene={genes[0]} label={short} x={GENE_W - 8} y={y + CELL_H / 2} dy="0.35em" textAnchor="end" fontSize={FONT.axis} fill={INK.text} />
                      ) : (
                        <text x={GENE_W - 8} y={y + CELL_H / 2} dy="0.35em" textAnchor="end" fontSize={FONT.axis} fill={INK.text} style={{ textDecoration: note ? "underline dotted" : "none", cursor: note ? "help" : undefined }}>
                          {short}
                          <title>{note || g.gene}</title>
                        </text>
                      )}
                      {roleTag && (
                        <text x={4} y={y + CELL_H / 2} dy="0.35em" textAnchor="start" fontSize={10} fill={roleTag === "TSG" ? "#2C7BB6" : roleTag === "OG" ? "#D7191C" : "#8c8c8c"}>
                          {roleTag}
                          <title>{`OncoKB role: ${role}`}</title>
                        </text>
                      )}
                    </>
                  );
                })()}
                <text x={GENE_W - 8} y={y + CELL_H / 2} dy="0.35em" textAnchor="start" fontSize={11} fill={INK.muted} transform={`translate(${cellW * patients.length + 14},0)`}>
                  {`${g.nPatients}/${patients.length}`}
                </text>
                {patients.map((p, j) => {
                  const x = GENE_W + j * cellW;
                  const cell = g.cells[p];
                  const classes = cell ? [...new Set(cell.all.map((e) => e.class))].sort((a, b) => EVENT_CLASS_ORDER.indexOf(a) - EVENT_CLASS_ORDER.indexOf(b)) : [];
                  const stripeH = classes.length ? (CELL_H - 4) / classes.length : 0;
                  const call = cell && tsg ? tsg.index.get(`${p}|${g.gene}`) : null;
                  return (
                    <g
                      key={p}
                      style={{ cursor: cell ? "pointer" : undefined }}
                      onClick={() => {
                        if (!cell) return;
                        if (onEvent) return onEvent(summaryOf(p), cell.event);
                        setPendingEvent(p, cell.event);
                        return onOpen(summaryOf(p));
                      }}
                    >
                      <rect x={x + 2} y={y + 2} width={cellW - 4} height={CELL_H - 4} fill={INK.panelAlt} rx={2} />
                      {cell && (
                        <title>
                          {[`${p} · ${g.gene}`, ...cell.all.slice(0, 6).map((a) => `${a.class}: ${a.event?.Variant && a.event.Variant !== "None" ? a.event.Variant : a.event?.type || ""}${a.event?.Tier ? ` · tier ${a.event.Tier}` : ""}${a.fraction != null ? ` · ${d3.format(".0%")(a.fraction)} of tumor cells` : ""}${a.event?.effect && a.event.effect !== "Unknown" ? ` · ${a.event.effect}` : ""}`), "click for the event details"].join("\n")}
                        </title>
                      )}
                      {classes.map((c, k) => {
                        const e = cell.all.filter((a) => a.class === c).sort((a, b) => (b.fraction ?? 0) - (a.fraction ?? 0))[0];
                        return (
                          <rect key={c} x={x + 2} y={y + 2 + k * stripeH} width={cellW - 4} height={stripeH} fill={CLASS_COLORS[c]} fillOpacity={alpha(e.fraction ?? 1)} rx={classes.length === 1 ? 2 : 0} />
                        );
                      })}
                      {cell && cell.all.some((a) => a.rescued) && <polygon points={`${x + cellW - 2},${y + 2} ${x + cellW - 11},${y + 2} ${x + cellW - 2},${y + 11}`} fill="#fff" stroke="#262626" strokeWidth={0.8} pointerEvents="none" />}
                      {call && call.state === "biallelic" && <TwoHitCell x={x} y={y} w={cellW} h={CELL_H} opacity={alpha(cell.fraction ?? 1)} label={cell.fraction != null ? d3.format(".0%")(cell.fraction) : null} />}
                      {cell && cell.fraction != null && !(call && call.state === "biallelic") && (
                        <text x={x + cellW / 2} y={y + CELL_H / 2} dy="0.35em" textAnchor="middle" fontSize={11} fill={cell.fraction > 0.5 ? "#fff" : "#262626"} pointerEvents="none">
                          {d3.format(".0%")(cell.fraction)}
                        </text>
                      )}
                      {cell && (
                        <title>
                          {cell.all
                            .map((e) => `${e.event.type || e.class}${e.event.Variant ? ` ${e.event.Variant}` : ""}: ${e.cells || ""}${e.fraction != null ? ` (${d3.format(".0%")(e.fraction)})` : ""}${e.rescued ? ` [rescued from site evidence: carriers / covered tumour cells${e.event.low_coverage ? ", low coverage" : ""}; ${e.event.covered_tumour_cells}/${e.event.tumour_cells} tumour cells covered]` : ""}`)
                            .concat(call ? [`Two-hit check: ${call.text}`] : tsg && tsg.hasLoss && /suppressor/i.test(`${cell.event?.role || ""}`) ? ["Two-hit check: no second hit in the allelic CN"] : [])
                            .join("\n")}
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
        <Swatches
          style={{ marginTop: 6 }}
          items={EVENT_CLASS_ORDER.filter((c) => c !== "other").map((c) => ({ key: c, color: CLASS_COLORS[c], label: t(`components.single-cell.cohort.class-${c}`) }))}
        />
        <HintLine text={t("components.single-cell.cohort.oncoprint-help")} />
        <HintLine text="Row labels: click a gene for its card (OncoKB role, drugs, cohort evidence, cBioPortal); OG / TSG = OncoKB oncogene / tumour suppressor. Structural rows: DM = double minute / ecDNA, TIC = templated insertion chain, rDup / rDel = reciprocal duplication / deletion pair, BFB = breakage-fusion-bridge; numbers in brackets are chromosomes (hover a label for its meaning). Hover a cell for the alterations behind it." />
      </div>
    </Card>
  );
}
