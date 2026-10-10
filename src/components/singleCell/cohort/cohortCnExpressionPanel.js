import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import * as d3 from "d3";
import { Card, Col, Empty, Progress, Row, Segmented, Select, Space, Switch, Table, Typography } from "antd";
import { BoxPlotOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import SvgExportButton from "../svgExportButton";
import { loadRnaMatrix } from "../../../redux/singleCell/loaders";
import { geneValues } from "../../../helpers/singleCell/staticRna";
import { geneLocus } from "../../../helpers/singleCell/dosage";
import { binOf, boxStats, cnBins, cnExpressionStats, locusCn, scaleExpression } from "../../../helpers/singleCell/cnExpression";
import { walkGeneSet } from "../../../helpers/singleCell/figures";
import { readViewLink } from "../../../helpers/singleCell/deepLink";
import { formatP } from "../../../helpers/singleCell/tests";
import { isNormalClone } from "../../../helpers/singleCell/figures";
import { FONT, YAxis } from "./charts";
import { loadRna } from "./cohortRnaPanel";
import HintLine from "../hintLine";
import { INK, TYPE } from "../../../helpers/singleCell/plotTheme";

const { Text } = Typography;
// genes of the deck's EGFR ecDNA dosage figure (Jake Qiu)
const DEFAULT_GENES = ["EGFR", "SOX4", "SEC61G", "GAP43", "HSP90B1", "MRAS", "STMN4", "PTBP2"];
const GENE_INK = ["#6A3D9A", "#283593", "#1B7837", "#B35806"];
const STATES = ["MES", "AC", "OPC", "NPC"];
const STATE_INK = { MES: "#D7262B", AC: "#D18A2C", OPC: "#1B8A3A", NPC: "#3446A0" };
const fmtRho = (r) => (Number.isFinite(r) ? r.toFixed(2) : "–");

/** Patients carrying an ecDNA walk that contains `gene` (walk gene set or nodes over the locus). */
export function patientsWithEcdna(summaries, files, gene) {
  const upper = `${gene}`.toUpperCase();
  return summaries
    .filter((s) => (files[s.caseReportId]?.walks?.walks || []).some((w) => w.circular !== false && walkGeneSet(w).toUpperCase().split("+").includes(upper)))
    .map((s) => s.caseReportId);
}

/** Box plots of 0-1 scaled expression per copy-number bin, one box per gene, medians joined (deck slide 23, left). */
function BinnedBoxes({ records, genes, stats, cnGene, width, height = 380 }) {
  const bins = useMemo(() => cnBins(), []);
  const M = { top: 24, right: 92, bottom: 70, left: 58 };
  const x = d3.scaleBand().domain(bins.map((b) => b.label)).range([M.left, width - M.right]).padding(0.18);
  const y = d3.scaleLinear().domain([0, 1]).range([height - M.bottom, M.top]);
  const sub = d3.scaleBand().domain(genes).range([0, x.bandwidth()]).padding(0.12);
  const boxes = genes.map((g) => bins.map((b, k) => boxStats(records.filter((r) => binOf(bins, r.cn) === k).map((r) => r.scaled[g]))));
  return (
    <svg width={width} height={height} role="img" aria-label={`${genes.join(" and ")} expression by ${cnGene} copy number`}>
      <YAxis scale={y} x0={M.left} x1={width - M.right} title="Normalized expression" ticks={4} format={(v) => v.toFixed(2)} />
      {genes.map((g, gi) => (
        <g key={g}>
          {boxes[gi].map((s, k) => {
            if (!s) return null;
            const x0 = x(bins[k].label) + sub(g);
            const w = sub.bandwidth();
            return (
              <g key={k}>
                <line x1={x0 + w / 2} x2={x0 + w / 2} y1={y(s.whiskerLo)} y2={y(s.whiskerHi)} stroke={INK.text} strokeWidth={1} />
                <rect x={x0} y={y(s.q3)} width={w} height={Math.max(1, y(s.q1) - y(s.q3))} fill={GENE_INK[gi % GENE_INK.length]} fillOpacity={0.35} stroke={INK.text} strokeWidth={1}>
                  <title>{`${g} · ${cnGene} CN ${bins[k].label}: n=${s.n}, median ${s.median.toFixed(2)}`}</title>
                </rect>
                <line x1={x0} x2={x0 + w} y1={y(s.median)} y2={y(s.median)} stroke={INK.text} strokeWidth={2} />
              </g>
            );
          })}
          <path
            d={d3.line().defined((d) => d)(boxes[gi].map((s, k) => (s ? [x(bins[k].label) + x.bandwidth() / 2, y(s.median)] : null)))}
            fill="none"
            stroke={GENE_INK[gi % GENE_INK.length]}
            strokeWidth={2.5}
          />
          {boxes[gi].map((s, k) => s && <circle key={k} cx={x(bins[k].label) + x.bandwidth() / 2} cy={y(s.median)} r={4} fill={GENE_INK[gi % GENE_INK.length]} />)}
          {(() => {
            const last = [...boxes[gi]].reverse().find(Boolean);
            const t = stats?.[g];
            if (!last) return null;
            return (
              <g>
                <text x={width - M.right + 8} y={y(last.median)} dy="0.35em" fontSize={TYPE.label + 2} fill={GENE_INK[gi % GENE_INK.length]}>{g}</text>
                {t && (
                  <text x={width - M.right - 4} y={M.top + 14 + gi * 34} textAnchor="end" fontSize={TYPE.label} fontWeight={600} fill={GENE_INK[gi % GENE_INK.length]}>
                    <tspan x={width - M.right - 4}>{`rho = ${fmtRho(t.rho)}`}</tspan>
                    <tspan x={width - M.right - 4} dy="1.15em">{formatP(t.p)}</tspan>
                  </text>
                )}
              </g>
            );
          })()}
        </g>
      ))}
      {bins.map((b) => (
        <text key={b.label} transform={`translate(${x(b.label) + x.bandwidth() / 2},${height - M.bottom + 12}) rotate(-45)`} textAnchor="end" fontSize={FONT.axis + 1} fill={INK.text}>{b.label}</text>
      ))}
      <line x1={M.left} x2={width - M.right} y1={height - M.bottom} y2={height - M.bottom} stroke={INK.axis} />
      <text x={(M.left + width - M.right) / 2} y={height - 8} textAnchor="middle" fontSize={TYPE.label + 1} fill={INK.text}>{`${cnGene} copy number (total, each cell's genome graph)`}</text>
    </svg>
  );
}

/** -log10(Stouffer p) x sign(rho) per gene / cell state, dot size = weighted rho (deck slide 23, right). */
function StoufferDots({ rows, width, title }) {
  const ROW = 24;
  const groups = [...new Set(rows.map((r) => r.group))];
  const M = { top: 34, right: 90, bottom: 44, left: 120 };
  const height = M.top + rows.length * ROW + (groups.length - 1) * 12 + M.bottom;
  const vals = rows.map((r) => r.score).filter(Number.isFinite);
  const CAP = 12;
  const lim = Math.min(CAP, Math.max(3, d3.max(vals.map(Math.abs)) || 3));
  const x = d3.scaleLinear().domain([-lim * 1.05, lim * 1.05]).range([M.left, width - M.right]).nice();
  const size = d3.scaleSqrt().domain([0, 0.6]).range([2, 11]).clamp(true);
  let yy = M.top;
  const placed = rows.map((r, i) => {
    if (i > 0 && r.group !== rows[i - 1].group) yy += 12;
    const y = yy + ROW / 2;
    yy += ROW;
    return { ...r, y };
  });
  const sig = -Math.log10(0.05);
  return (
    <svg width={width} height={height} role="img" aria-label={title}>
      <text x={(M.left + width - M.right) / 2} y={18} textAnchor="middle" fontSize={TYPE.title} fontWeight={700} fill={INK.text}>{title}</text>
      {[-sig, sig].map((v) => <line key={v} x1={x(v)} x2={x(v)} y1={M.top} y2={yy} stroke="#D7262B" strokeDasharray="4 3" />)}
      <line x1={x(0)} x2={x(0)} y1={M.top} y2={yy} stroke={INK.text} strokeDasharray="4 3" />
      {placed.map((r) => (
        <g key={r.key}>
          <text x={M.left - 8} y={r.y} dy="0.35em" textAnchor="end" fontSize={TYPE.label} fontWeight={600} fill={INK.textSecondary}>{r.label}</text>
          {Number.isFinite(r.score) && Math.abs(r.score) > lim && (
            <text x={x(Math.sign(r.score) * lim) + Math.sign(r.score) * 14} y={r.y} dy="0.35em" textAnchor={r.score > 0 ? "start" : "end"} fontSize={FONT.axis} fill={INK.textSecondary}>{`${r.score > 0 ? "→" : "←"} ${Math.abs(r.score).toFixed(0)}`}</text>
          )}
          {Number.isFinite(r.score) && (
            <circle cx={x(Math.max(-lim, Math.min(lim, r.score)))} cy={r.y} r={size(Math.abs(r.rho) || 0)} fill={r.color || INK.text}>
              <title>{`${r.label}: weighted rho ${fmtRho(r.rho)}, Stouffer ${formatP(r.p)} (${r.n} cells)`}</title>
            </circle>
          )}
        </g>
      ))}
      {groups.map((g) => {
        const ys = placed.filter((r) => r.group === g).map((r) => r.y);
        return (
          <g key={g}>
            <line x1={M.left - 2} x2={M.left - 2} y1={d3.min(ys) - ROW / 2 + 2} y2={d3.max(ys) + ROW / 2 - 2} stroke={INK.text} />
            <text transform={`translate(${width - M.right + 26},${(d3.min(ys) + d3.max(ys)) / 2}) rotate(90)`} textAnchor="middle" fontSize={TYPE.title} fontWeight={700} fill={INK.text}>{g}</text>
          </g>
        );
      })}
      <line x1={M.left} x2={width - M.right} y1={yy + 2} y2={yy + 2} stroke={INK.axis} />
      {x.ticks(5).map((v) => (
        <text key={v} x={x(v)} y={yy + 16} textAnchor="middle" fontSize={FONT.axis} fill={INK.textSecondary}>{v}</text>
      ))}
      <text x={(M.left + width - M.right) / 2} y={yy + 36} textAnchor="middle" fontSize={TYPE.label} fill={INK.text}>−log10(Stouffer p) × sign(rho)</text>
    </svg>
  );
}

/**
 * Copy number of one gene (default EGFR: each cell's total CN at the locus,
 * from its own genome graph, not walk copies) against expression of genes
 * and cell states, across every patient with an ecDNA of that gene: binned
 * box plots (pooled or one patient), Spearman per patient and pooled, and
 * Stouffer's combination across patients.
 */
export default function CohortCnExpressionPanel({ summaries, files, datasets, cnRows = {} }) {
  const genesState = useSelector((s) => s.Genes);
  const link = useMemo(() => readViewLink(), []);
  const [ref, width] = useContainerWidth(1100);
  const [cnGene, setCnGene] = useState(link.cnGene || "EGFR");
  const [genes, setGenes] = useState(link.exprGenes.length ? link.exprGenes : DEFAULT_GENES);
  const [scope, setScope] = useState("ecdna");
  const [tumorOnly, setTumorOnly] = useState(true);
  const [shown, setShown] = useState("pooled");
  const [data, setData] = useState({});
  const [progress, setProgress] = useState(null);

  const ecdnaPatients = useMemo(() => patientsWithEcdna(summaries, files, cnGene), [summaries, files, cnGene]);
  const patients = scope === "ecdna" ? ecdnaPatients : summaries.map((s) => s.caseReportId);
  const locus = geneLocus(genesState, cnGene);
  const ready = patients.filter((p) => cnRows[p]?.cellRows?.length);
  const waiting = patients.length - ready.length;

  // RNA summary + matrix per patient (cached by the loaders)
  useEffect(() => {
    let active = true;
    const todo = ready.filter((p) => !data[p]);
    if (!todo.length) return undefined;
    setProgress(0);
    (async () => {
      const out = {};
      for (let i = 0; i < todo.length; i += 1) {
        const s = summaries.find((x) => x.caseReportId === todo[i]);
        const ds = datasets.find((d) => `${d.id}` === `${s?.record.datasetId}`);
        if (ds) {
          try {
            // eslint-disable-next-line no-await-in-loop
            const [rna, matrix] = await Promise.all([loadRna(ds, todo[i]), loadRnaMatrix(ds, todo[i])]);
            out[todo[i]] = rna?.summary ? { summary: rna.summary, matrix } : { missing: true };
          } catch (error) {
            out[todo[i]] = { missing: true };
          }
        }
        if (!active) return;
        setProgress(Math.round((100 * (i + 1)) / todo.length));
      }
      if (active) {
        setData((prev) => ({ ...prev, ...out }));
        setProgress(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [ready.join(","), datasets]); // eslint-disable-line react-hooks/exhaustive-deps

  const records = useMemo(() => {
    if (!locus) return [];
    const out = [];
    ready.forEach((p) => {
      const d = data[p];
      if (!d?.summary) return;
      const { summary, matrix } = d;
      const rowOf = new Map(cnRows[p].cellRows.map((c) => [c.cellId, c]));
      const expr = Object.fromEntries(
        genes.map((g) => {
          const gi = summary.geneIndex.get(g) ?? summary.geneIndex.get(g.toUpperCase());
          return [g, gi == null ? null : geneValues(matrix, summary.cells.length, gi)];
        })
      );
      summary.cells.forEach((c, k) => {
        const row = c.cell_id && rowOf.get(c.cell_id);
        if (!row) return;
        if (tumorOnly && (isNormalClone(row.clone) || (c.Cell_Type && !/malig/i.test(c.Cell_Type)))) return;
        const cn = locusCn(row.row, locus.start, locus.end);
        if (!Number.isFinite(cn)) return;
        const e = {};
        genes.forEach((g) => (e[g] = expr[g] ? expr[g][k] : NaN));
        const state = `${c.state || ""}`.replace(/-like$/i, "");
        STATES.forEach((st) => (e[`state:${st}`] = c.state == null ? NaN : state === st ? 1 : 0));
        out.push({ patient: p, cellId: c.cell_id, cn, state, expr: e });
      });
    });
    return out;
  }, [ready.join(","), data, genes, locus?.start, tumorOnly, cnRows]); // eslint-disable-line react-hooks/exhaustive-deps

  const withData = [...new Set(records.map((r) => r.patient))];
  const keys = [...genes, ...STATES.map((s) => `state:${s}`)];
  const stats = useMemo(() => cnExpressionStats(records, keys, withData), [records, withData.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const boxGenes = genes.slice(0, 2);
  const shownRecords = useMemo(() => scaleExpression(shown === "pooled" ? records : records.filter((r) => r.patient === shown), boxGenes), [records, shown, boxGenes.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownStats = shown === "pooled" ? stats.pooled : stats.perPatient[shown];
  const dotRows = [
    ...genes.map((g) => ({ key: g, label: g, group: "Gene", ...stats.combined[g] })),
    ...STATES.map((s) => ({ key: s, label: `${s}-like`, group: "Cell state", color: STATE_INK[s], ...stats.combined[`state:${s}`] })),
  ].map((r) => ({ ...r, score: Number.isFinite(r.p) ? -Math.log10(Math.max(r.p, 1e-300)) * Math.sign(r.z || r.rho) : NaN }));

  const tableRows = [
    ...withData.map((p) => ({ key: p, patient: p, n: records.filter((r) => r.patient === p).length, medianCn: d3.median(records.filter((r) => r.patient === p), (r) => r.cn), res: stats.perPatient[p] || {} })),
    { key: "_pooled", patient: "Pooled (all cells)", n: records.length, medianCn: d3.median(records, (r) => r.cn), res: stats.pooled },
    { key: "_stouffer", patient: "Stouffer across patients", n: records.length, res: Object.fromEntries(keys.map((k) => [k, stats.combined[k]])), combined: true },
  ];
  const cell = (t) => (t && Number.isFinite(t.rho) ? <span style={{ color: t.p < 0.05 ? INK.text : INK.muted, fontWeight: t.p < 0.05 ? 600 : 400 }}>{`${fmtRho(t.rho)} (${formatP(t.p)})`}</span> : "–");
  const half = width >= 1100 ? Math.floor((width - 40) / 2) : width - 24;

  return (
    <Card
      size="small"
      title={<Space><BoxPlotOutlined />{`${cnGene} copy number vs expression across patients`}</Space>}
      extra={
        <Space wrap size={10}>
          <Select size="small" showSearch style={{ width: 110 }} value={cnGene} onChange={(g) => { setCnGene(g); setShown("pooled"); }} options={["EGFR", "CDK4", "MDM2", "MYCN", "PDGFRA", "MET"].map((g) => ({ value: g, label: `${g} CN` }))} />
          <Select size="small" mode="tags" maxTagCount="responsive" style={{ minWidth: 260, maxWidth: 420 }} value={genes} onChange={(v) => v.length && setGenes(v)} />
          <Segmented size="small" value={scope} onChange={setScope} options={[{ value: "ecdna", label: `Patients with ${cnGene} ecDNA (${ecdnaPatients.length})` }, { value: "all", label: `All patients (${summaries.length})` }]} />
          <Space size={4}><Switch size="small" checked={tumorOnly} onChange={setTumorOnly} /><Text>Tumor cells</Text></Space>
          <SvgExportButton containerRef={ref} name={`cn-expression-${cnGene}`} />
        </Space>
      }
    >
      <div ref={ref}>
        {(waiting > 0 || progress != null) && (
          <Space style={{ marginBottom: 8 }}>
            <Text type="secondary">{waiting > 0 ? `Reading copy number of ${waiting} patient(s)…` : "Loading expression…"}</Text>
            {progress != null && <Progress percent={progress} size="small" style={{ width: 200 }} />}
          </Space>
        )}
        {!locus ? (
          <Empty description={`${cnGene} not found in the gene list`} />
        ) : !records.length ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={patients.length ? "Linking DNA and RNA cells…" : `No patient has a ${cnGene} ecDNA walk`} />
        ) : (
          <>
            <Space wrap style={{ marginBottom: 6 }} className="sc-cnexpr-patients">
              <Text type="secondary">Patients with {cnGene} ecDNA:</Text>
              <Segmented size="small" value={shown} onChange={setShown} options={[{ value: "pooled", label: `Pooled (${records.length} cells)` }, ...withData.map((p) => ({ value: p, label: `${p} (${records.filter((r) => r.patient === p).length})` }))]} />
            </Space>
            <Row gutter={16}>
              <Col xs={24} xl={12}>
                <BinnedBoxes records={shownRecords} genes={boxGenes} stats={shownStats} cnGene={cnGene} width={half} />
              </Col>
              <Col xs={24} xl={12}>
                <StoufferDots rows={dotRows} width={half} title={`${cnGene} copy number (${withData.length} patients)`} />
              </Col>
            </Row>
            <Table
              size="small"
              pagination={false}
              style={{ marginTop: 8 }}
              dataSource={tableRows}
              columns={[
                { title: "Patient", dataIndex: "patient", key: "patient", render: (v, r) => <Text strong={!!r.combined || r.key === "_pooled"}>{v}</Text> },
                { title: "Cells", dataIndex: "n", key: "n", align: "right" },
                { title: `Median ${cnGene} CN`, dataIndex: "medianCn", key: "cn", align: "right", render: (v) => (Number.isFinite(v) ? v.toFixed(0) : "") },
                ...genes.slice(0, 4).map((g) => ({ title: `ρ ${g}`, key: g, render: (v, r) => cell(r.res[g]) })),
                { title: "ρ NPC-like", key: "npc", render: (v, r) => cell(r.res["state:NPC"]) },
                { title: "ρ MES-like", key: "mes", render: (v, r) => cell(r.res["state:MES"]) },
              ]}
            />
            <HintLine text={`Each point is a tumor cell with matched DNA and RNA. x: ${cnGene} total copy number from the cell's own genome graph (width-weighted over the gene), not walk copies. Expression: Seurat log-normalized, scaled 0–1 for the box plots. Spearman per patient and pooled; Stouffer combines patients (weights √n), dot size = n-weighted mean rho. Cell states enter as 0/1 indicators.`} />
          </>
        )}
      </div>
    </Card>
  );
}
