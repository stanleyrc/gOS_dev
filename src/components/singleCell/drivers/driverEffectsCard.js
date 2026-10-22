import React, { useMemo, useState } from "react";
import { Card, Empty, Space, Typography } from "antd";
import useContainerWidth from "../useContainerWidth";
import usePlotTheme from "../usePlotTheme";
import HintLine from "../hintLine";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import { formatP } from "../../../helpers/singleCell/tests";
import { geneValues } from "../../../helpers/singleCell/staticRna";
import { benjaminiHochberg } from "../../../helpers/singleCell/rnaStats";
import { driverGenes, expressionEffect, scoreEffect, stateShift } from "../../../helpers/singleCell/driverSummary";
import { balanceTable } from "../../../helpers/singleCell/driverContrast";
import { useProgramScores } from "./useDriverSummaries";
import { CARRIER_COLOR, COMPARATOR_COLOR } from "./useDriverEvidence";
import { useTooltipGuard } from "../useTooltipGuard";

const { Text } = Typography;
const ROW = 22;

/**
 * Forest plot: one row per effect, the standardised difference between
 * carriers and comparator (Cohen's d, dot) with its 95% CI (line); filled when
 * q < 0.1. Hover a row for the numbers.
 */
function Forest({ rows }) {
  const [ref, width] = useContainerWidth(600);
  const theme = usePlotTheme();
  const [hover, setHover] = useState(null);
  const tipRef = useTooltipGuard(hover, () => setHover(null));
  const M = { left: 210, right: 150, top: 22, bottom: 24 };
  const H = M.top + rows.length * ROW + M.bottom;
  const plotW = Math.max(width - M.left - M.right, 60);
  const lim = Math.min(3, Math.max(1, ...rows.flatMap((r) => [Math.abs(r.lo), Math.abs(r.hi)]).filter(Number.isFinite)));
  const x = (v) => M.left + ((Math.max(-lim, Math.min(lim, v)) + lim) / (2 * lim)) * plotW;
  const ticks = lim >= 2 ? [-lim, -1, 0, 1, lim] : [-1, -0.5, 0, 0.5, 1];
  return (
    <div ref={ref} style={{ width: "100%", position: "relative" }}>
      <svg width={width} height={H} role="img" aria-label="effect sizes of carriers vs comparator">
        <text x={x(-lim)} y={12} fontSize={TYPE.tick} fill={COMPARATOR_COLOR}>
          ← higher in comparator
        </text>
        <text x={x(lim)} y={12} fontSize={TYPE.tick} fill={CARRIER_COLOR} textAnchor="end">
          higher in carriers →
        </text>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={M.top - 4} y2={H - M.bottom} stroke={t === 0 ? theme.axis : theme.grid} strokeDasharray={t === 0 ? undefined : "2 3"} />
            <text x={x(t)} y={H - 8} fontSize={TYPE.tick} fill={theme.muted} textAnchor="middle">
              {Math.abs(t) === lim && lim === 3 ? `${t > 0 ? "≥" : "≤"}${t}` : t}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const y = M.top + i * ROW + ROW / 2;
          const sig = r.q < 0.1;
          const col = !sig ? theme.muted : r.d > 0 ? CARRIER_COLOR : COMPARATOR_COLOR;
          return (
            <g key={r.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={0} y={y - ROW / 2} width={width} height={ROW} fill={hover === i ? theme.hoverFill : "transparent"} />
              {r.section && <line x1={0} x2={width} y1={y - ROW / 2} y2={y - ROW / 2} stroke={theme.border} />}
              <text x={M.left - 10} y={y + 4} fontSize={TYPE.label} fill={theme.text} textAnchor="end" fontWeight={r.bold ? 600 : 400}>
                {r.label}
              </text>
              <line x1={x(r.lo)} x2={x(r.hi)} y1={y} y2={y} stroke={col} strokeWidth={2} />
              <circle cx={x(r.d)} cy={y} r={5} fill={sig ? col : theme.raised} stroke={col} strokeWidth={1.5} />
              <text x={M.left + plotW + 10} y={y + 4} fontSize={TYPE.tick} fill={sig ? theme.text : theme.muted}>
                {r.note}
              </text>
            </g>
          );
        })}
      </svg>
      {hover != null && rows[hover] && (
        <div ref={tipRef} style={{ position: "absolute", left: M.left, top: M.top + (hover + 1) * ROW + 2, zIndex: 2, pointerEvents: "none", background: theme.raised, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 4, padding: "2px 8px", fontSize: TYPE.tick }}>
          {rows[hover].tip}
        </div>
      )}
    </div>
  );
}

/**
 * The driver's effects at a glance for the chosen comparator: its own
 * gene(s) and the GBM state / cycle / hypoxia / interferon programs as
 * standardised differences with 95% CIs (one forest plot), and the cell-state
 * mix as stacked shares.
 */
export default function DriverEffectsCard({ driver, carriers, others, rna }) {
  const { summary, matrix, rowOfId } = rna;
  const programs = useProgramScores(rna);
  const genes = driverGenes(driver.event);
  const data = useMemo(() => {
    if (!summary || !matrix) return null;
    const rows = (ids) => ids.map((id) => rowOfId.get(id)).filter((r) => r != null);
    const rA = rows(carriers);
    const rB = rows(others);
    if (rA.length < 3 || rB.length < 3) return { rA, rB, forest: [], state: [] };
    const out = [];
    genes.forEach((g) => {
      const gi = summary.geneIndex?.get(g);
      if (gi == null) return;
      const v = geneValues(matrix, summary.cells.length, gi);
      const a = rA.map((r) => v[r]);
      const b = rB.map((r) => v[r]);
      const s = scoreEffect(a, b);
      const e = expressionEffect(a, b);
      if (s && e) out.push({ key: `g:${g}`, label: `${g} expression`, bold: true, ...s, fold: 2 ** e.log2fc, detA: e.detA, detB: e.detB });
    });
    programs.forEach((p, k) => {
      const s = scoreEffect(
        rA.map((r) => p.scores[r]),
        rB.map((r) => p.scores[r])
      );
      if (s) out.push({ key: `p:${p.name}`, label: `${p.name} program`, section: k === 0, ...s });
    });
    const q = benjaminiHochberg(out.map((r) => r.p));
    out.forEach((r, k) => {
      r.q = q[k];
      r.note = `${r.d > 0 ? "+" : ""}${r.d.toFixed(2)} SD · ${formatP(r.p)}`;
      r.tip = r.fold
        ? `${r.label}: ${r.fold.toFixed(2)}× mean, detected in ${Math.round(r.detA * 100)}% vs ${Math.round(r.detB * 100)}% of cells; d ${r.d.toFixed(2)} (95% CI ${r.lo.toFixed(2)} to ${r.hi.toFixed(2)}), q ${r.q.toFixed(3)}`
        : `${r.label}: d ${r.d.toFixed(2)} (95% CI ${r.lo.toFixed(2)} to ${r.hi.toFixed(2)}), q ${r.q.toFixed(3)}`;
    });
    const stateField = (summary.fields || []).some((f) => f.name === "state") ? "state" : null;
    const state = stateField ? stateShift(balanceTable(rA, rB, [stateField], (r) => summary.cells[r]?.[stateField] ?? null)[0]?.levels || []) : [];
    return { rA, rB, forest: out, state };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, matrix, rowOfId, carriers, others, programs, genes.join("|")]);

  const title = "Effects at a glance: carriers vs comparator";
  if (!summary) return <Card size="small" title={title}><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No RNA for this patient" /></Card>;
  if (!data || !data.forest.length) return <Card size="small" title={title}><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`Needs 3+ cells with RNA in each group (${data?.rA.length || 0} carriers, ${data?.rB.length || 0} comparator).`} /></Card>;
  const sorted = [...data.state].sort((x, y) => x.level.localeCompare(y.level));
  return (
    <Card size="small" title={title}>
      <Space direction="vertical" size={6} style={{ width: "100%" }}>
        <HintLine text={`Standardised difference (Cohen's d: difference of means in pooled SDs) with 95% CI for the driver's own gene(s) and per-cell program scores; ${data.rA.length} carriers vs ${data.rB.length} comparator cells with RNA. Filled dots: q < 0.1 (BH across rows). |d| ≈ 0.2 small, 0.5 medium, 0.8 large. Not stratified by plate — see the plate table above.`} />
        <Forest rows={data.forest} />
        {sorted.length > 1 && (
          <div>
            <Text strong style={{ fontSize: TYPE.label }}>Cell state mix </Text>
            {data.state[0] && <Text type="secondary" style={{ fontSize: TYPE.label }}>{`(largest shift: ${data.state[0].level} ${Math.round(data.state[0].shareA * 100)}% vs ${Math.round(data.state[0].shareB * 100)}%, ${formatP(data.state[0].p)})`}</Text>}
            {[
              ["shareA", "Carriers", CARRIER_COLOR],
              ["shareB", "Comparator", COMPARATOR_COLOR],
            ].map(([k, name, color]) => (
              <div key={k} style={{ display: "grid", gridTemplateColumns: "92px 1fr", gap: 6, alignItems: "center", marginTop: 3 }}>
                <Text style={{ fontSize: TYPE.tick, color }}>{name}</Text>
                <div style={{ display: "flex", height: 16, borderRadius: 2, overflow: "hidden" }}>
                  {sorted.map((l, i) =>
                    l[k] > 0 ? (
                      <div key={l.level} title={`${l.level}: ${Math.round(l[k] * 100)}%`} style={{ width: `${l[k] * 100}%`, background: STATE_COLORS[i % STATE_COLORS.length], color: "#fff", fontSize: 10, textAlign: "center", lineHeight: "16px", overflow: "hidden" }}>
                        {l[k] >= 0.08 ? `${l.level} ${Math.round(l[k] * 100)}%` : ""}
                      </div>
                    ) : null
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Space>
    </Card>
  );
}

const STATE_COLORS = ["#4e79a7", "#f28e2b", "#59a14f", "#e15759", "#76b7b2", "#b07aa1", "#9c755f"];
