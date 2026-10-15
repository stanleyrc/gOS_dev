import React, { useMemo, useState } from "react";
import * as d3 from "d3";
import { Alert, Button, Card, Empty, Radio, Segmented, Select, Skeleton, Space, Switch, Table, Tag, Typography } from "antd";
import { ExperimentOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import useCohortExport from "./useCohortExport";
import { patientColor, FONT } from "./charts";
import { INK } from "../../../helpers/singleCell/plotTheme";
import { ADJUSTMENTS, MEASURES, covariateNames, fmtP, forestRows, geneTable, moduleSummary, scatterPoints } from "../../../helpers/singleCell/tmbAssoc";

const { Text, Paragraph } = Typography;

function Forest({ rows, patients, selected, onSelect, width }) {
  const rowH = 20;
  const M = { top: 22, right: 170, bottom: 8, left: 260 };
  const h = M.top + M.bottom + rows.length * rowH;
  const x = d3.scaleLinear().domain([-0.6, 0.6]).range([M.left, width - M.right]);
  return (
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
              <circle key={d.patient} cx={x(Math.max(-0.6, Math.min(0.6, d.r)))} cy={y} r={3.2} fill={patientColor(patients.indexOf(d.patient))} fillOpacity={0.8} stroke={d.noisy ? "#d4380d" : "none"}>
                <title>{`${d.patient}: partial rho ${d.r.toFixed(2)}, p ${fmtP(d.p)}, n ${d.n}${d.noisy ? " (noisy)" : ""}`}</title>
              </circle>
            ))}
            <rect x={x(Math.max(-0.6, Math.min(0.6, r.comb.mean_r))) - 3} y={y - 6} width={6} height={12} fill={sig ? "#222" : "#999"}>
              <title>{`combined: mean rho ${r.comb.mean_r.toFixed(2)}, Stouffer z ${r.comb.z.toFixed(2)}, p ${fmtP(r.comb.p)}`}</title>
            </rect>
            <text x={width - M.right + 8} y={y + 4} fontSize={FONT.axis} fill={sig ? INK.text : INK.textSecondary}>{`p ${fmtP(r.comb.p)} · ${r.comb.n_concordant}/${r.comb.n_patients} same sign`}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Scatter({ points, patients, width, xTitle, yTitle }) {
  const H = 300;
  const M = { top: 10, right: 12, bottom: 40, left: 60 };
  if (!points.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="not available (no linked cells with this covariate)" />;
  const x = d3.scaleLinear().domain(d3.extent(points, (p) => p.x)).nice().range([M.left, width - M.right]);
  const y = d3.scaleLinear().domain(d3.extent(points, (p) => p.y)).nice().range([H - M.bottom, M.top]);
  return (
    <svg width={width} height={H}>
      <g transform={`translate(0,${H - M.bottom})`}>
        <line x1={M.left} x2={width - M.right} stroke="#999" />
        {x.ticks(6).map((t) => <text key={t} x={x(t)} y={14} textAnchor="middle" fontSize={FONT.axis} fill={INK.textSecondary}>{d3.format("~g")(t)}</text>)}
        <text x={(M.left + width - M.right) / 2} y={32} textAnchor="middle" fontSize={FONT.label} fill={INK.text}>{xTitle}</text>
      </g>
      {y.ticks(5).map((t) => <text key={t} x={M.left - 6} y={y(t) + 4} textAnchor="end" fontSize={FONT.axis} fill={INK.textSecondary}>{d3.format("~g")(t)}</text>)}
      <text transform={`translate(12,${(M.top + H - M.bottom) / 2}) rotate(-90)`} textAnchor="middle" fontSize={FONT.label} fill={INK.text}>{yTitle}</text>
      {points.map((p, i) => (
        <circle key={i} cx={x(p.x)} cy={y(p.y)} r={2.6} fill={patientColor(patients.indexOf(p.patient))} fillOpacity={0.55}>
          <title>{`${p.patient} ${p.cell || ""}${p.state ? ` · ${p.state}` : ""}`}</title>
        </circle>
      ))}
    </svg>
  );
}

const rDot = (v) => (v == null ? "n/a" : v.toFixed(2));

/**
 * Cohort TMB associations (SNVs & signatures): per-cell TMB (total / subclonal / private) against RNA programs, cell cycle, copy number,
 * drivers and genes, partial Spearman per patient and Stouffer-combined (_cohort/tmb_associations.json, srctools gos_sc_tmb_assoc.py).
 */
export default function CohortTmbAssocPanel({ dataset, onGene = null }) {
  const { status, data } = useCohortExport(dataset, "tmb_associations.json");
  const [ref, width] = useContainerWidth(900);
  const [measure, setMeasure] = useState("subclonal");
  const [adjust, setAdjust] = useState("qc_clone_region");
  const [noNoisy, setNoNoisy] = useState(false);
  const [cov, setCov] = useState("S_Score");
  const [dir, setDir] = useState("up");
  const patients = useMemo(() => Object.keys(data?.patients || {}), [data]);
  const rows = useMemo(() => forestRows(data, measure, adjust, noNoisy), [data, measure, adjust, noNoisy]);
  const points = useMemo(() => scatterPoints(data, cov, measure, noNoisy), [data, cov, measure, noNoisy]);
  const genes = useMemo(() => geneTable(data, measure, adjust === "qc_clone_region" ? "qc_clone_region" : "qc_clone_region", dir, noNoisy), [data, measure, adjust, dir, noNoisy]);
  const genesCycle = useMemo(() => geneTable(data, measure, "qc_clone_region_cycle", dir, noNoisy), [data, measure, dir, noNoisy]);
  const [geneVariant, setGeneVariant] = useState("qc_clone_region");
  const mod = useMemo(() => moduleSummary(data), [data]);
  if (status === "loading") return <Skeleton active />;
  if (!data) return <Card size="small" title="TMB associations"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="not available (_cohort/tmb_associations.json not exported; srctools gos_sc_tmb_assoc.py)" /></Card>;
  const gt = geneVariant === "qc_clone_region" ? genes : genesCycle;
  const geneCols = [
    { title: "Gene", dataIndex: "gene", render: (g) => (onGene ? <a onClick={() => onGene(g)}>{g}</a> : g) },
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
        {rows.length ? <Forest rows={rows} patients={patients} selected={cov} onSelect={setCov} width={width} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="not available (no tests for this measure / adjustment)" />}
        <div style={{ marginTop: 12 }}>
          <Space wrap>
            <Text strong>Scatter</Text>
            <Select size="small" showSearch value={cov} onChange={setCov} style={{ width: 320 }} options={covariateNames(data).map((c) => ({ value: c, label: c }))} />
            {patients.map((p, i) => <Tag key={p} color={patientColor(i)}>{p}</Tag>)}
          </Space>
          <Scatter points={points} patients={patients} width={width} xTitle={cov} yTitle={`${measure} TMB (corrected, per Mb)`} />
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
