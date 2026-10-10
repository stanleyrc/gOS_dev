import React, { useMemo, useState } from "react";
import { Alert, Button, Card, Col, Empty, Row, Segmented, Skeleton, Space, Table, Typography } from "antd";
import {
  EVENT_CLASSES,
  EVENT_CLASS_LABEL,
  RELATION_LABEL,
  TRUNK,
  eventClassColor,
  findPair,
  fmtP,
  leafStrip,
  oncoplotRows,
  pairSentence,
  relationInPatient,
  scopedPairs,
} from "../../../helpers/singleCell/alignedTrees";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import useContainerWidth from "../useContainerWidth";
import usePlotTheme from "../usePlotTheme";
import useCohortExport from "./useCohortExport";
import EvoTreeSvg from "./evoTreeSvg";
import EvoFindings from "./evoFindings";
import NeutralTag from "../neutralTag";

const { Text, Paragraph } = Typography;

function ClassLegend({ theme }) {
  return (
    <Space size={12} wrap style={{ fontSize: TYPE.tick }}>
      {EVENT_CLASSES.map((c) => (
        <Space key={c} size={4}>
          <span style={{ width: 9, height: 9, borderRadius: 5, background: eventClassColor(c, theme.mode), display: "inline-block" }} />
          <Text type="secondary" style={{ fontSize: TYPE.tick }}>{EVENT_CLASS_LABEL[c]}</Text>
        </Space>
      ))}
      <Space size={4}>
        <span style={{ width: 9, height: 9, background: theme.muted, display: "inline-block" }} />
        <Text type="secondary" style={{ fontSize: TYPE.tick }}>square = truncal, circle = subclonal</Text>
      </Space>
    </Space>
  );
}

/** Evolutionary oncoplot: recurrent events x patients, each cell a mini time axis with the event's branch. */
function Oncoplot({ rows, patients, aligned, width, focus, onFocus, onOpen, theme }) {
  const labelW = 170;
  const sumW = 92;
  const cellW = Math.max(46, Math.min(120, Math.floor((width - labelW - sumW) / Math.max(1, patients.length))));
  const rowH = 20;
  const headH = 30;
  const W = labelW + cellW * patients.length + sumW;
  const H = headH + rowH * rows.length + 4;
  const cx = (k, t) => labelW + k * cellW + 6 + ((t + TRUNK) / (1 + TRUNK)) * (cellW - 12);
  const hasFocus = focus && focus.size > 0;
  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={W} height={H} role="img">
        <title>Evolutionary oncoplot</title>
        {patients.map((P, k) => {
          const p = aligned.patients[P];
          return (
            <g key={P} style={{ cursor: "pointer" }} onClick={() => onOpen(P)}>
              <text x={labelW + k * cellW + cellW / 2} y={14} textAnchor="middle" fontSize={TYPE.label} fontWeight={600} fill={theme.text}>{P}</text>
              <text x={labelW + k * cellW + cellW / 2} y={26} textAnchor="middle" fontSize={TYPE.micro} fill={theme.muted}>
                {`${p.n_tumour} cells${p.old_tree ? " · old tree" : ""}`}
              </text>
              <title>{`Open ${P}`}</title>
            </g>
          );
        })}
        <text x={labelW + cellW * patients.length + 8} y={20} fontSize={TYPE.tick} fill={theme.muted}>truncal / sub</text>
        {rows.map((r, i) => {
          const y = headH + i * rowH;
          const on = hasFocus && focus.has(r.id);
          return (
            <g key={r.id} opacity={hasFocus && !on ? 0.45 : 1}>
              <rect x={0} y={y} width={W} height={rowH} fill={on ? theme.selectFill : i % 2 ? theme.band : "transparent"} />
              <g style={{ cursor: "pointer" }} onClick={() => onFocus(r.id)}>
                <rect x={0} y={y} width={labelW - 4} height={rowH} fill="transparent" />
                <circle cx={8} cy={y + rowH / 2} r={4} fill={eventClassColor(r.class, theme.mode)} />
                <text x={16} y={y + rowH / 2} dy="0.35em" fontSize={TYPE.label} fontWeight={on ? 700 : 400} fill={theme.text}>{r.label}</text>
                <title>{`${r.label}: placed in ${r.n_placed} patients (${r.n_truncal} truncal). Click to show on the trees.`}</title>
              </g>
              {r.cells.map((e, k) => {
                const x0 = labelW + k * cellW;
                const axis = <line key="ax" x1={cx(k, -TRUNK)} x2={cx(k, 1)} y1={y + rowH / 2} y2={y + rowH / 2} stroke={theme.grid} />;
                if (!e) return <g key={k}>{axis}</g>;
                const color = eventClassColor(r.class, theme.mode);
                const tip = e.placed
                  ? `${P_label(patients[k])}: ${r.label} ${e.truncal ? "truncal" : `subclonal, clade of ${e.clade} cells (time ${e.t0.toFixed(2)}-${e.t1.toFixed(2)})`}; ${e.n} carriers, clade fit F1 ${e.f1}`
                  : `${P_label(patients[k])}: ${r.label} in ${e.n} cells but not tree-coherent (best clade F1 ${e.f1})`;
                return (
                  <g key={k} style={{ cursor: "pointer" }} onClick={() => onFocus(r.id, patients[k])}>
                    <rect x={x0} y={y} width={cellW} height={rowH} fill="transparent" />
                    {axis}
                    {e.placed && e.truncal && <rect x={cx(k, -TRUNK / 2) - 4.5} y={y + rowH / 2 - 4.5} width={9} height={9} fill={color} />}
                    {e.placed && !e.truncal && (
                      <>
                        <line x1={cx(k, e.t0)} x2={cx(k, e.t1)} y1={y + rowH / 2} y2={y + rowH / 2} stroke={color} strokeWidth={3} />
                        <circle cx={cx(k, e.t1)} cy={y + rowH / 2} r={4} fill={color} />
                      </>
                    )}
                    {!e.placed && <circle cx={x0 + cellW / 2} cy={y + rowH / 2} r={3.5} fill="none" stroke={theme.muted} strokeDasharray="2 1.5" />}
                    <title>{tip}</title>
                  </g>
                );
              })}
              <text x={labelW + cellW * patients.length + 8} y={y + rowH / 2} dy="0.35em" fontSize={TYPE.tick} fill={theme.textSecondary}>
                {`${r.n_truncal} / ${r.n_subclonal}`}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
const P_label = (P) => P;

/** Supporting trees for the focused events: each patient's full tree with per-cell carrier strips. */
function FocusDetail({ focus, aligned, patients, labelOf, onOpen, theme, width }) {
  const ids = [...focus.ids];
  const shown = patients.filter((P) => (focus.patients?.length ? focus.patients.includes(P) : true) && ids.some((id) => (aligned.patients[P].events || []).some((e) => e.id === id)));
  if (!shown.length) return <Text type="secondary">None of the selected events is present in these patients.</Text>;
  const cols = Math.max(1, Math.min(shown.length, Math.floor(width / 300)));
  const w = Math.floor(width / cols) - 12;
  return (
    <Row gutter={[12, 12]}>
      {shown.map((P) => {
        const p = aligned.patients[P];
        const evs = ids.map((id) => p.events.find((e) => e.id === id)).filter(Boolean);
        const rel = ids.length === 2 ? relationInPatient(p, ids[0], ids[1]) : null;
        const strips = evs.map((e) => ({ label: `${e.label}: ${e.n} carrier cells`, values: leafStrip(p.n_tumour, e.carriers), colorOf: () => eventClassColor(e.class, theme.mode) }));
        const highlights = evs.filter((e) => e.placed && !e.truncal).map((e) => ({ node: e.node, color: eventClassColor(e.class, theme.mode) }));
        return (
          <Col key={P} span={Math.floor(24 / cols)}>
            <div style={{ border: `1px solid ${theme.borderSoft}`, borderRadius: 4, padding: 6 }}>
              <Space size={6} wrap>
                <Text strong>{P}</Text>
                {p.old_tree && <NeutralTag>older tree</NeutralTag>}
                {rel && (
                  <Text style={{ fontSize: TYPE.tick }}>
                    {rel === "a_first" ? `${labelOf(ids[0])} first` : rel === "b_first" ? `${labelOf(ids[1])} first` : RELATION_LABEL[rel]}
                  </Text>
                )}
                <Button size="small" type="link" onClick={() => onOpen(P)}>Open patient</Button>
              </Space>
              <EvoTreeSvg tree={p.tree} events={p.events} focus={new Set(ids)} width={w} height={Math.min(260, Math.max(140, p.n_tumour * 0.6))} strips={strips} highlights={highlights} showAxis />
              <Text type="secondary" style={{ fontSize: TYPE.tick }}>
                {evs.map((e) => `${e.label}: ${e.n} cells (${Math.round(100 * e.frac)}%), ${e.placed ? (e.truncal ? "truncal" : `clade of ${e.clade}, F1 ${e.f1}`) : `not tree-coherent, F1 ${e.f1}`}`).join(" · ")}
              </Text>
            </div>
          </Col>
        );
      })}
    </Row>
  );
}

/**
 * #19 Aligned trees across patients ("evolutionary oncoplot"): every
 * patient's tumour tree on a shared relative-time axis (trunk -> single
 * cells), recurrent events placed on the branch whose clade best matches
 * their carrier cells, the events x patients oncoplot, and per event pair
 * how often one precedes the other. Precomputed by srctools
 * gos_sc_cohort_evolution.py into _cohort/aligned_trees.json.
 */
export default function CohortAlignedTreesPanel({ dataset, summaries = [], onOpen }) {
  const theme = usePlotTheme();
  const { status, data: aligned } = useCohortExport(dataset, "aligned_trees.json");
  const [ref, width] = useContainerWidth(1100);
  const [scope, setScope] = useState("all");
  const [classes, setClasses] = useState("all");
  const [selected, setSelected] = useState(null);
  const [focus, setFocus] = useState(null); // { ids: Set, patients: [] | null, title }

  const patients = useMemo(() => {
    if (!aligned) return [];
    const order = summaries.map((s) => s.caseReportId).filter((P) => aligned.patients?.[P]);
    const rest = Object.keys(aligned.patients || {}).filter((P) => !order.includes(P)).sort();
    return [...order, ...rest].filter((P) => scope === "all" || !aligned.patients[P].old_tree);
  }, [aligned, summaries, scope]);
  const labels = useMemo(() => {
    const m = new Map();
    (aligned?.events || []).forEach((e) => m.set(e.id, e.label));
    Object.values(aligned?.patients || {}).forEach((p) => (p.events || []).forEach((e) => !m.has(e.id) && m.set(e.id, e.label)));
    return m;
  }, [aligned]);
  const labelOf = (id) => labels.get(id) || id;
  const rows = useMemo(
    () => oncoplotRows(aligned, patients, { classes: classes === "all" ? null : classes === "cna" ? ["gain", "loss", "amp", "homdel"] : ["amp", "homdel", "ecdna", "snv"] }),
    [aligned, patients, classes]
  );
  const pairs = useMemo(() => scopedPairs(aligned, scope === "all" ? "all" : "current"), [aligned, scope]);

  if (status === "loading") return <Skeleton active />;
  if (!aligned) return <Empty description="Aligned trees are not computed yet (_cohort/aligned_trees.json; srctools gos_sc_cohort_evolution.py)." />;

  const openP = (P) => {
    const s = summaries.find((x) => x.caseReportId === P);
    if (s && onOpen) onOpen(s);
  };
  const focusSet = focus ? focus.ids : null;
  const selectFinding = (k) => {
    setSelected(k);
    if (k == null) return setFocus(null);
    const f = aligned.findings[k];
    const ids = f.a && f.b ? [f.a, f.b] : f.events || [];
    return setFocus({ ids: new Set(ids), patients: f.patients || null, title: f.text });
  };
  const focusEvent = (id, P) => {
    setSelected(null);
    setFocus((cur) => (cur && cur.ids.size === 1 && cur.ids.has(id) && !P ? null : { ids: new Set([id]), patients: P ? [P] : null, title: labelOf(id) }));
  };
  const focusPair = (p) => {
    setSelected(null);
    setFocus({ ids: new Set([p.a, p.b]), patients: p.patients.filter((d) => d.rel !== "unplaced").map((d) => d.patient), title: pairSentence(p, labelOf) });
  };

  const cols = Math.max(1, Math.min(patients.length, Math.floor(width / 230)));
  const treeW = Math.floor(width / cols) - 10;
  const egfr = findPair(pairs, "+7", "EGFR amp");

  return (
    <div ref={ref}>
      <Card
        size="small"
        title="Aligned trees across patients: the order of recurrent events"
        extra={
          <Space wrap>
            <Segmented
              size="small"
              value={scope}
              onChange={(v) => {
                setScope(v);
                setFocus(null);
                setSelected(null);
              }}
              options={[
                { value: "all", label: `All ${Object.keys(aligned.patients).length} patients` },
                { value: "current", label: `Current trees (${Object.values(aligned.patients).filter((p) => !p.old_tree).length})` },
              ]}
            />
            <Segmented
              size="small"
              value={classes}
              onChange={setClasses}
              options={[
                { value: "all", label: "All events" },
                { value: "cna", label: "Copy number" },
                { value: "focal", label: "Focal / ecDNA / SNV" },
              ]}
            />
          </Space>
        }
      >
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <EvoFindings findings={scope === "all" ? aligned.findings || [] : []} selected={selected} onSelect={selectFinding} />
          {scope !== "all" && (
            <Alert
              type="info"
              showIcon
              message={egfr ? `Current trees only: ${pairSentence(egfr, labelOf)}.` : "Current trees only: the headline findings above use all patients; the table and oncoplot below are restricted."}
            />
          )}
          {focus && (
            <div style={{ borderLeft: `3px solid ${theme.accent}`, paddingLeft: 10 }}>
              <Space wrap style={{ marginBottom: 6 }}>
                <Text strong>Supporting trees and cells:</Text>
                <Text>{focus.title}</Text>
                <Button size="small" onClick={() => { setFocus(null); setSelected(null); }}>Clear</Button>
              </Space>
              <FocusDetail focus={focus} aligned={aligned} patients={patients} labelOf={labelOf} onOpen={openP} theme={theme} width={width - 16} />
            </div>
          )}
          <div>
            <Space direction="vertical" size={2} style={{ width: "100%" }}>
              <Text strong>Trees on a shared time axis</Text>
              <Text type="secondary" style={{ fontSize: TYPE.tick }}>
                Each tree runs from the trunk (left) to single cells (right); x is relative evolutionary time, 1 − log(clade size) / log(tumor cells), so a
                clade holding half the tumor sits at the same x in every patient. Clades under 3% of cells are drawn as wedges. Click an event to follow it.
              </Text>
              <ClassLegend theme={theme} />
            </Space>
            <Row gutter={[10, 10]} style={{ marginTop: 6 }}>
              {patients.map((P) => {
                const p = aligned.patients[P];
                return (
                  <Col key={P} span={Math.floor(24 / cols)}>
                    <Space size={6}>
                      <Button type="link" size="small" style={{ padding: 0, fontWeight: 600 }} onClick={() => openP(P)}>{P}</Button>
                      <Text type="secondary" style={{ fontSize: TYPE.tick }}>{`${p.n_tumour} cells`}</Text>
                      {p.old_tree && <NeutralTag style={{ fontSize: TYPE.micro }}>older tree</NeutralTag>}
                    </Space>
                    <EvoTreeSvg
                      tree={p.tree}
                      events={(p.events || []).filter((e) => rows.some((r) => r.id === e.id) || (focusSet && focusSet.has(e.id)))}
                      focus={focusSet}
                      width={treeW}
                      height={130}
                      minSize={Math.max(3, Math.ceil(0.03 * p.n_tumour))}
                      onEvent={(id) => focusEvent(id)}
                      showAxis
                    />
                  </Col>
                );
              })}
            </Row>
          </div>
          <div>
            <Text strong>Evolutionary oncoplot</Text>
            <Paragraph type="secondary" style={{ fontSize: TYPE.tick, marginBottom: 4 }}>
              Events placed in at least 2 patients, earliest first. In each cell the bar is the branch where the event arose on the patient&apos;s time axis
              (square = trunk); a dashed ring means the carriers do not form a clade (e.g. ecDNA segregating unevenly, or noisy calls).
            </Paragraph>
            <Oncoplot rows={rows} patients={patients} aligned={aligned} width={width - 4} focus={focusSet} onFocus={focusEvent} onOpen={openP} theme={theme} />
          </div>
          <div>
            <Text strong>Event pairs: which comes first?</Text>
            <Paragraph type="secondary" style={{ fontSize: TYPE.tick, marginBottom: 4 }}>
              Per patient where both events are placed: one clade an ancestor of the other = that event came first; same clade = same branch (order not
              resolvable); otherwise parallel lineages. Sign test of first vs second over the ordered patients. Click a row to see the trees.
            </Paragraph>
            <Table
              size="small"
              rowKey={(p) => `${p.a}|${p.b}`}
              dataSource={pairs}
              pagination={{ pageSize: 10, hideOnSinglePage: true, showSizeChanger: false }}
              onRow={(p) => ({ onClick: () => focusPair(p), style: { cursor: "pointer" } })}
              rowClassName={(p) => (focus && focus.ids.size === 2 && focus.ids.has(p.a) && focus.ids.has(p.b) ? "ant-table-row-selected" : "")}
              columns={[
                { title: "Earlier", dataIndex: "a", render: (x) => labelOf(x) },
                { title: "Later", dataIndex: "b", render: (x) => labelOf(x) },
                { title: "First", dataIndex: "a_first", align: "right", sorter: (a, b) => a.a_first - b.a_first },
                { title: "Second", dataIndex: "b_first", align: "right" },
                { title: "Same branch", dataIndex: "same", align: "right", sorter: (a, b) => a.same - b.same },
                { title: "Parallel", dataIndex: "parallel", align: "right" },
                { title: "Not coherent", dataIndex: "unplaced", align: "right" },
                { title: "Sign test", dataIndex: "p", align: "right", sorter: (a, b) => (a.p ?? 1) - (b.p ?? 1), render: (p) => (p == null ? "–" : fmtP(p, "p")) },
                { title: "Patients", dataIndex: "patients", render: (d) => d.filter((x) => x.rel !== "unplaced").map((x) => x.patient).join(", ") },
              ]}
            />
          </div>
          <Alert
            type="warning"
            showIcon
            message="How far to trust this"
            description={
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: TYPE.tick }}>
                <li>{`${Object.keys(aligned.patients).length} patients: a 4/4 ordering has a sign-test p of 0.125, so these are recurrent patterns, not proven rules.`}</li>
                <li>BWH69, BWH75, MGH285 and MGH301 are on older trees; use &quot;Current trees&quot; to check a pattern without them.</li>
                <li>Events on the same branch cannot be ordered: the tree has no cells sampled between them (often the trunk).</li>
                <li>Single-cell copy-number calls are noisy; an event is only placed when its carriers match a clade (F1 ≥ 0.6).</li>
              </ul>
            }
          />
          <Text type="secondary" style={{ fontSize: TYPE.tick }}>
            {`Method: ${aligned.method?.placement}. Arms: ${aligned.method?.arm_calls}. Focal: ${aligned.method?.focal}. ecDNA: ${aligned.method?.ecdna}. SNVs: ${aligned.method?.snv}. Exported ${aligned.created}.`}
          </Text>
        </Space>
      </Card>
    </div>
  );
}
