import React, { useEffect, useMemo, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Alert, Button, Card, Col, Row, Select, Space, Tag, Typography } from "antd";
import { SwapOutlined } from "@ant-design/icons";
import useTreeView from "./useTreeView";
import usePatientClades from "./usePatientClades";
import useContainerWidth from "./useContainerWidth";
import SvgExportButton from "./svgExportButton";
import scaActions from "../../redux/scAnalysis/actions";
import { cladeNodeLabels } from "../../helpers/singleCell/clades";
import { compareCladeCells, isLinkable, nodeOfSpec, privateSnvOf, resolveSpec } from "../../helpers/singleCell/cladeCompare";
import { linkAppliesTo, readDeepLink, readViewLink } from "../../helpers/singleCell/deepLink";
import { formatP } from "../../helpers/singleCell/tests";
import { quartiles } from "../../helpers/singleCell/rnaStats";
import { Provenance } from "./hintLine";

const { Text } = Typography;
const COLORS = { A: "#C2185B", B: "#1F5FA8" };
const PHASE_COLORS = { G1: "#8DA0B3", S: "#E08A1E", G2M: "#7B3F98" };
const LEVEL_PALETTE = ["#4E79A7", "#F28E2B", "#59A14F", "#B07AA1", "#EDC948", "#76B7B2", "#FF9DA7", "#9C755F", "#BAB0AC", "#E15759"];
const fmt = (x, d = 2) => (x == null || !Number.isFinite(x) ? "not available" : x.toFixed(d));
const pct = (x) => (x == null ? "not available" : `${Math.round(100 * x)}%`);
const pText = (p) => (p == null ? "no test" : formatP(p));
const effectWord = (d) => {
  const a = Math.abs(d);
  return a < 0.147 ? "negligible" : a < 0.33 ? "small" : a < 0.474 ? "medium" : "large";
};

/** The two groups as redux sides: A / B hold { groups: [{ patient, cells }], label, source }. */
const idsOf = (g) => (g?.groups || []).flatMap((x) => x.cells);

function Unavailable({ reason }) {
  return <Text type="secondary">{`Not available (${reason}).`}</Text>;
}

/** Stacked bars of level counts for A and B. */
function StackedBars({ result, colors, width }) {
  const rows = [
    { side: "A", ...result.a },
    { side: "B", ...result.b },
  ];
  const left = 28;
  const barW = Math.max(120, width - left - 70);
  return (
    <svg width={width} height={rows.length * 30 + 4} style={{ display: "block" }}>
      {rows.map((r, i) => {
        let x = left;
        return (
          <g key={r.side} transform={`translate(0,${i * 30 + 4})`}>
            <text x={0} y={16} fontSize={13} fontWeight={600} fill={COLORS[r.side]}>{r.side}</text>
            {result.levels.map((l) => {
              const w = r.n ? (r.counts[l] / r.n) * barW : 0;
              const rect = (
                <g key={l}>
                  <rect x={x} y={2} width={w} height={20} fill={colors[l]}>
                    <title>{`${r.side} ${l}: ${r.counts[l]} of ${r.n} (${r.n ? Math.round((100 * r.counts[l]) / r.n) : 0}%)`}</title>
                  </rect>
                  {w > 34 && (
                    <text x={x + w / 2} y={16} fontSize={12} textAnchor="middle" fill="#fff" pointerEvents="none">{r.counts[l]}</text>
                  )}
                </g>
              );
              x += w;
              return rect;
            })}
            <text x={left + barW + 6} y={16} fontSize={12} fill="currentColor">{`n=${r.n}`}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Box plot with jittered points for A and B on one numeric readout. */
function BoxPair({ stat, width, height = 170, label }) {
  const m = { l: 44, r: 8, t: 8, b: 30 };
  const all = [...stat.valuesA, ...stat.valuesB];
  if (!all.length) return null;
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pad = (hi - lo || 1) * 0.06;
  const y = (v) => m.t + (1 - (v - (lo - pad)) / (hi - lo + 2 * pad)) * (height - m.t - m.b);
  const slot = (width - m.l - m.r) / 2;
  const jitter = (k) => (((Math.sin(k * 12.9898) * 43758.5453) % 1) + 1) % 1 - 0.5;
  const ticks = [lo, (lo + hi) / 2, hi];
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} stroke="currentColor" opacity={0.1} />
          <text x={m.l - 4} y={y(t) + 4} fontSize={11} textAnchor="end" fill="currentColor">{t.toFixed(2)}</text>
        </g>
      ))}
      {["A", "B"].map((side, i) => {
        const values = side === "A" ? stat.valuesA : stat.valuesB;
        const cx = m.l + slot * (i + 0.5);
        const q = values.length ? quartiles(values) : null;
        return (
          <g key={side}>
            {values.map((v, k) => (
              <circle key={k} cx={cx + jitter(k + i * 97) * slot * 0.55} cy={y(v)} r={2.4} fill={COLORS[side]} fillOpacity={0.45} />
            ))}
            {q && (
              <g>
                <rect x={cx - slot * 0.22} y={y(q.q3)} width={slot * 0.44} height={Math.max(1, y(q.q1) - y(q.q3))} fill="none" stroke={COLORS[side]} strokeWidth={1.5} />
                <line x1={cx - slot * 0.22} x2={cx + slot * 0.22} y1={y(q.median)} y2={y(q.median)} stroke={COLORS[side]} strokeWidth={2.5} />
              </g>
            )}
            <text x={cx} y={height - 12} fontSize={12} textAnchor="middle" fill="currentColor">{`${side} (n=${values.length})`}</text>
          </g>
        );
      })}
      <text x={m.l} y={height - 1} fontSize={11} fill="currentColor" opacity={0.7}>{label}</text>
    </svg>
  );
}

function TestLine({ stat }) {
  if (stat.reason) return <Unavailable reason={stat.reason} />;
  return (
    <Text style={{ fontSize: 13 }}>
      {`median A ${fmt(stat.medianA)} vs B ${fmt(stat.medianB)}; Wilcoxon ${pText(stat.p)}; Cliff's delta ${fmt(stat.delta)}${stat.delta == null ? "" : ` (${effectWord(stat.delta)}, positive = higher in A)`}`}
    </Text>
  );
}

function LevelTable({ field, result, side = null, fixed = {} }) {
  const colors = Object.fromEntries((result.levels || []).map((l, i) => [l, fixed[l] || LEVEL_PALETTE[i % LEVEL_PALETTE.length]]));
  return (
    <div style={{ marginBottom: 10 }}>
      <Text strong style={{ fontSize: 13 }}>{field}</Text>
      {result.reason ? (
        <div><Unavailable reason={result.reason} /></div>
      ) : (
        <>
          <StackedBars result={result} colors={colors} width={side || 360} />
          <Space size={[8, 2]} wrap style={{ fontSize: 12 }}>
            {result.levels.map((l) => (
              <span key={l}><span style={{ display: "inline-block", width: 9, height: 9, background: colors[l], marginRight: 4 }} />{l}</span>
            ))}
          </Space>
          <div><Text style={{ fontSize: 13 }}>{result.test ? `${result.test} ${pText(result.p)}` : "no test (one side has no cells with this field)"}</Text></div>
        </>
      )}
    </div>
  );
}

/**
 * Clade comparison: any two groups of cells (clades on the tree, saved groups, clones, the tree selection)
 * on RNA cell-cycle phase and S / G2M scores, DNA replication-timing S-phase (every cell with DNA, with or
 * without RNA), cell state and quick counts. Groups A and B live in the same slots the RNA compare tab uses
 * (state.ScAnalysis.groups); the branch drawer sets them from the tree. ?cmpA=&cmpB= reopen a comparison.
 */
export default function CladeComparisonCard() {
  const dispatch = useDispatch();
  const { cells, rna, patient, selectedCellIds, layout } = useSelector((s) => s.SingleCell);
  const groups = useSelector((s) => s.ScAnalysis.groups);
  const { treeLayout, order } = useTreeView();
  const clades = usePatientClades();
  const [ref, width] = useContainerWidth(900);
  const colW = Math.max(240, Math.floor((width - 48) / 2) - 8);
  const pid = patient?.caseReportId;
  const savedGroups = useMemo(() => layout.savedGroups?.[pid] || [], [layout.savedGroups, pid]);
  const cladeNodes = useMemo(() => (clades.status === "ok" && treeLayout ? cladeNodeLabels(treeLayout, clades.data.clades) : new Map()), [clades, treeLayout]);
  const tumorIds = useMemo(() => {
    const t = new Set(cells.filter((c) => !/^normal$/i.test(`${c.clone_id || ""}`)).map((c) => `${c.cell_id}`));
    return order.filter((id) => t.has(`${id}`));
  }, [cells, order]);
  const ctx = useMemo(
    () => ({ layout: treeLayout, order, tumorIds, cells, savedGroups, selection: selectedCellIds || [], cladeNodes }),
    [treeLayout, order, tumorIds, cells, savedGroups, selectedCellIds, cladeNodes]
  );

  const setSide = (side, spec) => {
    const r = resolveSpec(spec, ctx);
    if (r.error) return r;
    dispatch(scaActions.setGroup(side, [{ patient: pid, cells: r.ids }], r.label, spec));
    return r;
  };

  // a link's ?cmpA / ?cmpB opens the comparison, once, when the tree (and clades.json, if any) are ready
  const opened = useRef(null);
  const [linkError, setLinkError] = React.useState(null);
  useEffect(() => {
    if (!pid || !treeLayout || clades.status === "loading" || opened.current === pid) return;
    opened.current = pid;
    const deep = readDeepLink();
    if (!linkAppliesTo(deep, pid)) return;
    const { compareA, compareB } = readViewLink();
    if (!compareA && !compareB) return;
    const errors = [];
    [["A", compareA], ["B", compareB]].forEach(([side, spec]) => {
      if (!spec) return;
      const r = setSide(side, spec);
      if (r.error) errors.push(`${side}: ${r.error}`);
    });
    if (errors.length) setLinkError(errors.join("; "));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid, treeLayout, clades.status]);

  // the comparison lives in the URL
  const specA = groups.A?.source;
  const specB = groups.B?.source;
  useEffect(() => {
    if (!pid || opened.current !== pid) return;
    try {
      const url = new URL(window.location.href);
      [["cmpA", specA], ["cmpB", specB]].forEach(([k, v]) => (isLinkable(v) ? url.searchParams.set(k, v) : url.searchParams.delete(k)));
      if (url.toString() !== window.location.href) window.history.replaceState(window.history.state, "", url.toString());
    } catch (e) {
      // no window / history
    }
  }, [pid, specA, specB]);

  const idsA = useMemo(() => idsOf(groups.A), [groups.A]);
  const idsB = useMemo(() => idsOf(groups.B), [groups.B]);
  const result = useMemo(
    () => (idsA.length && idsB.length ? compareCladeCells({ idsA, idsB, rnaRows: rna.status === "ok" ? rna.data.cells : [], dnaCells: cells }) : null),
    [idsA, idsB, rna, cells]
  );

  const options = useMemo(() => {
    const out = [];
    if ((selectedCellIds || []).length) out.push({ value: "sel", label: `Current selection (${selectedCellIds.length})` });
    const clones = [...new Set(cells.map((c) => c.clone_id).filter((c) => c != null))].sort((a, b) => `${a}`.localeCompare(`${b}`, undefined, { numeric: true }));
    clones.forEach((c) => out.push({ value: `clone:${c}`, label: `Clone ${`${c}`.replace(/^clone\s*/i, "")}` }));
    savedGroups.forEach((g) => out.push({ value: `group:${g.name}`, label: `Saved group: ${g.name} (${g.cells.length})` }));
    [...cladeNodes.entries()]
      .sort((a, b) => b[1].clade.n_cells - a[1].clade.n_cells)
      .forEach(([k, v]) => out.push({ value: `clade:${v.clade.id}`, label: `Called clade ${`${v.clade.id}`.replace(/^.*_n/, "n")} (${v.clade.n_cells} cells${v.clade.n_private_snv != null ? `, ${v.clade.n_private_snv} private SNVs` : ""})` }));
    return out;
  }, [selectedCellIds, cells, savedGroups, cladeNodes]);

  if (!treeLayout) return null;
  const aIsNode = nodeOfSpec(specA, ctx) != null;
  const swap = () => {
    const { A, B } = groups;
    dispatch(scaActions.setGroup("A", B?.groups || [], B?.label, B?.source));
    dispatch(scaActions.setGroup("B", A?.groups || [], A?.label, A?.source));
  };
  const slot = (side) => {
    const g = groups[side];
    return (
      <Space size={6} wrap>
        <Tag color={side === "A" ? "magenta" : "geekblue"} style={{ marginRight: 0 }}>{side}</Tag>
        <Select
          size="small"
          style={{ width: 280 }}
          placeholder="Pick on the tree (branch drawer) or choose here"
          value={g ? g.label : undefined}
          options={options}
          onChange={(v) => setSide(side, v)}
          allowClear
          onClear={() => dispatch(scaActions.setGroup(side, [], null))}
        />
        {g && <Text type="secondary" style={{ fontSize: 12 }}>{`${idsOf(g).length} cells`}</Text>}
      </Space>
    );
  };

  const snvText = (spec) => {
    const n = privateSnvOf(spec, ctx);
    return n == null ? "not available (not a called clade, or no clades.json)" : `${n}`;
  };
  const c = result?.counts;
  return (
    <Card
      id="sc-clade-comparison"
      size="small"
      title={<Space>Clade comparison<Provenance id="cladeCompare" /></Space>}
      extra={
        <Space wrap>
          <Button size="small" disabled={!aIsNode} title={aIsNode ? "" : "A must be a clade or tree node"} onClick={() => setSide("B", `sister:${specA}`)}>A vs its sister clade</Button>
          <Button size="small" disabled={!idsA.length} onClick={() => setSide("B", `rest:${specA}`)}>A vs rest of tumour</Button>
          <Button size="small" icon={<SwapOutlined />} disabled={!groups.A && !groups.B} onClick={swap}>Swap</Button>
          <Button size="small" disabled={!groups.A && !groups.B} onClick={() => dispatch(scaActions.clearGroups())}>Clear</Button>
          <SvgExportButton containerRef={ref} name="clade-comparison" />
        </Space>
      }
    >
      <div ref={ref}>
        <Space direction="vertical" size={8} style={{ width: "100%" }}>
          <Space size={[16, 6]} wrap>{slot("A")}{slot("B")}</Space>
          {linkError && <Alert type="warning" showIcon message={`The link's comparison could not be fully restored: ${linkError}`} />}
          {!result && (
            <Text type="secondary">
              Click a branch on the phylogeny and use Set as A / Set as B in the drawer that opens (or pick groups above). Cell-cycle phase, S / G2M scores, DNA replication-timing S-phase and cell state are then compared between the two.
            </Text>
          )}
          {result && (
            <>
              <Space size={[18, 4]} wrap style={{ fontSize: 13 }}>
                <span><Tag color="magenta">A</Tag>{`${groups.A.label}: ${c.nA} cells, ${c.rnaA} with RNA, median ploidy ${fmt(c.ploidyA, 1)}, private SNVs ${snvText(specA)}`}</span>
                <span><Tag color="geekblue">B</Tag>{`${groups.B.label}: ${c.nB} cells, ${c.rnaB} with RNA, median ploidy ${fmt(c.ploidyB, 1)}, private SNVs ${snvText(specB)}`}</span>
                {c.overlap > 0 && <Text type="warning">{`${c.overlap} cells are in both groups`}</Text>}
              </Space>
              <Row gutter={[16, 12]}>
                <Col xs={24} lg={12}>
                  <Text strong>RNA cell-cycle phase</Text>
                  {result.phase.reason && !result.phase.levels ? (
                    <div><Unavailable reason={result.phase.reason} /></div>
                  ) : (
                    <>
                      <LevelTable field="" result={result.phase} side={colW} fixed={PHASE_COLORS} />
                      {!result.phase.reason && (
                        <div style={{ fontSize: 13 }}>
                          <div>{`Cycling (S + G2M): A ${pct(result.phase.cycling.fracA)} vs B ${pct(result.phase.cycling.fracB)}, Fisher ${pText(result.phase.cycling.p)}`}</div>
                          <div>{`S phase only: A ${pct(result.phase.sPhase.fracA)} vs B ${pct(result.phase.sPhase.fracB)}, Fisher ${pText(result.phase.sPhase.p)}`}</div>
                        </div>
                      )}
                    </>
                  )}
                </Col>
                <Col xs={24} lg={12}>
                  <Text strong>DNA S-phase from replication timing (rt_cor), every cell with DNA</Text>
                  {result.dna.reason ? (
                    <div><Unavailable reason={result.dna.reason} /></div>
                  ) : (
                    <>
                      <BoxPair stat={result.dna.rt} width={colW} label="coverage vs replication timing (rho)" />
                      <TestLine stat={result.dna.rt} />
                      <div style={{ fontSize: 13 }}>
                        {`DNA S-phase calls: A ${result.dna.nSA}/${result.dna.nDnaA} (${pct(result.dna.sCall.fracA)}) vs B ${result.dna.nSB}/${result.dna.nDnaB} (${pct(result.dna.sCall.fracB)}), Fisher ${pText(result.dna.sCall.p)}. Cells without RNA: A ${result.dna.noRnaA}, B ${result.dna.noRnaB}.`}
                      </div>
                    </>
                  )}
                </Col>
                {result.scores.map((sc) => (
                  <Col xs={24} lg={12} key={sc.key}>
                    <Text strong>{`RNA ${sc.label}`}</Text>
                    {sc.reason ? (
                      <div><Unavailable reason={sc.reason} /></div>
                    ) : (
                      <>
                        <BoxPair stat={sc} width={colW} label={sc.label} />
                        <TestLine stat={sc} />
                      </>
                    )}
                  </Col>
                ))}
                <Col xs={24}>
                  <Text strong>Cell state and other RNA labels</Text>
                  <Row gutter={16} style={{ marginTop: 4 }}>
                    {result.fields.map((f) => (
                      <Col xs={24} lg={12} key={f.field}>
                        <LevelTable field={f.field} result={f} side={colW} />
                      </Col>
                    ))}
                  </Row>
                  <Text type="secondary" style={{ fontSize: 12 }}>Gene-expression programs are not part of this export; the labels above come from rna/cells.json.</Text>
                </Col>
              </Row>
            </>
          )}
        </Space>
      </div>
    </Card>
  );
}
