import React, { useMemo, useState } from "react";
import * as d3 from "d3";
import { useDispatch } from "react-redux";
import { Alert, Card, Empty, Segmented, Select, Skeleton, Slider, Space, Switch, Table, Tag, Typography } from "antd";
import { ApartmentOutlined } from "@ant-design/icons";
import datasetsActions from "../../../redux/datasets/actions";
import settingsActions from "../../../redux/settings/actions";
import useContainerWidth from "../useContainerWidth";
import useCohortExport from "./useCohortExport";
import { patientColor, FONT } from "./charts";
import { INK } from "../../../helpers/singleCell/plotTheme";
import { CLADE_MEASURES, MEASURE_AXIS, VARIANT_SETS, associationTable, bestP, fmtP, maxCladeSize, scatterPoints } from "../../../helpers/singleCell/cladeTmbAssoc";
import { cladeCompareSpecs } from "../../../helpers/singleCell/covariateDe";

const { Text, Paragraph } = Typography;

function CladeTmbScatter({ points, patients, width, xTitle, yTitle, onOpen }) {
  const [tip, setTip] = useState(null);
  const H = 300;
  const M = { top: 10, right: 14, bottom: 42, left: 66 };
  if (!points.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="not available (no clades with this covariate at the current filters)" />;
  const x = d3.scaleLinear().domain(d3.extent(points, (p) => p.x)).nice().range([M.left, width - M.right]);
  const y = d3.scaleLinear().domain(d3.extent(points, (p) => p.y)).nice().range([H - M.bottom, M.top]);
  const rad = d3.scaleSqrt().domain([1, Math.max(2, d3.max(points, (p) => p.n_cells))]).range([2.5, 11]);
  const sorted = [...points].sort((a, b) => b.n_cells - a.n_cells); // big clades first so small ones stay hoverable
  return (
    <div style={{ position: "relative" }}>
      <svg width={width} height={H}>
        <line x1={M.left} x2={width - M.right} y1={H - M.bottom} y2={H - M.bottom} stroke="#999" />
        <line x1={M.left} x2={M.left} y1={M.top} y2={H - M.bottom} stroke="#999" />
        {x.ticks(6).map((t) => <text key={`x${t}`} x={x(t)} y={H - M.bottom + 14} textAnchor="middle" fontSize={FONT.axis} fill={INK.textSecondary}>{d3.format("~g")(t)}</text>)}
        <text x={(M.left + width - M.right) / 2} y={H - 6} textAnchor="middle" fontSize={FONT.label} fill={INK.text}>{xTitle}</text>
        {y.ticks(5).map((t) => <text key={`y${t}`} x={M.left - 6} y={y(t) + 4} textAnchor="end" fontSize={FONT.axis} fill={INK.textSecondary}>{d3.format("~g")(t)}</text>)}
        <text transform={`translate(13,${(M.top + H - M.bottom) / 2}) rotate(-90)`} textAnchor="middle" fontSize={FONT.label} fill={INK.text}>{yTitle}</text>
        {sorted.map((p) => (
          <circle key={`${p.patient}|${p.id}`} cx={x(p.x)} cy={y(p.y)} r={rad(p.n_cells)} fill={patientColor(patients.indexOf(p.patient))} fillOpacity={p.terminal ? 0.8 : 0.3}
            stroke={p.terminal ? "#222" : patientColor(patients.indexOf(p.patient))} strokeWidth={p.terminal ? 1.2 : 0.8} style={{ cursor: "pointer" }}
            onClick={() => onOpen(p)}
            onMouseEnter={(e) => setTip({ p, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })}
            onMouseMove={(e) => setTip({ p, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })}
            onMouseLeave={() => setTip(null)} />
        ))}
      </svg>
      {tip && (
        <div style={{ position: "absolute", left: Math.min(tip.x + 12, width - 230), top: tip.y + 12, background: "rgba(0,0,0,0.85)", color: "#fff", padding: "3px 8px", borderRadius: 3, fontSize: 12, pointerEvents: "none", zIndex: 5, lineHeight: 1.4 }}>
          <div><b>{tip.p.patient}</b> {tip.p.kind === "singleton" ? `single-cell branch ${tip.p.id}` : tip.p.id.replace(/^.*_/, "")}</div>
          <div>{tip.p.clone || "no clone"} · {tip.p.n_cells} cell{tip.p.n_cells === 1 ? "" : "s"} · {tip.p.snv} SNVs · {tip.p.terminal ? "terminal" : "nested (has sub-clades)"}</div>
          <div>covariate {d3.format(".3~g")(tip.p.x)} · TMB {d3.format(".3~g")(tip.p.y)}</div>
          <div style={{ opacity: 0.7 }}>click: open this patient{tip.p.kind === "clade" ? " with the clade vs sister comparison" : ""}</div>
        </div>
      )}
    </div>
  );
}

const rTag = (p, t) => {
  const pv = bestP(t);
  return <Tag key={p} color={t.r > 0 ? "red" : "blue"} style={{ fontWeight: pv < 0.05 ? 700 : 400 }}>{`${p} ${t.r > 0 ? "+" : ""}${t.r.toFixed(2)} (n ${t.n}, p ${fmtP(pv)}${t.p_perm !== undefined ? " perm" : ""})`}</Tag>;
};

/**
 * Cohort "Clade TMB" view: TMB of tree clades (branches) rather than cells, against clade covariates
 * (_cohort/tmb_clade_assoc.json, srctools gos_sc_tmb_clade.py). Toggles: SNV mapping set, branch / cumulative / per-length TMB,
 * single-cell branches, minimum clade size, terminal-only tests. Statistics are computed live (helpers/singleCell/cladeTmbAssoc.js).
 */
export default function CohortCladeTmbPanel({ dataset, summaries = [] }) {
  const dispatch = useDispatch();
  const { status, data } = useCohortExport(dataset, "tmb_clade_assoc.json");
  const [ref, width] = useContainerWidth(900);
  // initial state can come from the URL (?ctv=all|conf|multi|confmulti &ctm=branch|cumulative|rate &ctsing=1 keeps singletons &ctmin=N &ctterm=0 &ctcov=<key>)
  const q = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const [variantSet, setVariantSet] = useState(VARIANT_SETS.some(([v]) => v === q.get("ctv")) ? q.get("ctv") : "all");
  const [measure, setMeasure] = useState(CLADE_MEASURES.some(([v]) => v === q.get("ctm")) ? q.get("ctm") : "branch");
  const [dropSingletons, setDropSingletons] = useState(q.get("ctsing") !== "1");
  const [minCells, setMinCells] = useState(Number(q.get("ctmin")) > 0 ? Number(q.get("ctmin")) : 5);
  const [terminalOnly, setTerminalOnly] = useState(q.get("ctterm") !== "0");
  const [cov, setCov] = useState(q.get("ctcov") || null);
  const lo = dropSingletons ? 5 : 1; // exported tree clades have >= 5 cells; only single-cell branches are smaller
  const opts = { variantSet, measure, minCells: Math.max(minCells, lo), dropSingletons, terminalOnly };
  const patients = useMemo(() => Object.keys(data?.patients || {}), [data]);
  const table = useMemo(() => associationTable(data, opts), [data, variantSet, measure, minCells, dropSingletons, terminalOnly]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = cov && table.some((r) => r.covariate === cov) ? cov : table[0]?.covariate || null;
  const meta = (data?.covariates || []).find((c) => c.key === active);
  const points = useMemo(() => (active ? scatterPoints(data, active, opts) : []), [data, active, variantSet, measure, minCells, dropSingletons]); // eslint-disable-line react-hooks/exhaustive-deps
  const maxSize = useMemo(() => maxCladeSize(data), [data]);
  if (status === "loading") return <Skeleton active />;
  if (!data) return <Card size="small" title="Clade TMB"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="not available (_cohort/tmb_clade_assoc.json not exported; srctools gos_sc_tmb_clade.py)" /></Card>;
  const open = (p) => {
    const summary = summaries.find((s) => `${s.caseReportId}` === `${p.patient}`);
    if (!summary) return;
    const url = new URL(window.location.href);
    url.searchParams.set("report", p.patient);
    url.searchParams.set("tab", "7");
    if (p.kind === "clade") {
      const { a, b } = cladeCompareSpecs(p.id);
      url.searchParams.set("cmpA", a);
      url.searchParams.set("cmpB", b);
    } else {
      url.searchParams.delete("cmpA");
      url.searchParams.delete("cmpB");
    }
    window.history.replaceState(window.history.state, "", url.toString());
    dispatch(datasetsActions.openCaseReport(summary.record.datasetId, summary.caseReportId, { allowNewTab: true }));
    dispatch(settingsActions.updateTab("7"));
  };
  const columns = [
    { title: "Clade covariate", dataIndex: "label", render: (v, r) => <a style={{ fontWeight: r.covariate === active ? 700 : 400 }} onClick={() => setCov(r.covariate)}>{v}</a> },
    { title: "Group", dataIndex: "group", render: (v) => <Text type="secondary">{v}</Text> },
    { title: "Patients", align: "right", render: (_, r) => r.combined?.n_patients ?? 0 },
    { title: "Clades", align: "right", render: (_, r) => r.combined?.n ?? 0 },
    { title: "Mean rho", align: "right", render: (_, r) => (r.combined ? `${r.combined.mean_r > 0 ? "+" : ""}${r.combined.mean_r.toFixed(2)}` : "n/a") },
    { title: "Pooled p (Stouffer)", align: "right", render: (_, r) => <Text strong={r.combined?.p < 0.05}>{fmtP(r.combined?.p)}</Text> },
    { title: "Same sign", align: "right", render: (_, r) => (r.combined ? `${r.combined.n_concordant}/${r.combined.n_patients}` : "n/a") },
    { title: "Per patient: rho (clades, p)", render: (_, r) => Object.entries(r.per_patient).map(([p, t]) => rTag(p, t)) },
  ];
  const na = Object.entries(data.not_available || {});
  const nSingleton = (data.clades || []).filter((r) => r.kind === "singleton").length;
  return (
    <Card size="small" title={<Space><ApartmentOutlined />Clade TMB: burden of tree branches and what it associates with</Space>}>
      <div ref={ref}>
        <Space wrap style={{ marginBottom: 8 }} size={[12, 6]}>
          <Segmented size="small" value={measure} onChange={setMeasure} options={CLADE_MEASURES.map(([v, l]) => ({ value: v, label: l }))} />
          <Select size="small" value={variantSet} onChange={setVariantSet} style={{ width: 250 }} options={VARIANT_SETS.map(([v, l]) => ({ value: v, label: `Mutations mapped: ${l}` }))} />
          <Space size={4}><Switch size="small" checked={dropSingletons} onChange={setDropSingletons} /><Text>remove singletons</Text></Space>
          <Space size={4}>
            <Text>min clade size</Text>
            <Slider style={{ width: 140, margin: "0 6px" }} min={lo} max={Math.min(maxSize, 40)} value={Math.max(minCells, lo)} onChange={setMinCells} />
            <Text strong>{Math.max(minCells, lo)}</Text>
          </Space>
          <Space size={4}><Switch size="small" checked={terminalOnly} onChange={setTerminalOnly} /><Text>tests on terminal clades only</Text></Space>
        </Space>
        <Paragraph type="secondary" style={{ marginBottom: 6 }}>
          {`Unit = tree clade (branch), not cell. ${data.measures?.[measure] || ""}. ${data.variant_sets?.[variantSet] || ""}. "Remove singletons" drops the ${nSingleton} single-cell (private) branches (a lower bound: a site needs alt reads in >= 2 cells to be called). `}
          {terminalOnly ? "Statistics use terminal clades (no sub-clade inside), which do not share cells; all clades are plotted (outlined = terminal). " : "Statistics use all clades, which are nested and share cells, so p-values are optimistic. "}
          Partial Spearman adjusted for clade size per patient (permutation p when n &lt; 20), Stouffer across patients. Technical covariates (clade size, depth, CellPhy branch length) are listed because they mechanically track the SNV count; they are not biology.
        </Paragraph>
        {table.length ? (
          <Table size="small" rowKey="covariate" dataSource={table} columns={columns} pagination={{ pageSize: 12, size: "small", showSizeChanger: false }} scroll={{ x: true }}
            rowClassName={(r) => (r.covariate === active ? "ant-table-row-selected" : "")} />
        ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="not available (no covariate has >= 6 clades in any patient at these filters; lower the minimum clade size or untick terminal only)" />}
        <div style={{ marginTop: 10 }}>
          <Space wrap>
            <Text strong>One point per clade</Text>
            <Select size="small" showSearch optionFilterProp="label" value={active} onChange={setCov} style={{ width: 380 }} options={table.map((r) => ({ value: r.covariate, label: `${r.label} (p ${fmtP(r.combined?.p)})` }))} />
            {patients.map((p, i) => <Tag key={p} color={patientColor(i)}>{p}</Tag>)}
            <Text type="secondary" style={{ fontSize: 12 }}>dot size = cells in clade; outlined = terminal clade; click a dot to open the patient tree comparison</Text>
          </Space>
          <CladeTmbScatter points={points} patients={patients} width={width} onOpen={open}
            xTitle={meta ? `${meta.label} (${meta.unit})` : ""} yTitle={MEASURE_AXIS[measure]} />
        </div>
        <Alert style={{ marginTop: 10 }} type="warning" showIcon message="Caveats"
          description={<ul style={{ margin: 0, paddingLeft: 18 }}>
            {(data.caveats || []).map((c) => <li key={c}>{c}</li>)}
            {na.map(([p, why]) => <li key={p}>{`${p}: ${why}`}</li>)}
          </ul>} />
      </div>
    </Card>
  );
}
