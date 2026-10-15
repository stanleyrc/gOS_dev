import React, { useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import { Alert, Card, Empty, Segmented, Skeleton, Space, Table, Tag, Typography } from "antd";
import { DotChartOutlined } from "@ant-design/icons";
import datasetsActions from "../../../redux/datasets/actions";
import settingsActions from "../../../redux/settings/actions";
import { requestEvidence } from "../../../helpers/singleCell/evidenceFocus";
import { QUADRANT_LABEL, Q_CUT, HERITABLE_RHO, extent, fmtEffect, plasticBounds, plasticityRows, scatterPoints } from "../../../helpers/singleCell/ecdnaPlasticity";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import useContainerWidth from "../useContainerWidth";
import usePlotTheme from "../usePlotTheme";
import useCohortExport from "./useCohortExport";
import { patientColor } from "./charts";

const { Text } = Typography;
const H = 340;
const M = { l: 56, r: 16, t: 14, b: 44 };
const QCOLOR = { plastic: "#d9480f", "lineage-bound": "#4E79A7", heritable: "#8c8c8c", unlinked: "#bfbfbf", none: "#bfbfbf" };

/** Open a patient's ecDNA tab (14) on one gene; the tab reads the queued request / ?gene=. */
export function openEcdnaGene(dispatch, summary, gene, source) {
  const url = new URL(window.location.href);
  url.searchParams.set("report", summary.caseReportId);
  url.searchParams.set("tab", "14");
  url.searchParams.set("gene", gene);
  url.searchParams.set("cnsource", source);
  window.history.replaceState(window.history.state, "", url.toString());
  requestEvidence({ kind: "ecplast", patient: summary.caseReportId, gene, source });
  dispatch(datasetsActions.openCaseReport(summary.record.datasetId, summary.caseReportId, { allowNewTab: true }));
  dispatch(settingsActions.updateTab("14"));
}

function PlasticityScatter({ points, patients, theme, onPick, focus }) {
  const [ref, width] = useContainerWidth(700);
  const W = Math.max(320, width);
  const [x0, x1] = extent([...points.map((p) => p.x), HERITABLE_RHO, 0]);
  const [, y1] = extent(points.map((p) => p.y));
  const xl = Math.min(-0.1, x0 - 0.05);
  const xr = Math.max(1, x1 + 0.05);
  const yt = Math.max(0.3, y1 * 1.1);
  const sx = (v) => M.l + ((v - xl) / (xr - xl)) * (W - M.l - M.r);
  const sy = (v) => H - M.b - (v / yt) * (H - M.t - M.b);
  const { yMin } = plasticBounds(points);
  const yTicks = [0, yt / 2, yt];
  return (
    <div ref={ref} style={{ width: "100%" }}>
      <svg width={W} height={H} role="img">
        <title>Heritability of copy number on the DNA tree against its residual effect on cell state</title>
        {yMin != null && (
          <rect x={M.l} y={M.t} width={sx(HERITABLE_RHO) - M.l} height={Math.max(0, sy(yMin) - M.t)} fill={QCOLOR.plastic} opacity={0.07} />
        )}
        <line x1={sx(HERITABLE_RHO)} x2={sx(HERITABLE_RHO)} y1={M.t} y2={H - M.b} stroke={theme.muted} strokeDasharray="4 3" />
        <text x={sx(HERITABLE_RHO) - 4} y={M.t + 11} textAnchor="end" fontSize={TYPE.tick} fill={QCOLOR.plastic} fontWeight={700}>plastic: not heritable, state-linked</text>
        <text x={sx(HERITABLE_RHO) + 4} y={M.t + 11} fontSize={TYPE.tick} fill={theme.muted}>tree-structured</text>
        <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} stroke={theme.muted} />
        <line x1={M.l} x2={M.l} y1={M.t} y2={H - M.b} stroke={theme.muted} />
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={M.l - 4} x2={M.l} y1={sy(v)} y2={sy(v)} stroke={theme.muted} />
            <text x={M.l - 7} y={sy(v)} dy="0.35em" textAnchor="end" fontSize={TYPE.tick} fill={theme.muted}>{v.toFixed(2)}</text>
          </g>
        ))}
        {[0, 0.25, 0.5, 0.75, 1].filter((v) => v >= xl && v <= xr).map((v) => (
          <g key={v}>
            <line x1={sx(v)} x2={sx(v)} y1={H - M.b} y2={H - M.b + 4} stroke={theme.muted} />
            <text x={sx(v)} y={H - M.b + 17} textAnchor="middle" fontSize={TYPE.tick} fill={theme.muted}>{v}</text>
          </g>
        ))}
        <text x={(M.l + W - M.r) / 2} y={H - 6} textAnchor="middle" fontSize={TYPE.label} fill={theme.textSecondary}>CN heritability on the DNA tree (nearest-relative rho; 0 = none)</text>
        <text transform={`rotate(-90 14 ${(M.t + H - M.b) / 2})`} x={14} y={(M.t + H - M.b) / 2} textAnchor="middle" fontSize={TYPE.label} fill={theme.textSecondary}>|residual-CN effect on state| (SD per SD)</text>
        {points.map((p) => {
          const on = focus === p.key;
          return (
            <g key={p.key} style={{ cursor: "pointer" }} onClick={() => onPick(p)}>
              <circle cx={sx(p.x)} cy={sy(p.y)} r={on ? 8 : 6} fill={patientColor(patients.indexOf(p.patient))} fillOpacity={p.sig ? 0.95 : 0.35} stroke={p.sig ? QCOLOR[p.quadrant] : theme.muted} strokeWidth={p.sig ? 2 : 1} />
              <text x={sx(p.x) + 9} y={sy(p.y)} dy="0.35em" fontSize={TYPE.tick} fill={theme.text} fontWeight={p.sig ? 700 : 400}>{p.patient} {p.gene}</text>
              <title>{`${p.patient} ${p.gene}: heritability ${p.x.toFixed(2)}, residual effect ${fmtEffect(p.residBeta, p.residQ)} on ${p.residOutcome}`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * Does copy number of ecDNA-borne oncogenes vary beyond the lineage and move with cell state?
 * Patient x oncogene table (walk copies or total CN), plus heritability vs residual-state effect.
 */
export default function CohortEcdnaPlasticityPanel({ dataset, summaries = [] }) {
  const dispatch = useDispatch();
  const theme = usePlotTheme();
  const { status, data } = useCohortExport(dataset, "ecdna_plasticity.json");
  const [source, setSource] = useState("total");
  const [focus, setFocus] = useState(null);
  const rows = useMemo(() => plasticityRows(data, source), [data, source]);
  const points = useMemo(() => scatterPoints(rows), [rows]);
  const patients = useMemo(() => [...new Set((data?.rows || []).map((r) => r.patient))].sort(), [data]);
  if (status === "loading") return <Skeleton active />;
  if (!data) return <Empty description="ecDNA plasticity is not computed yet (_cohort/ecdna_plasticity.json; srctools gos_sc_ecdna_plasticity.py)." />;
  const open = (r) => {
    const s = summaries.find((x) => `${x.caseReportId}` === `${r.patient}`);
    setFocus(r.key);
    if (s) openEcdnaGene(dispatch, s, r.gene, source);
  };
  const num = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "n/a");
  const effectCol = (title, bKey, qKey, oKey) => ({
    title,
    key: bKey,
    sorter: (a, b) => (Math.abs(a[bKey]) || 0) - (Math.abs(b[bKey]) || 0),
    render: (_, r) => (
      <span style={{ fontWeight: r[qKey] < Q_CUT ? 700 : 400 }} title={r[oKey]}>
        {fmtEffect(r[bKey], r[qKey])} <Text type="secondary">{r[oKey]}</Text>
      </span>
    ),
  });
  const columns = [
    { title: "Patient", dataIndex: "patient", sorter: (a, b) => a.patient.localeCompare(b.patient) },
    { title: "Gene", dataIndex: "gene", sorter: (a, b) => a.gene.localeCompare(b.gene) },
    { title: "Mean CN", dataIndex: "mean", sorter: (a, b) => a.mean - b.mean, render: (v) => num(v, 1) },
    { title: "CV", dataIndex: "cv", sorter: (a, b) => a.cv - b.cv, render: (v) => num(v) },
    { title: "Cells at high CN", dataIndex: "fracHigh", sorter: (a, b) => a.fracHigh - b.fracHigh, render: (v) => `${Math.round(100 * v)}%` },
    {
      title: "CN heritability",
      dataIndex: "herRho",
      sorter: (a, b) => a.herRho - b.herRho,
      render: (v, r) => <span style={{ fontWeight: r.herP < 0.05 ? 700 : 400 }}>{num(v)} <Text type="secondary">p {r.herP < 0.001 ? "<0.001" : num(r.herP, 3)}</Text></span>,
    },
    effectCol("CN to state", "stateBeta", "stateQ", "stateOutcome"),
    effectCol("Residual CN to state", "residBeta", "residQ", "residOutcome"),
    { title: "Expression rho", dataIndex: "exprRho", sorter: (a, b) => (a.exprRho || 0) - (b.exprRho || 0), render: (v) => num(v) },
    {
      title: "Verdict",
      dataIndex: "quadrant",
      filters: Object.keys(QUADRANT_LABEL).filter((k) => k !== "none").map((k) => ({ text: k, value: k })),
      onFilter: (v, r) => r.quadrant === v,
      render: (v) => <Tag color={v === "plastic" ? "volcano" : v === "lineage-bound" ? "blue" : "default"} title={QUADRANT_LABEL[v]}>{v}</Tag>,
    },
  ];
  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Card
        size="small"
        title={<Space><DotChartOutlined />ecDNA plasticity: does oncogene copy number move with cell state beyond the lineage?</Space>}
        extra={
          <Segmented
            size="small"
            value={source}
            onChange={setSource}
            options={[{ value: "total", label: "Total gene CN" }, { value: "walk", label: "ecDNA walk copies" }]}
          />
        }
      >
        <Text type="secondary">
          Per patient and oncogene amplified in at least {Math.round(100 * (data.min_frac ?? 0.1))}% of tumour cells. Heritability: nearest-relative correlation of CN on the DNA tree, permuted within clone.
          Residual CN: copy number minus the leave-one-out clade mean. Effects are rank-based (outcome SD per SD of the CN rank, so one outlier cell cannot carry them) on a program score or state indicator, controlling clone and cycling; q is Benjamini-Hochberg across the cohort. Click a row or point to open the patient ecDNA tab on that gene.
        </Text>
        <Alert type="info" showIcon style={{ margin: "8px 0" }} message="Caveats" description={<ul style={{ margin: 0, paddingLeft: 18 }}>{(data.caveats || []).map((c) => <li key={c}>{c}</li>)}</ul>} />
        <PlasticityScatter points={points} patients={patients} theme={theme} onPick={open} focus={focus} />
      </Card>
      <Card size="small">
        <Table size="small" rowKey="key" dataSource={rows} columns={columns} pagination={false} scroll={{ x: true }} onRow={(r) => ({ onClick: () => open(r), style: { cursor: "pointer" } })} rowClassName={(r) => (r.key === focus ? "ant-table-row-selected" : "")} />
      </Card>
    </Space>
  );
}
