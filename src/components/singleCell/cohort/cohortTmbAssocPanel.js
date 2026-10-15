import React, { useEffect, useMemo, useState } from "react";
import * as d3 from "d3";
import { Alert, Button, Card, Empty, Radio, Segmented, Select, Skeleton, Space, Switch, Table, Tag, Typography } from "antd";
import { ExperimentOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import useCohortExport from "./useCohortExport";
import { patientColor, FONT } from "./charts";
import { INK } from "../../../helpers/singleCell/plotTheme";
import { ADJUSTMENTS, MEASURES, VERDICTS, cladePoints, covariateNames, fmtP, forestRows, geneTable, moduleSummary, robustnessVerdict } from "../../../helpers/singleCell/tmbAssoc";
import { curvePanels, partialRhoLookup } from "../../../helpers/singleCell/tmbCurve";
import { loadRna } from "./cohortRnaPanel";
import { loadRnaMatrix } from "../../../redux/singleCell/loaders";
import { geneValues } from "../../../helpers/singleCell/staticRna";
import GeneQuickLook from "./geneQuickLook";

const { Text, Paragraph } = Typography;

// instant hover label over an svg (native <title> tooltips are slow and hard to hit on small dots)
function useHoverTip() {
  const [tip, setTip] = useState(null);
  const bind = (text) => ({
    onMouseEnter: (e) => setTip({ text, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY }),
    onMouseMove: (e) => setTip({ text, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY }),
    onMouseLeave: () => setTip(null),
  });
  const node = tip ? (
    <div style={{ position: "absolute", left: tip.x + 12, top: tip.y + 12, background: "rgba(0,0,0,0.8)", color: "#fff", padding: "2px 6px", borderRadius: 3, fontSize: 12, pointerEvents: "none", whiteSpace: "nowrap", zIndex: 5 }}>{tip.text}</div>
  ) : null;
  return [bind, node];
}

function CladeScatter({ points, patients, width, xTitle, yTitle }) {
  const H = 260;
  const M = { top: 10, right: 12, bottom: 40, left: 60 };
  if (!points.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="not available (no leaf clades with this covariate)" />;
  const x = d3.scaleLinear().domain(d3.extent(points, (p) => p.x)).nice().range([M.left, width - M.right]);
  const y = d3.scaleLinear().domain(d3.extent(points, (p) => p.y)).nice().range([H - M.bottom, M.top]);
  return (
    <svg width={width} height={H}>
      <line x1={M.left} x2={width - M.right} y1={H - M.bottom} y2={H - M.bottom} stroke="#999" />
      {x.ticks(6).map((t) => <text key={t} x={x(t)} y={H - M.bottom + 14} textAnchor="middle" fontSize={FONT.axis} fill={INK.textSecondary}>{d3.format("~g")(t)}</text>)}
      <text x={(M.left + width - M.right) / 2} y={H - 6} textAnchor="middle" fontSize={FONT.label} fill={INK.text}>{xTitle}</text>
      {y.ticks(5).map((t) => <text key={t} x={M.left - 6} y={y(t) + 4} textAnchor="end" fontSize={FONT.axis} fill={INK.textSecondary}>{d3.format("~g")(t)}</text>)}
      <text transform={`translate(12,${(M.top + H - M.bottom) / 2}) rotate(-90)`} textAnchor="middle" fontSize={FONT.label} fill={INK.text}>{yTitle}</text>
      {points.map((p, i) => <circle key={i} cx={x(p.x)} cy={y(p.y)} r={4} fill={patientColor(patients.indexOf(p.patient))} fillOpacity={0.75}><title>{p.patient}</title></circle>)}
    </svg>
  );
}

function Forest({ rows, patients, selected, onSelect, width }) {
  const rowH = 20;
  const M = { top: 22, right: 220, bottom: 8, left: 260 };
  const h = M.top + M.bottom + rows.length * rowH;
  const x = d3.scaleLinear().domain([-0.6, 0.6]).range([M.left, width - M.right]);
  const [bind, tipNode] = useHoverTip();
  return (
    <div style={{ position: "relative" }}>
    <svg width={width} height={h}>
      <line x1={x(0)} x2={x(0)} y1={M.top - 6} y2={h - M.bottom} stroke={INK.grid || "#ccc"} />
      {[-0.4, -0.2, 0.2, 0.4].map((t) => (
        <text key={t} x={x(t)} y={12} textAnchor="middle" fontSize={FONT.axis} fill={INK.textSecondary}>{t}</text>
      ))}
      <text x={x(0)} y={12} textAnchor="middle" fontSize={FONT.axis} fill={INK.textSecondary}>0</text>
      {rows.map((r, i) => {
        const y = M.top + i * rowH + rowH / 2;
        const sig = r.comb.p < 0.05;
        return (
          <g key={r.covariate} style={{ cursor: "pointer" }} onClick={() => onSelect(r.covariate)}>
            {selected === r.covariate && <rect x={0} y={y - rowH / 2} width={width} height={rowH} fill="#eef3fb" />}
            <text x={M.left - 8} y={y + 4} textAnchor="end" fontSize={FONT.axis} fontWeight={sig ? 700 : 400} fill={INK.text}>{r.covariate.length > 34 ? `${r.covariate.slice(0, 33)}…` : r.covariate}</text>
            {r.dots.map((d) => (
              <g key={d.patient} {...bind(`${d.patient}: partial rho ${d.r.toFixed(2)}, p ${fmtP(d.p)}, n ${d.n}${d.noisy ? " (noisy)" : ""}`)}>
                <circle cx={x(Math.max(-0.6, Math.min(0.6, d.r)))} cy={y} r={7} fill="transparent" />
                <circle cx={x(Math.max(-0.6, Math.min(0.6, d.r)))} cy={y} r={3.6} fill={patientColor(patients.indexOf(d.patient))} fillOpacity={0.85} stroke={d.noisy ? "#d4380d" : "none"} />
              </g>
            ))}
            <rect x={x(Math.max(-0.6, Math.min(0.6, r.comb.mean_r))) - 3} y={y - 6} width={6} height={12} fill={sig ? "#222" : "#999"}>
              <title>{`combined: mean rho ${r.comb.mean_r.toFixed(2)}, Stouffer z ${r.comb.z.toFixed(2)}, p ${fmtP(r.comb.p)}`}</title>
            </rect>
            <text x={width - M.right + 8} y={y + 4} fontSize={FONT.axis} fill={sig ? INK.text : INK.textSecondary}>{`p ${fmtP(r.comb.p)} · q ${fmtP(r.comb.q)} · ${r.comb.n_concordant}/${r.comb.n_patients} same sign`}</text>
          </g>
        );
      })}
    </svg>
    {tipNode}
    </div>
  );
}

const fmt3 = d3.format(".3~g");

/** One small-multiple panel: y against TMB for a patient (raw axes) or all patients (z within patient). */
function CurvePanel({ panel, patients, binned, width, height = 230, xTitle, yTitle, partial }) {
  const [bind, tipNode] = useHoverTip();
  const M = { top: 26, right: 10, bottom: 34, left: 44 };
  const pts = panel.points;
  const lines = panel.pooled ? panel.byPatient.filter((b) => b.bins.length) : panel.bins.length ? [{ patient: panel.patient, bins: panel.bins }] : [];
  const xs = binned ? lines.flatMap((l) => l.bins.map((b) => b.x)) : pts.map((p) => p.x);
  const ys = binned ? lines.flatMap((l) => l.bins.flatMap((b) => [b.lo, b.hi])) : [...pts.map((p) => p.y), ...panel.trend.flatMap((t) => [t.lo, t.hi])];
  if (!xs.length || !ys.length) return <div style={{ width }}><Text strong>{panel.patient}</Text><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="not available (too few cells)" /></div>;
  const x = d3.scaleLinear().domain(d3.extent(xs)).nice().range([M.left, width - M.right]);
  const y = d3.scaleLinear().domain(d3.extent(ys)).nice().range([height - M.bottom, M.top]);
  const color = (p) => (panel.pooled ? patientColor(patients.indexOf(p)) : patientColor(patients.indexOf(panel.patient)));
  const label = `${panel.pooled ? "Pooled" : panel.patient} · n ${panel.n} · rho ${Number.isFinite(panel.rho) ? panel.rho.toFixed(2) : "n/a"}${partial != null ? ` (partial ${partial.toFixed(2)})` : ""}`;
  const area = d3.area().x((t) => x(t.x)).y0((t) => y(t.lo)).y1((t) => y(t.hi));
  const line = d3.line().x((t) => x(t.x)).y((t) => y(t.y));
  return (
    <div style={{ position: "relative", width }}>
      <svg width={width} height={height}>
        <text x={M.left} y={14} fontSize={FONT.label} fontWeight={600} fill={INK.text}>{label}</text>
        <line x1={M.left} x2={width - M.right} y1={height - M.bottom} y2={height - M.bottom} stroke="#999" />
        <line x1={M.left} x2={M.left} y1={M.top} y2={height - M.bottom} stroke="#ddd" />
        {x.ticks(4).map((t) => <text key={t} x={x(t)} y={height - M.bottom + 13} textAnchor="middle" fontSize={FONT.axis} fill={INK.textSecondary}>{d3.format("~g")(t)}</text>)}
        {y.ticks(4).map((t) => <text key={t} x={M.left - 5} y={y(t) + 4} textAnchor="end" fontSize={FONT.axis} fill={INK.textSecondary}>{d3.format("~g")(t)}</text>)}
        <text x={(M.left + width - M.right) / 2} y={height - 4} textAnchor="middle" fontSize={FONT.axis} fill={INK.text}>{panel.pooled ? `${xTitle} (z within patient)` : xTitle}</text>
        <text transform={`translate(11,${(M.top + height - M.bottom) / 2}) rotate(-90)`} textAnchor="middle" fontSize={FONT.axis} fill={INK.text}>{panel.pooled ? `${yTitle} (z)` : yTitle}</text>
        {!binned && (
          <>
            {pts.map((p, i) => (
              <circle key={i} cx={x(p.x)} cy={y(p.y)} r={2.8} fill={color(p.patient)} fillOpacity={0.5} {...bind(`${p.patient}${p.cell ? ` · ${p.cell}` : ""}${p.state ? ` · ${p.state}` : ""} · TMB ${fmt3(p.rawX ?? p.x)} · ${fmt3(p.rawY ?? p.y)}`)} />
            ))}
            {panel.trend.length > 1 && (
              <g {...bind(`${panel.patient}: running median (40% of cells) with 25-75% band`)}>
                <path d={area(panel.trend)} fill="#444" fillOpacity={0.12} />
                <path d={line(panel.trend)} fill="none" stroke="#111" strokeWidth={2} />
              </g>
            )}
          </>
        )}
        {binned && lines.map((l) => (
          <g key={l.patient} {...bind(`${l.patient}: ${l.bins.length} TMB quantile bins, mean ± 95% CI`)}>
            <path d={line(l.bins)} fill="none" stroke={color(l.patient)} strokeWidth={2} />
            {l.bins.map((b) => (
              <g key={b.bin} {...bind(`${l.patient} · TMB bin ${b.bin}/${l.bins.length} (n ${b.n}) · mean ${fmt3(b.y)} [${fmt3(b.lo)}, ${fmt3(b.hi)}]`)}>
                <line x1={x(b.x)} x2={x(b.x)} y1={y(b.lo)} y2={y(b.hi)} stroke={color(l.patient)} />
                <circle cx={x(b.x)} cy={y(b.y)} r={4} fill={color(l.patient)} />
              </g>
            ))}
          </g>
        ))}
      </svg>
      {tipNode}
    </div>
  );
}

/**
 * Y against TMB, continuous: one panel per patient plus a pooled panel (both axes z-scored within patient), each with a running-median
 * trend and band and the Spearman rho (raw) / partial rho (exported); or, in binned mode, mean +- 95% CI per TMB quantile bin, one line per patient.
 */
function TmbCurves({ result, patients, binned, width, xTitle, yTitle, partialPer, status }) {
  if (status === "loading") return <Skeleton active paragraph={{ rows: 3 }} />;
  if (status && status !== "ok") return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`not available (${status})`} />;
  const all = [...(result.pooled ? [result.pooled] : []), ...result.panels];
  if (!all.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="not available (no linked cells with this variable)" />;
  const cols = width >= 1000 ? 4 : width >= 700 ? 3 : 2;
  const w = Math.floor((width - 8) / cols) - 6;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {all.map((panel) => <CurvePanel key={panel.patient} panel={panel} patients={patients} binned={binned} width={w} xTitle={xTitle} yTitle={yTitle} partial={partialPer?.[panel.patient]} />)}
    </div>
  );
}

/** Expression of one gene per DNA-RNA linked cell, read from the RNA matrices the RNA views use: { status, byPatient: { patient: { cellId: value } } }. */
function useGeneExpression(gene, patients, dataset) {
  const [state, setState] = useState({ status: "ok", byPatient: {} });
  const key = patients.join(",");
  useEffect(() => {
    if (!gene) return undefined;
    if (!dataset) {
      setState({ status: "RNA matrices need the cohort dataset", byPatient: {} });
      return undefined;
    }
    let live = true;
    setState({ status: "loading", byPatient: {} });
    Promise.all(
      patients.map(async (p) => {
        try {
          const [rna, matrix] = await Promise.all([loadRna(dataset, p), loadRnaMatrix(dataset, p)]);
          const gi = rna?.summary?.geneIndex.get(gene) ?? rna?.summary?.geneIndex.get(gene.toUpperCase());
          if (gi == null) return [p, null];
          const v = geneValues(matrix, rna.summary.cells.length, gi);
          return [p, Object.fromEntries(rna.summary.cells.map((c, k) => [c.cell_id, v[k]]))];
        } catch (e) {
          return [p, null];
        }
      })
    ).then((pairs) => {
      if (!live) return;
      const byPatient = Object.fromEntries(pairs.filter(([, v]) => v));
      setState(Object.keys(byPatient).length ? { status: "ok", byPatient } : { status: `${gene} is not in the RNA matrices`, byPatient: {} });
    });
    return () => {
      live = false;
    };
  }, [gene, key, dataset]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

const rDot = (v) => (v == null ? "n/a" : v.toFixed(2));

/**
 * Cohort TMB associations (SNVs & signatures): per-cell TMB (total / subclonal / private) against RNA programs, cell cycle, copy number,
 * drivers and genes, partial Spearman per patient and Stouffer-combined (_cohort/tmb_associations.json, srctools gos_sc_tmb_assoc.py).
 */
export default function CohortTmbAssocPanel({ dataset, onGene = null }) { // onGene kept for callers; gene names now open the quick look
  const { status, data } = useCohortExport(dataset, "tmb_associations.json");
  const [ref, width] = useContainerWidth(900);
  const [measure, setMeasure] = useState("subclonal");
  const [adjust, setAdjust] = useState("qc_clone_region");
  const [noNoisy, setNoNoisy] = useState(false);
  const [cov, setCov] = useState("S_Score");
  const [dir, setDir] = useState("up");
  const patients = useMemo(() => Object.keys(data?.patients || {}), [data]);
  const rows = useMemo(() => forestRows(data, measure, adjust, noNoisy), [data, measure, adjust, noNoisy]);
  const [geneVariant, setGeneVariant] = useState("qc_clone_region");
  const [plotGene, setPlotGene] = useState(null); // a gene from the table plotted instead of the covariate
  const [binned, setBinned] = useState(false);
  const expr = useGeneExpression(plotGene, patients, dataset);
  const curves = useMemo(
    () => curvePanels(data, measure, plotGene ? { yByPatient: expr.byPatient, excludeNoisy: noNoisy } : { covariate: cov, excludeNoisy: noNoisy }),
    [data, measure, plotGene, expr.byPatient, cov, noNoisy]
  );
  const partialPer = useMemo(() => partialRhoLookup(data, { gene: plotGene, covariate: cov, measure, adjust: plotGene ? geneVariant : adjust })?.per, [data, plotGene, cov, measure, adjust, geneVariant]);
  const genes = useMemo(() => geneTable(data, measure, adjust === "qc_clone_region" ? "qc_clone_region" : "qc_clone_region", dir, noNoisy), [data, measure, adjust, dir, noNoisy]);
  const genesCycle = useMemo(() => geneTable(data, measure, "qc_clone_region_cycle", dir, noNoisy), [data, measure, dir, noNoisy]);
  const mod = useMemo(() => moduleSummary(data), [data]);
  const cpoints = useMemo(() => cladePoints(data, cov, measure, noNoisy), [data, cov, measure, noNoisy]);
  if (status === "loading") return <Skeleton active />;
  if (!data) return <Card size="small" title="TMB associations"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="not available (_cohort/tmb_associations.json not exported; srctools gos_sc_tmb_assoc.py)" /></Card>;
  const gt = geneVariant === "qc_clone_region" ? genes : genesCycle;
  const geneCols = [
    { title: "Gene", dataIndex: "gene", render: (g) => (
      <Space size={2}>
        <a style={{ fontWeight: plotGene === g ? 700 : 400 }} title="plot against TMB" onClick={() => setPlotGene(g)}>{g}</a>
        <GeneQuickLook gene={g} icon />
      </Space>
    ) },
    { title: "Mean rho", dataIndex: "mean_r", align: "right", render: rDot },
    { title: "z", dataIndex: "z", align: "right", render: (v) => v.toFixed(2) },
    { title: "q", dataIndex: "q", align: "right", render: fmtP },
    { title: "Patients (same sign)", align: "right", render: (_, r) => `${r.n_concordant}/${r.n_patients}` },
    { title: "Per patient rho", render: (_, r) => Object.entries(r.per).map(([p, v]) => <Tag key={p} color={v > 0 ? "red" : "blue"}>{`${p} ${v > 0 ? "+" : ""}${v.toFixed(2)}`}</Tag>) },
  ];
  const sigCols = [
    { title: "Signature fraction", dataIndex: "signature" },
    { title: "Patients", align: "right", render: (_, r) => `${r.combined?.n_patients ?? 0}` },
    { title: "Mean rho", align: "right", render: (_, r) => rDot((noNoisy ? r.combined_no_noisy : r.combined)?.mean_r) },
    { title: "p", align: "right", render: (_, r) => fmtP((noNoisy ? r.combined_no_noisy : r.combined)?.p) },
    { title: "Same sign", align: "right", render: (_, r) => { const c = noNoisy ? r.combined_no_noisy : r.combined; return c ? `${c.n_concordant}/${c.n_patients}` : "n/a"; } },
    { title: "Per patient (clades)", render: (_, r) => Object.entries(r.per_patient).filter(([p]) => !(noNoisy && data.patients[p]?.noisy)).map(([p, t]) => <Tag key={p} color={t.r > 0 ? "red" : "blue"}>{`${p} ${t.r > 0 ? "+" : ""}${t.r.toFixed(2)} (${t.n})`}</Tag>) },
  ];
  const compCols = [{ ...sigCols[0], title: "Clade covariate", dataIndex: "covariate" }, ...sigCols.slice(1)];
  const spCols = [
    { title: "RNA/DNA S-phase vs cell QC", render: (_, r) => `${r.x} vs ${r.qc}` },
    { title: "Mean rho", align: "right", render: (_, r) => rDot(r.combined?.mean_r) },
    { title: "p", align: "right", render: (_, r) => fmtP(r.combined?.p) },
    { title: "Same sign", align: "right", render: (_, r) => (r.combined ? `${r.combined.n_concordant}/${r.combined.n_patients}` : "n/a") },
    { title: "Per patient", render: (_, r) => Object.entries(r.per_patient).map(([p, t]) => <Tag key={p} color={t.r > 0 ? "red" : "blue"}>{`${p} ${t.r > 0 ? "+" : ""}${t.r.toFixed(2)}`}</Tag>) },
  ];
  const sp = (data.sphase_confounding || []).filter((r) => r.x === "S_Score" && ["sensitivity", "callable_frac"].includes(r.qc));
  const na = Object.entries(data.not_available || {});
  const cl = data.clade_level || {};
  return (
    <Card size="small" title={<Space><ExperimentOutlined />TMB associations (RNA, cell cycle, copy number, drivers, signatures)</Space>}
      extra={<Space><Switch size="small" checked={noNoisy} onChange={setNoNoisy} /><Text type="secondary">without noisy patient (BWH69)</Text></Space>}>
      <div ref={ref}>
        <Space wrap style={{ marginBottom: 8 }}>
          <Segmented size="small" value={measure} onChange={setMeasure} options={MEASURES.map(([v, l]) => ({ value: v, label: l }))} />
          <Select size="small" value={adjust} onChange={setAdjust} style={{ width: 210 }} options={ADJUSTMENTS.map(([v, l]) => ({ value: v, label: `Adjust: ${l}` }))} />
        </Space>
        <Paragraph type="secondary" style={{ marginBottom: 4 }}>
          Partial Spearman of per-cell {measure} TMB (dropout-corrected, per callable Mb) with each covariate in DNA-RNA linked tumour cells; dots are patients, the black bar is the weighted mean, text gives the Stouffer p and sign concordance. Click a row for its scatter.
        </Paragraph>
        {rows.length ? <Forest rows={rows} patients={patients} selected={cov} onSelect={(c) => { setCov(c); setPlotGene(null); }} width={width} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="not available (no tests for this measure / adjustment)" />}
        <div style={{ marginTop: 12 }}>
          <Space wrap>
            <Text strong>{plotGene ? `${plotGene} vs TMB` : "Covariate vs TMB"}</Text>
            <Segmented size="small" value={binned ? "binned" : "cells"} onChange={(v) => setBinned(v === "binned")} options={[{ value: "cells", label: "Cells + trend" }, { value: "binned", label: "Binned (quintiles)" }]} />
            {plotGene && <Tag closable onClose={() => setPlotGene(null)}>{plotGene}</Tag>}
            <Select size="small" showSearch value={plotGene ? null : cov} placeholder={plotGene ? `gene ${plotGene}` : undefined} onChange={(c) => { setCov(c); setPlotGene(null); }} style={{ width: 320 }} options={covariateNames(data).map((c) => ({ value: c, label: c }))} />
            {patients.map((p, i) => <Tag key={p} color={patientColor(i)}>{p}</Tag>)}
          </Space>
          <TmbCurves result={curves} patients={patients} binned={binned} width={width} status={plotGene ? expr.status : "ok"} partialPer={partialPer}
            xTitle={`${measure} TMB (per Mb)`} yTitle={plotGene ? `${plotGene} expression` : cov} />
          <Text type="secondary" style={{ fontSize: 12 }}>{`One panel per patient plus the pooled panel (both axes z-scored within patient). Black line: running median over TMB-ordered cells (40% window) with the 25-75% band; rho is Spearman on the plotted cells, partial is the exported covariate-adjusted value. Binned: cells split into TMB quintiles within each patient, mean ± 95% CI. Gene expression is Seurat log-normalised from the RNA matrices (linked tumour cells only). Hover names the patient and cell.`}</Text>
        </div>
        <div style={{ marginTop: 12 }}>
          <Space wrap style={{ marginBottom: 6 }}>
            <Text strong>Genes associated with {measure} TMB</Text>
            <Radio.Group size="small" value={dir} onChange={(e) => setDir(e.target.value)} options={[{ value: "up", label: "positive" }, { value: "down", label: "negative" }]} optionType="button" />
            <Radio.Group size="small" value={geneVariant} onChange={(e) => setGeneVariant(e.target.value)} options={[{ value: "qc_clone_region", label: "QC + clone + region" }, { value: "qc_clone_region_cycle", label: "+ S/G2M score" }]} optionType="button" />
          </Space>
          {gt ? (
            <>
              <Text type="secondary">{`${gt.meta.n_genes} genes tested in >= 2 patients; ${gt.meta.n_q05} with q < 0.05 (${gt.meta.n_q05_concordant} concordant in every patient). Enrichment ${dir === "up" ? "up" : "down"}: ${((gt.meta.enrichment || {})[dir] || []).slice(0, 3).map((e) => `${e.term} (q ${fmtP(e.q)})`).join("; ") || "none"}.`}</Text>
              <Table size="small" rowKey="gene" dataSource={gt.rows} columns={geneCols} pagination={{ pageSize: 10, size: "small" }} />
            </>
          ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="not available (no gene table for this measure)" />}
        </div>
        <div style={{ marginTop: 12 }}>
          <Text strong>Clade level: one point per leaf clade (mean TMB vs mean covariate)</Text>
          <CladeScatter points={cpoints} patients={patients} width={width} xTitle={`clade mean ${cov}`} yTitle={`clade mean ${measure} TMB`} />
        </div>
        <div style={{ marginTop: 12 }}>
          <Text strong>Robustness (main readout: clade level, leaf clades only, subclonal TMB)</Text>
          <Table size="small" pagination={false} rowKey="covariate" scroll={{ x: true }} dataSource={data.robustness || []}
            columns={[
              { title: "Covariate", dataIndex: "covariate", render: (c) => <a onClick={() => setCov(c)}>{c}</a> },
              { title: "Clade-level rho (n clades)", align: "right", render: (_, r) => (r.clade ? `${rDot(r.clade.r)} (${r.clade.n_points})` : "n/a") },
              { title: "p", align: "right", render: (_, r) => fmtP(r.clade?.p) },
              { title: "q (BH)", align: "right", render: (_, r) => fmtP(r.clade?.q) },
              { title: "Per copy rho / p", align: "right", render: (_, r) => (r.per_copy?.clade ? `${rDot(r.per_copy.clade.r)} / ${fmtP(r.per_copy.clade.p)}` : "n/a") },
              { title: "Within-clade permutation p", align: "right", render: (_, r) => fmtP(r.permutation?.p) },
              { title: "Overlap-free rho / p", align: "right", render: (_, r) => (r.overlap_free_applicable ? (r.overlap_free?.clade ? `${rDot(r.overlap_free.clade.r)} / ${fmtP(r.overlap_free.clade.p)}` : "n/a") : "n/a (not a gene set)") },
              { title: "Cell level rho / p / q (QC+clone+region)", align: "right", render: (_, r) => (r.cell ? `${rDot(r.cell.r)} / ${fmtP(r.cell.p)} / ${fmtP(r.cell.q)}` : "n/a") },
              { title: "Verdict", render: (_, r) => { const v = robustnessVerdict(r); return <Tag color={v === VERDICTS.all ? "green" : v === VERDICTS.lineage ? "blue" : "default"}>{v}</Tag>; } },
            ]} />
          <Text type="secondary">{`Shared genes removed for the overlap-free scores: ${Object.entries(data.module_shared_genes_removed || {}).map(([k, v]) => `${k} ${v.length}`).join("; ")} (lists in the export). Per-copy TMB divides by ploidy / 2. Spatial: ${data.spatial?.slidetag || ""}`}</Text>
        </div>
        <div style={{ marginTop: 12 }}>
          <Text strong>MTORC1 module vs per-cell TMB (does the highest-burden-clade signal hold within patient?)</Text>
          <Table size="small" pagination={false} rowKey={(r) => `${r.measure}|${r.adjust}`} dataSource={mod.filter((m) => ["qc", "qc_region", "qc_clone_region"].includes(m.adjust))}
            columns={[
              { title: "TMB", dataIndex: "measure" },
              { title: "Adjust", dataIndex: "adjust" },
              { title: "Mean rho", align: "right", render: (_, r) => rDot(r.combined?.mean_r) },
              { title: "p", align: "right", render: (_, r) => fmtP(r.combined?.p) },
              { title: "Per patient", render: (_, r) => r.perPatient.map((d) => <Tag key={d.patient} color={d.dir === "up" ? "red" : "blue"}>{`${d.patient} ${d.dir === "up" ? "up" : "down"} ${d.r.toFixed(2)}`}</Tag>) },
            ]} />
          <Table size="small" pagination={false} style={{ marginTop: 6 }} rowKey="patient"
            dataSource={Object.entries(data.mtorc1_clade_check || {}).map(([patient, v]) => ({ patient, ...v }))}
            columns={[
              { title: "Highest-TMB clade vs sister cells", dataIndex: "patient" },
              { title: "Clade", dataIndex: "clade", render: (v, r) => v || r.status },
              { title: "n clade / sister", render: (_, r) => (r.clade ? `${r.n_clade} / ${r.n_sister}` : "") },
              { title: "MTORC1 score diff", align: "right", render: (_, r) => (r.clade ? `${r.direction} ${r.mean_diff.toFixed(3)}` : "") },
              { title: "p (region-adjusted)", align: "right", render: (_, r) => (r.clade ? fmtP(r.p_region_adjusted) : "") },
            ]} />
        </div>
        <div style={{ marginTop: 12 }}>
          <Text strong>Signatures (clade level: clade TMB vs signature fraction, within patient)</Text>
          <Table size="small" pagination={false} rowKey="signature" dataSource={cl.signatures || []} columns={sigCols} />
          <Text strong style={{ display: "block", marginTop: 8 }}>Clade TMB vs clade cell-cycle / state composition</Text>
          <Table size="small" pagination={false} rowKey="covariate" dataSource={cl.composition || []} columns={compCols} />
          <Text type="secondary">{`Patient level (descriptive, n <= ${patients.length}): ${(cl.patient_level_tests || []).filter((t) => !t.excluding_noisy && t.tmb === "cell_tmb_median").map((t) => `${t.signature} rho ${t.rho.toFixed(2)}`).join(", ") || "not available"} (median cell TMB vs all-site signature fraction).`}</Text>
        </div>
        <div style={{ marginTop: 12 }}>
          <Text strong>S-phase and callability: does RNA S_Score track DNA coverage / sensitivity?</Text>
          <Table size="small" pagination={false} rowKey={(r) => `${r.x}|${r.qc}`} dataSource={sp} columns={spCols} />
        </div>
        <Alert style={{ marginTop: 12 }} type="warning" showIcon message="Caveats"
          description={<ul style={{ margin: 0, paddingLeft: 18 }}>
            {(data.caveats || []).map((c) => <li key={c}>{c}</li>)}
            {na.map(([p, why]) => <li key={p}>{`${p}: ${why}`}</li>)}
          </ul>} />
        <Button type="link" size="small" style={{ paddingLeft: 0 }} onClick={() => setCov("S_Score")}>reset scatter</Button>
      </div>
    </Card>
  );
}
