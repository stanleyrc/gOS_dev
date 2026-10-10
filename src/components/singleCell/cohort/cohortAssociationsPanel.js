import React, { useMemo, useState } from "react";
import { Alert, Button, Card, Col, Empty, Row, Skeleton, Space, Table, Typography } from "antd";
import {
  cellsStrip,
  concordanceRows,
  eventClassColor,
  fmtP,
  forestDomain,
  forestRows,
  leafStrip,
  signalFill,
} from "../../../helpers/singleCell/alignedTrees";
import { annotationColors } from "../../../helpers/singleCell/matrix";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import useContainerWidth from "../useContainerWidth";
import usePlotTheme from "../usePlotTheme";
import useCohortExport from "./useCohortExport";
import EvoTreeSvg from "./evoTreeSvg";
import EvoFindings from "./evoFindings";
import NeutralTag from "../neutralTag";

const { Text, Paragraph } = Typography;
const STATES = ["MES", "AC", "NPC", "OPC"];
const STATE_COLORS = annotationColors(STATES);
const lineageColor = (() => {
  const pal = ["#8c8c8c", "#4E79A7", "#B07AA1", "#9C755F", "#76B7B2", "#EDC948", "#59A14F"];
  const seen = new Map();
  return (v) => {
    if (!seen.has(v)) seen.set(v, pal[(seen.size + 1) % pal.length]);
    return v === "other" ? "#bfbfbf" : seen.get(v);
  };
})();

/** Phylogenetic signal of each state / program in each patient: z (colour only when p < 0.05) and the cross-patient summary. */
function ConcordanceMatrix({ rows, patients, theme, focus, onCell }) {
  const labelW = 230;
  const cellW = 54;
  const sumW = 250;
  const rowH = 22;
  const headH = 22;
  const W = labelW + cellW * patients.length + sumW;
  const H = headH + rows.length * rowH + 4;
  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={W} height={H} role="img">
        <title>Phylogenetic signal of cell states across patients</title>
        {patients.map((P, k) => (
          <text key={P} x={labelW + k * cellW + cellW / 2} y={15} textAnchor="middle" fontSize={TYPE.tick} fontWeight={600} fill={theme.text}>{P}</text>
        ))}
        <text x={labelW + patients.length * cellW + 8} y={15} fontSize={TYPE.tick} fill={theme.muted}>significant · combined (Stouffer) · heterogeneity</text>
        {rows.map((r, i) => {
          const y = headH + i * rowH;
          const on = focus && focus.phenotype === r.phenotype;
          const strong = r.p < 0.05;
          return (
            <g key={r.phenotype}>
              <rect x={0} y={y} width={W} height={rowH} fill={on ? theme.selectFill : "transparent"} />
              <g style={{ cursor: "pointer" }} onClick={() => onCell(r, null)}>
                {r.kind === "state" && <rect x={4} y={y + 6} width={10} height={10} rx={2} fill={STATE_COLORS[r.phenotype]} />}
                <text x={r.kind === "state" ? 20 : 4} y={y + rowH / 2} dy="0.35em" fontSize={TYPE.label} fontWeight={strong ? 700 : 400} fill={theme.text}>
                  {r.kind === "state" ? `${r.label}-like` : r.label.length > 32 ? `${r.label.slice(0, 31)}…` : r.label}
                </text>
                <title>{r.label}</title>
              </g>
              {r.cells.map((c, k) => {
                const x = labelW + k * cellW;
                const sig = c && c.p < 0.05;
                return (
                  <g key={k} style={{ cursor: c ? "pointer" : "default" }} onClick={() => c && onCell(r, patients[k])}>
                    <rect x={x + 1} y={y + 1} width={cellW - 2} height={rowH - 2} fill={signalFill(c, theme)} stroke={on && focus.patient === patients[k] ? theme.accent : "none"} />
                    {c && Number.isFinite(c.z) && (
                      <text x={x + cellW / 2} y={y + rowH / 2} dy="0.35em" textAnchor="middle" fontSize={TYPE.tick} fontWeight={sig ? 700 : 400} fill={sig ? theme.text : theme.muted}>
                        {c.z.toFixed(1)}
                      </text>
                    )}
                    {c && <title>{`${patients[k]} · ${r.label}: observed ${c.observed?.toFixed?.(2)} vs ${c.expected?.toFixed?.(2)} expected, z ${c.z?.toFixed?.(1)}, ${fmtP(c.p)}${c.within_p != null ? `; within lineages ${fmtP(c.within_p)}` : ""}`}</title>}
                  </g>
                );
              })}
              <text x={labelW + patients.length * cellW + 8} y={y + rowH / 2} dy="0.35em" fontSize={TYPE.tick} fill={strong ? theme.text : theme.textSecondary} fontWeight={strong ? 700 : 400}>
                {`${r.k_significant}/${r.n_patients} · ${fmtP(r.p)} · het ${fmtP(r.heterogeneity?.p)}`}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Event x state associations pooled across patients (Mantel-Haenszel OR, 95% CI) with per-patient ORs. */
function Forest({ rows, theme, width, focus, onRow }) {
  const labelW = 240;
  const statW = 210;
  const rowH = 22;
  const plotW = Math.max(160, Math.min(420, width - labelW - statW));
  const [lo, hi] = forestDomain(rows);
  const x = (v) => labelW + ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * plotW;
  const H = 26 + rows.length * rowH;
  const ticks = [0.25, 0.5, 1, 2, 4].filter((v) => Math.log(v) >= lo - 1e-9 && Math.log(v) <= hi + 1e-9);
  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={labelW + plotW + statW} height={H} role="img">
        <title>Event x state associations</title>
        <line x1={x(0)} x2={x(0)} y1={4} y2={H - 18} stroke={theme.axis} />
        {ticks.map((v) => (
          <text key={v} x={x(Math.log(v))} y={H - 4} textAnchor="middle" fontSize={TYPE.tick} fill={theme.muted}>{v}</text>
        ))}
        <text x={labelW - 6} y={H - 4} textAnchor="end" fontSize={TYPE.tick} fill={theme.muted}>odds ratio (carriers vs not)</text>
        {rows.map((r, i) => {
          const y = 6 + i * rowH + rowH / 2;
          const on = focus && focus.key === r.key;
          const sig = r.p != null && r.p < 0.05;
          return (
            <g key={r.key} style={{ cursor: "pointer" }} onClick={() => onRow(r)}>
              <rect x={0} y={y - rowH / 2} width={labelW + plotW + statW} height={rowH} fill={on ? theme.selectFill : "transparent"} />
              <rect x={4} y={y - 5} width={10} height={10} rx={2} fill={STATE_COLORS[r.state]} />
              <text x={20} y={y} dy="0.35em" fontSize={TYPE.label} fontWeight={sig ? 700 : 400} fill={theme.text}>{`${r.label} → ${r.state}`}</text>
              {r.patientLors.map((pp) => (
                <circle key={pp.patient} cx={x(pp.lor)} cy={y} r={2.5} fill="none" stroke={theme.muted}>
                  <title>{`${pp.patient}: OR ${Math.exp(pp.lor).toFixed(2)}, Fisher ${fmtP(pp.p)}`}</title>
                </circle>
              ))}
              {r.llo != null && r.lhi != null && <line x1={x(r.llo)} x2={x(r.lhi)} y1={y} y2={y} stroke={sig ? theme.text : theme.muted} strokeWidth={1.5} />}
              <rect x={x(r.lor) - 4} y={y - 4} width={8} height={8} fill={sig ? theme.text : theme.muted} />
              <text x={labelW + plotW + 8} y={y} dy="0.35em" fontSize={TYPE.tick} fill={sig ? theme.text : theme.textSecondary} fontWeight={sig ? 700 : 400}>
                {`OR ${r.or.toFixed(2)} · ${fmtP(r.p)} · ${r.n_patients} pts`}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Supporting trees: the patient's tree with the state (and lineage / carrier) strips for the focused association. */
function AssocDetail({ focus, assoc, aligned, onOpen, theme, width }) {
  const pts = focus.patients.filter((P) => assoc.patients[P]?.cells && aligned?.patients?.[P]);
  if (!pts.length) return <Text type="secondary">No per-cell data for these patients.</Text>;
  const cols = Math.max(1, Math.min(pts.length, Math.floor(width / 300)));
  const w = Math.floor(width / cols) - 12;
  return (
    <Row gutter={[12, 12]}>
      {pts.map((P) => {
        const a = assoc.patients[P];
        const p = aligned.patients[P];
        const n = p.n_tumour;
        const strips = [];
        if (focus.state) strips.push({ label: `${focus.state}-like cells`, values: cellsStrip(n, a.cells, 1).map((s) => (s === focus.state ? s : null)), colorOf: (s) => STATE_COLORS[s] });
        strips.push({ label: "RNA state (all)", values: cellsStrip(n, a.cells, 1), colorOf: (s) => STATE_COLORS[s] || theme.faint });
        strips.push({ label: `Lineage (${a.lineage_source === "clone" ? "clone table" : "major tree clades"})`, values: cellsStrip(n, a.cells, 2), colorOf: lineageColor });
        const ev = focus.event ? p.events.find((e) => e.id === focus.event) : null;
        if (ev) strips.unshift({ label: `${ev.label} carriers`, values: leafStrip(n, ev.carriers), colorOf: () => eventClassColor(ev.class, theme.mode) });
        const sig = focus.phenotype ? a.signal?.[focus.phenotype] : null;
        const ct = a.clone_state;
        return (
          <Col key={P} span={Math.floor(24 / cols)}>
            <div style={{ border: `1px solid ${theme.borderSoft}`, borderRadius: 4, padding: 6 }}>
              <Space size={6} wrap>
                <Text strong>{P}</Text>
                {a.old_tree && <NeutralTag>older tree</NeutralTag>}
                <Button size="small" type="link" onClick={() => onOpen(P)}>Open patient</Button>
              </Space>
              <EvoTreeSvg tree={p.tree} events={ev ? [ev] : []} focus={ev ? new Set([ev.id]) : null} highlights={ev && ev.placed && !ev.truncal ? [{ node: ev.node, color: eventClassColor(ev.class, theme.mode) }] : []} width={w} height={Math.min(260, Math.max(140, n * 0.6))} strips={strips} showAxis />
              <Text type="secondary" style={{ fontSize: TYPE.tick }}>
                {sig
                  ? `${focus.phenotype === "cycling" ? "Cycling" : `${focus.phenotype}-like`}: ${Math.round(100 * sig.observed)}% of these cells have a nearest relative in the same state vs ${Math.round(100 * sig.expected)}% expected (${fmtP(sig.p)}${sig.within_lineage ? `; within lineages ${fmtP(sig.within_lineage.p)}` : ""}). `
                  : ""}
                {ct ? `Lineage × state ${fmtP(ct.p)}, Cramér's V ${ct.cramer_v.toFixed(2)} (${a.n_rna} cells).` : ""}
                {focus.event && focus.per?.[P] ? ` ${focus.label} carriers: ${focus.per[P].table[0][0]}/${focus.per[P].table[0][0] + focus.per[P].table[0][1]} ${focus.state}; others ${focus.per[P].table[1][0]}/${focus.per[P].table[1][0] + focus.per[P].table[1][1]} (OR ${focus.per[P].or.toFixed(2)}).` : ""}
              </Text>
            </div>
          </Col>
        );
      })}
    </Row>
  );
}

/** Lineage composition bars (state colours) of one patient. */
function Composition({ comp, theme }) {
  const W = 220;
  return (
    <svg width={W} height={comp.length * 13} role="img">
      {comp.map((c, i) => {
        let x = 64;
        return (
          <g key={c.lineage}>
            <text x={60} y={i * 13 + 6} dy="0.35em" textAnchor="end" fontSize={TYPE.micro} fill={theme.textSecondary}>{`${c.lineage.length > 9 ? `${c.lineage.slice(0, 8)}…` : c.lineage} (${c.n})`}</text>
            {STATES.map((s) => {
              const w = (c.counts[s] / Math.max(1, c.n)) * (W - 66);
              const r = <rect key={s} x={x} y={i * 13 + 1} width={Math.max(0, w - 0.5)} height={10} fill={STATE_COLORS[s]}><title>{`${c.lineage}: ${s} ${c.counts[s]}/${c.n}`}</title></rect>;
              x += w;
              return r;
            })}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * #21 Cross-patient associations: does a patient's RNA state follow its DNA
 * lineages, is each state heritable on the tree (nearest-relative test), do
 * those answers agree across patients (Stouffer, heterogeneity), and do
 * cells carrying a recurrent subclonal event lean to a state in several
 * patients (Mantel-Haenszel)? From _cohort/associations.json (srctools
 * gos_sc_cohort_evolution.py); extends the Story's "what lineages inherit".
 */
export default function CohortAssociationsPanel({ dataset, summaries = [], onOpen }) {
  const theme = usePlotTheme();
  const { status, data: assoc } = useCohortExport(dataset, "associations.json");
  const { data: aligned } = useCohortExport(dataset, "aligned_trees.json");
  const [ref, width] = useContainerWidth(1100);
  const [selected, setSelected] = useState(null);
  const [focus, setFocus] = useState(null);
  const patients = useMemo(() => {
    if (!assoc) return [];
    const ids = Object.keys(assoc.patients || {});
    const order = summaries.map((s) => s.caseReportId).filter((P) => ids.includes(P));
    return [...order, ...ids.filter((P) => !order.includes(P)).sort()];
  }, [assoc, summaries]);
  const withCells = patients.filter((P) => assoc?.patients?.[P]?.cells);
  const conc = useMemo(() => concordanceRows(assoc, withCells), [assoc, withCells.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const forest = useMemo(() => forestRows(assoc, { maxRows: 14 }), [assoc]);

  if (status === "loading") return <Skeleton active />;
  if (!assoc) return <Empty description="Associations are not computed yet (_cohort/associations.json; srctools gos_sc_cohort_evolution.py)." />;
  const openP = (P) => {
    const s = summaries.find((x) => x.caseReportId === P);
    if (s && onOpen) onOpen(s);
  };
  const selectFinding = (k) => {
    setSelected(k);
    if (k == null) return setFocus(null);
    const f = assoc.findings[k];
    if (f.event) {
      const r = (assoc.event_state || []).find((x) => x.event === f.event && x.state === f.state);
      return setFocus({ key: `${f.event}|${f.state}`, event: f.event, state: f.state, label: r?.label || f.event, per: r?.per_patient, patients: f.patients?.length ? f.patients : withCells, title: f.text });
    }
    if (f.phenotype) return setFocus({ phenotype: f.phenotype, state: STATES.includes(f.phenotype) ? f.phenotype : null, patients: f.patients?.length ? f.patients : withCells, title: f.text });
    return setFocus({ patients: f.patients?.length ? f.patients : withCells, title: f.text });
  };
  const cellFocus = (r, P) => {
    setSelected(null);
    setFocus({ phenotype: r.phenotype, state: STATES.includes(r.phenotype) ? r.phenotype : null, patient: P, patients: P ? [P] : Object.keys(r.per_patient || {}).filter((x) => withCells.includes(x)), title: `${r.label}${P ? ` in ${P}` : " across patients"}` });
  };
  const forestFocus = (r) => {
    setSelected(null);
    setFocus({ key: r.key, event: r.event, state: r.state, label: r.label, per: r.per_patient, patients: Object.keys(r.per_patient || {}), title: `${r.label} carriers vs ${r.state}-like state` });
  };
  const skipped = patients.filter((P) => assoc.patients[P]?.skipped);

  return (
    <div ref={ref}>
      <Card size="small" title="Cross-patient associations: lineage and cell state">
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <EvoFindings findings={assoc.findings || []} selected={selected} onSelect={selectFinding} />
          {focus && (
            <div style={{ borderLeft: `3px solid ${theme.accent}`, paddingLeft: 10 }}>
              <Space wrap style={{ marginBottom: 6 }}>
                <Text strong>Supporting trees and cells:</Text>
                <Text>{focus.title}</Text>
                <Button size="small" onClick={() => { setFocus(null); setSelected(null); }}>Clear</Button>
              </Space>
              <Space size={10} wrap style={{ fontSize: TYPE.tick, marginBottom: 4 }}>
                {STATES.map((s) => (
                  <Space key={s} size={4}><span style={{ width: 9, height: 9, background: STATE_COLORS[s], display: "inline-block" }} /><Text type="secondary" style={{ fontSize: TYPE.tick }}>{`${s}-like`}</Text></Space>
                ))}
                <Text type="secondary" style={{ fontSize: TYPE.tick }}>Strips right of the tips, left to right: {focus.event ? "event carriers, " : ""}{focus.state ? `${focus.state}-like cells, ` : ""}all states, lineage.</Text>
              </Space>
              <AssocDetail focus={focus} assoc={assoc} aligned={aligned} onOpen={openP} theme={theme} width={width - 16} />
            </div>
          )}
          <div>
            <Text strong>Is each cell state inherited on the tree? Concordance across patients</Text>
            <Paragraph type="secondary" style={{ fontSize: TYPE.tick, marginBottom: 4 }}>
              Numbers are z-scores of the nearest-relative test (share of state-X cells whose closest relative on the DNA tree is also X, against 2,000
              shuffles); a cell is coloured only when p &lt; 0.05. Right: patients significant, Stouffer-combined p, and Cochran&apos;s Q heterogeneity
              (low = patients disagree). Meta-program rows come from the Story&apos;s heritability analysis (7 patients). Click a cell for its tree.
            </Paragraph>
            <ConcordanceMatrix rows={conc} patients={withCells} theme={theme} focus={focus} onCell={cellFocus} />
          </div>
          <div>
            <Text strong>Does RNA state differ between lineages within each patient?</Text>
            <Table
              size="small"
              rowKey="patient"
              pagination={false}
              style={{ marginTop: 4 }}
              dataSource={patients.map((P) => ({ patient: P, ...assoc.patients[P] }))}
              onRow={(r) => ({ onClick: () => r.cells && (setSelected(null), setFocus({ patients: [r.patient], title: `${r.patient}: lineage × state` })), style: { cursor: r.cells ? "pointer" : "default" } })}
              columns={[
                { title: "Patient", dataIndex: "patient", render: (P, r) => <Space size={4}><Text strong>{P}</Text>{r.old_tree && <NeutralTag style={{ fontSize: TYPE.micro }}>older tree</NeutralTag>}</Space> },
                { title: "Tumor cells with RNA", dataIndex: "n_rna", align: "right" },
                { title: "Lineages from", dataIndex: "lineage_source", render: (x, r) => (r.skipped ? <Text type="secondary">{r.skipped}</Text> : x === "clone" ? "clone table" : "major tree clades") },
                { title: "Composition", dataIndex: "composition", render: (c) => (c ? <Composition comp={c} theme={theme} /> : null) },
                { title: "Lineage × state", dataIndex: "clone_state", render: (c) => (c ? <Text strong={c.p < 0.05}>{fmtP(c.p)}</Text> : "–"), sorter: (a, b) => (a.clone_state?.p ?? 1) - (b.clone_state?.p ?? 1) },
                { title: "Cramér's V", dataIndex: "clone_state", key: "v", align: "right", render: (c) => (c ? c.cramer_v.toFixed(2) : "–") },
                {
                  title: "Strongest lineage-state link",
                  dataIndex: "enrichment",
                  render: (e) => {
                    const top = (e || [])[0];
                    if (!top) return "–";
                    return <Text strong={top.q < 0.1}>{`${top.state}-like ${top.or >= 1 ? "enriched" : "depleted"} in ${top.lineage} (${top.a}/${top.a + top.b} vs ${top.c}/${top.c + top.d}; OR ${top.or.toFixed(2)}, q ${top.q.toPrecision(2)})`}</Text>;
                  },
                },
              ]}
            />
          </div>
          <div>
            <Text strong>Recurrent links between a genomic event and a cell state</Text>
            <Paragraph type="secondary" style={{ fontSize: TYPE.tick, marginBottom: 4 }}>
              For each subclonal event placed on the tree, carriers vs non-carriers in each patient, pooled with Mantel-Haenszel (square and line: pooled OR
              and 95% CI; rings: individual patients). Only events subclonal in at least 2 patients with RNA can be tested. Click a row for its trees.
            </Paragraph>
            {forest.length ? <Forest rows={forest} theme={theme} width={width} focus={focus} onRow={forestFocus} /> : <Text type="secondary">No event is subclonal with enough RNA cells in two or more patients.</Text>}
          </div>
          <Alert
            type="warning"
            showIcon
            message="How far to trust this"
            description={
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: TYPE.tick }}>
                {(assoc.caveats || []).map((c) => (
                  <li key={c}>{c}</li>
                ))}
                {skipped.length > 0 && <li>{`Not tested (too few RNA cells on the tree): ${skipped.join(", ")}.`}</li>}
              </ul>
            }
          />
          <Text type="secondary" style={{ fontSize: TYPE.tick }}>{`Exported ${assoc.created}.`}</Text>
        </Space>
      </Card>
    </div>
  );
}
