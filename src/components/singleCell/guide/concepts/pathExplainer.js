import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Segmented, Skeleton, Slider, Space, Tag, Typography } from "antd";
import useContainerWidth from "../../useContainerWidth";
import usePlotTheme from "../../usePlotTheme";
import { PAPER_STATE } from "../../../../helpers/singleCell/paperPalette";
import { makeRng, shuffled } from "../../../../helpers/singleCell/concepts/rng";
import { histogram, indicator, inverseDistanceWeights, pairTransitions, permutationNull, simulateStates, tipDistances, TOY_STATES, yuleTree } from "../../../../helpers/singleCell/concepts/phyloAutocorr";
import { cohortHref, FIG2_MORAN_FILE, fig2Moran, parseTsv, patientHref } from "../../../../helpers/singleCell/concepts/conceptsCatalog";
import { casePath, tryGet } from "../../../../redux/singleCell/loaders";
import ExplainerShell, { RealLink } from "./explainerShell";

const { Text, Paragraph } = Typography;
const N_TIPS = 30;
const N_PERM = 300;
const fmt = (v, d = 2) => (v == null || !Number.isFinite(v) ? "–" : v.toFixed(d));

function TreeSvg({ tree, states, height, width, theme }) {
  const { nodes, tips } = tree;
  const maxDepth = Math.max(...nodes.map((n) => n.depth));
  const dy = (height - 12) / tips.length;
  const dx = (width - 24) / Math.max(1, maxDepth);
  const y = new Array(nodes.length);
  tips.forEach((t, i) => { y[t] = 6 + (i + 0.5) * dy; });
  const fill = (i) => { if (y[i] != null) return y[i]; const c = nodes[i].children.map(fill); y[i] = (Math.min(...c) + Math.max(...c)) / 2; return y[i]; };
  fill(0);
  const x = (i) => 4 + nodes[i].depth * dx;
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      {nodes.filter((n) => n.parent != null).map((n) => (
        <path key={n.id} d={`M${x(n.parent)},${y[n.parent]} V${y[n.id]} H${x(n.id)}`} fill="none" stroke={theme.branch} strokeWidth={1.2} />
      ))}
      {tips.map((t, i) => <circle key={t} cx={x(t)} cy={y[t]} r={Math.min(5, dy / 2.2)} fill={PAPER_STATE[states[i]]} stroke={theme.panel} strokeWidth={0.8}><title>{`tip ${i + 1}: ${states[i]}`}</title></circle>)}
    </svg>
  );
}

function MatrixSvg({ m, size, theme, labels = null, colors = null, values = false, max = null }) {
  const n = m.length;
  const lab = labels ? 34 : 0;
  const c = (size - lab) / n;
  const mx = max ?? Math.max(...m.flat().filter((v) => v != null));
  return (
    <svg width={size} height={size} style={{ display: "block" }}>
      {labels && labels.map((l, i) => (
        <g key={l}>
          <text x={lab - 4} y={lab + (i + 0.6) * c} textAnchor="end" fontSize={11} fill={colors?.[l] || theme.textSecondary}>{l}</text>
          <text x={lab + (i + 0.5) * c} y={lab - 6} textAnchor="middle" fontSize={11} fill={colors?.[l] || theme.textSecondary}>{l}</text>
        </g>
      ))}
      {m.map((row, i) => row.map((v, j) => (
        <g key={`${i}-${j}`}>
          <rect x={lab + j * c} y={lab + i * c} width={c + 0.2} height={c + 0.2} fill={v == null ? theme.empty : theme.accent} fillOpacity={v == null ? 1 : Math.max(0.04, v / (mx || 1))} />
          {values && <text x={lab + (j + 0.5) * c} y={lab + (i + 0.58) * c} textAnchor="middle" fontSize={11.5} fill={v != null && v / (mx || 1) > 0.55 ? "#fff" : theme.text}>{fmt(v)}</text>}
        </g>
      )))}
    </svg>
  );
}

function NullHist({ res, width, theme, color }) {
  const h = 120;
  const lo = Math.min(res.obs ?? 0, ...res.values);
  const hi = Math.max(res.obs ?? 0, ...res.values);
  const pad = (hi - lo) * 0.05 || 0.01;
  const bins = histogram(res.values, 24, lo - pad, hi + pad);
  const maxN = Math.max(...bins.map((b) => b.n), 1);
  const x = (v) => 30 + ((v - (lo - pad)) / (hi - lo + 2 * pad)) * (width - 40);
  const y = (n) => h - 22 - (n / maxN) * (h - 36);
  return (
    <svg width={width} height={h} style={{ display: "block" }}>
      {bins.map((b) => <rect key={b.x0} x={x(b.x0)} y={y(b.n)} width={Math.max(0.5, x(b.x1) - x(b.x0) - 1)} height={h - 22 - y(b.n)} fill={theme.faint} />)}
      <line x1={30} x2={width - 10} y1={h - 22} y2={h - 22} stroke={theme.axis} />
      {res.obs != null && <><line x1={x(res.obs)} x2={x(res.obs)} y1={8} y2={h - 22} stroke={color} strokeWidth={2.5} /><text x={x(res.obs)} y={10} fontSize={11.5} fill={color} textAnchor={x(res.obs) > width - 80 ? "end" : "start"} dx={x(res.obs) > width - 80 ? -4 : 4}>observed</text></>}
      <text x={30} y={h - 6} fontSize={11.5} fill={theme.muted}>{fmt(lo - pad, 3)}</text>
      <text x={width - 10} y={h - 6} fontSize={11.5} fill={theme.muted} textAnchor="end">{fmt(hi + pad, 3)}</text>
      <text x={width / 2} y={h - 6} fontSize={11.5} fill={theme.muted} textAnchor="middle">{`Moran's I, ${res.values.length} shuffles`}</text>
    </svg>
  );
}

function PathToy() {
  const theme = usePlotTheme();
  const [treeSeed, setTreeSeed] = useState(3);
  const [h, setH] = useState(0.8);
  const [shuffleSeed, setShuffleSeed] = useState(null);
  const [focus, setFocus] = useState("MES");
  const tree = useMemo(() => yuleTree(N_TIPS, treeSeed), [treeSeed]);
  const dist = useMemo(() => tipDistances(tree), [tree]);
  const W = useMemo(() => inverseDistanceWeights(dist), [dist]);
  const base = useMemo(() => simulateStates(tree, h), [tree, h]);
  const states = useMemo(() => (shuffleSeed == null ? base : shuffled(base, makeRng(shuffleSeed))), [base, shuffleSeed]);
  const stats = useMemo(() => Object.fromEntries(TOY_STATES.map((s) => [s, permutationNull(indicator(states, s), W, N_PERM, 17)])), [states, W]);
  const P = useMemo(() => pairTransitions(states, dist), [states, dist]);
  const [ref, width] = useContainerWidth(1000);
  const narrow = width < 760;
  const col = narrow ? width : Math.floor((width - 32) / 3);
  const res = stats[focus];
  return (
    <Space direction="vertical" size={10} style={{ width: "100%" }}>
      <Paragraph style={{ marginBottom: 0 }}>
        A toy tree of {N_TIPS} cells; tip colour is a cell state. States are simulated down the tree: on each branch the state is kept or redrawn at random, and the <Text strong>heritability</Text> slider sets how rarely it is redrawn (left: every branch redraws, so states are independent of the tree; right: whole clades keep their state).
      </Paragraph>
      <Space wrap size={[16, 8]}>
        <Space size={6}><Text>heritability</Text><Text type="secondary">random</Text><Slider style={{ width: 160 }} min={0} max={1} step={0.02} value={h} onChange={(v) => { setH(v); setShuffleSeed(null); }} /><Text type="secondary">clade-structured</Text></Space>
        <Button size="small" onClick={() => setShuffleSeed((s) => (s ?? 100) + 1)}>Shuffle states (null)</Button>
        <Button size="small" onClick={() => { setH(0.92); setShuffleSeed(null); }}>Make clade-heritable</Button>
        <Button size="small" onClick={() => { setTreeSeed((s) => s + 1); setShuffleSeed(null); }}>New tree</Button>
        {shuffleSeed != null && <Tag color="orange">states shuffled over the tips</Tag>}
      </Space>
      <div ref={ref} style={{ display: "flex", flexWrap: "wrap", gap: 16, width: "100%" }}>
        <div style={{ width: col }}>
          <Text strong>Tree and tip states</Text>
          <TreeSvg tree={tree} states={states} width={col} height={300} theme={theme} />
          <Space size={10} wrap>{TOY_STATES.map((s) => <Text key={s} style={{ color: PAPER_STATE[s], fontSize: 12.5 }}>● {s}</Text>)}</Space>
        </div>
        <div style={{ width: col }}>
          <Text strong>Phylogenetic weights</Text>
          <div><Text type="secondary" style={{ fontSize: 12.5 }}>w = 1 / node distance between two cells, in tip order (darker = closer relatives), normalised to sum 1</Text></div>
          <MatrixSvg m={W} size={Math.min(col, 280)} theme={theme} />
        </div>
        <div style={{ width: col }}>
          <Text strong>Moran's I per state</Text>
          <style>{".sc-concepts-table td { padding: 2px 12px 2px 0; }"}</style>
          <table className="sc-concepts-table" style={{ fontSize: 13, borderCollapse: "collapse", marginTop: 4 }}>
            <thead><tr>{["state", "cells", "I", "z", "p"].map((c) => <th key={c} style={{ textAlign: "left", padding: "2px 10px 2px 0", color: theme.textSecondary, fontWeight: 600 }}>{c}</th>)}</tr></thead>
            <tbody>
              {TOY_STATES.map((s) => (
                <tr key={s} style={{ cursor: "pointer", background: s === focus ? theme.selectFill : undefined }} onClick={() => setFocus(s)}>
                  <td style={{ color: PAPER_STATE[s], padding: "2px 10px 2px 0" }}>● {s}</td>
                  <td>{states.filter((x) => x === s).length}</td>
                  <td>{fmt(stats[s].obs, 3)}</td>
                  <td style={{ fontWeight: stats[s].z > 1.96 ? 700 : 400 }}>{fmt(stats[s].z)}</td>
                  <td>{stats[s].obs == null ? "absent" : fmt(stats[s].p, 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 6 }}><Segmented size="small" options={TOY_STATES} value={focus} onChange={setFocus} /></div>
          {res.obs != null ? <NullHist res={res} width={col} theme={theme} color={PAPER_STATE[focus]} /> : <Text type="secondary">{`${focus} is absent from the tips: no I.`}</Text>}
          <Text type="secondary" style={{ fontSize: 12.5 }}>z = (observed I − mean of shuffles) / sd of shuffles; grey: I after shuffling the states over the tips.</Text>
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
        <div>
          <Text strong>Transitions between close relatives</Text>
          <MatrixSvg m={P} size={230} theme={theme} labels={TOY_STATES} colors={PAPER_STATE} values max={1} />
        </div>
        <Text type="secondary" style={{ fontSize: 12.5, maxWidth: 520 }}>
          Row a, column b: among cells in state a, the weighted share of their close relatives (node distance ≤ 3) in state b. A heavy diagonal means states are inherited; off-diagonal mass shows which states turn into which. PATH fits a Markov transition model to these phylogenetic pair statistics to get transition rates; this matrix is the simplified, model-free view of the same signal.
        </Text>
      </div>
    </Space>
  );
}

/** Figure 2 Moran's I z per patient and state, old (Jake) vs new trees, from _cohort/fig2_moran_I_by_patient_state.tsv. */
function Fig2Moran({ dataset }) {
  const theme = usePlotTheme();
  const [state, setState] = useState({ status: "loading" });
  const [ref, width] = useContainerWidth(900);
  useEffect(() => {
    if (!dataset) { setState({ status: "ok", m: fig2Moran([]) }); return undefined; }
    let live = true;
    tryGet(casePath(dataset, "_cohort", FIG2_MORAN_FILE), { responseType: "text" })
      .then((r) => live && setState({ status: "ok", m: fig2Moran(r.status === "ok" ? parseTsv(r.data) : []) }))
      .catch(() => live && setState({ status: "ok", m: fig2Moran([]) }));
    return () => { live = false; };
  }, [dataset]);
  if (state.status === "loading") return <Skeleton active paragraph={{ rows: 3 }} />;
  const { m } = state;
  if (!m.ok) return <Alert type="info" showIcon message={`Figure 2 Moran's I: not available (${m.reason})`} />;
  const label = 64;
  const panelW = Math.max(120, (width - label) / m.states.length);
  const rowH = 20;
  const top = 22;
  const zs = m.patients.flatMap((p) => m.states.flatMap((s) => m.sources.map((src) => m.get(p, s, src)?.Z))).filter(Number.isFinite);
  const lo = Math.min(-2, ...zs);
  const hi = Math.max(3, ...zs);
  const x = (k, z) => label + k * panelW + 8 + ((z - lo) / (hi - lo)) * (panelW - 16);
  const h = top + m.patients.length * rowH + 26;
  const isNew = (src) => /new/i.test(src);
  return (
    <div ref={ref} style={{ width: "100%" }}>
      <svg width={width} height={h} style={{ display: "block" }}>
        {m.states.map((s, k) => (
          <g key={s}>
            <text x={label + k * panelW + panelW / 2} y={14} textAnchor="middle" fontSize={12.5} fontWeight={600} fill={PAPER_STATE[s] || theme.text}>{s}</text>
            <rect x={label + k * panelW + 8} y={top - 4} width={panelW - 16} height={m.patients.length * rowH + 4} fill={theme.band} />
            {[0, 1.96].map((z) => <line key={z} x1={x(k, z)} x2={x(k, z)} y1={top - 4} y2={top + m.patients.length * rowH} stroke={z ? theme.danger : theme.axis} strokeDasharray={z ? "3 3" : null} />)}
            <text x={x(k, 1.96)} y={h - 12} textAnchor="middle" fontSize={11} fill={theme.danger}>1.96</text>
            <text x={x(k, 0)} y={h - 12} textAnchor="middle" fontSize={11} fill={theme.muted}>0</text>
          </g>
        ))}
        {m.patients.map((p, i) => {
          const yy = top + i * rowH + rowH / 2;
          return (
            <g key={p}>
              <a href={patientHref(p, 8)} target="_blank" rel="noopener noreferrer"><text x={label - 6} y={yy + 4} textAnchor="end" fontSize={12} fill={theme.accent}>{p}</text></a>
              {m.states.map((s, k) => {
                const pts = m.sources.map((src) => ({ src, r: m.get(p, s, src) })).filter((d) => d.r && Number.isFinite(d.r.Z));
                return (
                  <g key={s}>
                    {pts.length === 2 && <line x1={x(k, pts[0].r.Z)} x2={x(k, pts[1].r.Z)} y1={yy} y2={yy} stroke={theme.faint} />}
                    {pts.map(({ src, r }) => (
                      <circle key={src} cx={x(k, r.Z)} cy={yy} r={4.5} fill={isNew(src) ? PAPER_STATE[s] || theme.text : theme.panel} stroke={PAPER_STATE[s] || theme.text} strokeWidth={1.6}>
                        <title>{`${p} ${s}, ${src}: Moran's I ${fmt(r.I, 3)}, z ${fmt(r.Z)}${r.n ? `, ${r.n} cells` : ""}`}</title>
                      </circle>
                    ))}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      <Text type="secondary" style={{ fontSize: 12.5 }}>Moran's I z of each RNA state on each patient's tree (PATH): hollow = earlier trees (Jake Qiu), filled = the new trees of this paper. Right of the dashed line: the state is significantly heritable. Real values, read from the Figure 2 table; click a patient to open its RNA tab.</Text>
    </div>
  );
}

export default function PathExplainer({ concept, dataset, onView }) {
  const cLink = (v, label) => <RealLink href={cohortHref(v)} onClick={onView ? () => onView(v) : null}>{label}</RealLink>;
  return (
    <ExplainerShell
      title={concept.title}
      intro={[
        "If a cell state is passed from mother to daughter cells, cells that are close relatives on the phylogeny will tend to share it. If states switch freely, a cell's state says nothing about its relatives'.",
        "PATH (phylogenetic analysis of trait heritability) measures this with phylogenetic autocorrelation: Moran's I, a weighted correlation of a trait across all pairs of cells, with weights that are high for close relatives. I is compared with the values obtained when the states are shuffled over the tips, which gives a z score.",
        "PATH then uses the same pair statistics to estimate how often each state turns into each other state, which separates heritable states from plastic ones.",
      ]}
      toy={<PathToy />}
      paper={(
        <Space direction="vertical" size={8} style={{ width: "100%" }}>
          <Text>Figure 2 of the paper asks whether glioblastoma cell states (AC, MES, NPC, OPC from the matched single-cell RNA) are heritable on the single-cell DNA trees, per patient.</Text>
          <Fig2Moran dataset={dataset} />
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>Per patient: heritability of states and genes on the tree in the RNA tab (genes sub-tab), e.g. <RealLink href={patientHref("MGH285", 8)}>MGH285</RealLink>, <RealLink href={patientHref("MGH302", 8)}>MGH302</RealLink>.</li>
            <li>Across patients: {cLink("associations", "Lineage × state")} and {cLink("aligned", "Aligned trees")}; cell states in {cLink("paperfig1", "Fig 1")}.</li>
          </ul>
        </Space>
      )}
      refs={concept.refs}
    />
  );
}
