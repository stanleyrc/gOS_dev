import React, { useEffect, useMemo, useState } from "react";
import * as d3 from "d3";
import { Alert, Card, Empty, InputNumber, Segmented, Select, Skeleton, Space, Table, Typography } from "antd";
import { describeRow, forestDomain, forestOf, fmtP, measureOf, pickers, summaryRows, zMatrix } from "../../../helpers/singleCell/eventAssociations";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import useContainerWidth from "../useContainerWidth";
import usePlotTheme from "../usePlotTheme";
import SvgExportButton from "../svgExportButton";
import useCohortExport from "./useCohortExport";
import useMultiSort from "./multiSort";
import HintLine from "../hintLine";

const { Text } = Typography;
const CLASS_NAMES = { snv: "SNV / indel", amp: "Amplification", homdel: "Homozygous deletion", fusion: "Fusion", complex: "Complex (DM / TIC / BFB)" };

/** Forest plot: per-patient effect +- 95% CI and the combined estimate. */
function Forest({ row, width, theme }) {
  const rows = forestOf(row);
  const rowH = 24;
  const M = { l: 190, r: 150, t: 22, b: 34 };
  const H = M.t + rows.length * rowH + M.b;
  const [lo, hi] = forestDomain(rows);
  const x = d3.scaleLinear().domain([lo, hi]).range([M.l, Math.max(M.l + 120, width - M.r)]);
  const ticks = x.ticks(6);
  return (
    <svg width={width} height={H} role="img">
      <title>{`Forest plot: ${row.label}, ${row.outcome}`}</title>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={x(v)} x2={x(v)} y1={M.t - 6} y2={H - M.b} stroke={theme.grid} />
          <text x={x(v)} y={H - M.b + 14} textAnchor="middle" fontSize={TYPE.tick} fill={theme.muted}>{v}</text>
        </g>
      ))}
      <line x1={x(0)} x2={x(0)} y1={M.t - 6} y2={H - M.b} stroke={theme.axis} strokeWidth={1.5} />
      <text x={(M.l + x.range()[1]) / 2} y={H - 4} textAnchor="middle" fontSize={TYPE.label} fill={theme.text}>
        {`${measureOf(row)}: carriers vs non-carriers (right = higher in carriers)`}
      </text>
      <text x={x.range()[1] + 12} y={14} fontSize={TYPE.tick} fill={theme.muted}>effect [95% CI] · p</text>
      {rows.map((r, i) => {
        const y = M.t + i * rowH + rowH / 2;
        const pooled = r.kind === "pooled";
        const col = r.effect > 0 ? "#D7191C" : "#2C7BB6";
        return (
          <g key={r.label}>
            {pooled && <rect x={0} y={y - rowH / 2} width={width} height={rowH} fill={theme.band} />}
            <text x={M.l - 10} y={y} dy="0.35em" textAnchor="end" fontSize={TYPE.label} fontWeight={pooled ? 700 : 400} fill={theme.text}>{`${r.label}${pooled ? "" : ` (${r.n} carriers)`}`}</text>
            <line x1={x(Math.max(lo, r.lo))} x2={x(Math.min(hi, r.hi))} y1={y} y2={y} stroke={col} strokeWidth={pooled ? 2.5 : 1.5} />
            {pooled ? (
              <path d={`M${x(r.effect)},${y - 7} L${x(r.effect) + 7},${y} L${x(r.effect)},${y + 7} L${x(r.effect) - 7},${y} Z`} fill={col} />
            ) : (
              <rect x={x(r.effect) - 4} y={y - 4} width={8} height={8} fill={col} />
            )}
            <text x={x.range()[1] + 12} y={y} dy="0.35em" fontSize={TYPE.tick} fill={theme.textSecondary}>{`${r.effect >= 0 ? "+" : ""}${r.effect.toFixed(2)} [${r.lo.toFixed(2)}, ${r.hi.toFixed(2)}] · ${fmtP(r.p)}`}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Events x outcomes heatmap of the combined Stouffer z; * marks q < 0.05. */
function ZHeatmap({ matrix, width, theme, selected, onPick }) {
  const labelW = 160;
  const rowH = 20;
  const headH = 92;
  const cw = Math.max(34, Math.min(62, (width - labelW - 8) / Math.max(1, matrix.outcomes.length)));
  const H = headH + matrix.events.length * rowH + 4;
  const color = d3.scaleDiverging(d3.interpolateRdBu).domain([5, 0, -5]);
  return (
    <svg width={labelW + cw * matrix.outcomes.length + 8} height={H} role="img">
      <title>Combined z of events by outcome</title>
      {matrix.outcomes.map((o, j) => (
        <text key={o} x={labelW + j * cw + cw / 2} y={headH - 6} textAnchor="start" fontSize={TYPE.tick} fill={theme.text} transform={`rotate(-50 ${labelW + j * cw + cw / 2} ${headH - 6})`}>{o}</text>
      ))}
      {matrix.events.map((e, i) => (
        <g key={e.event}>
          <text x={labelW - 8} y={headH + i * rowH + rowH / 2} dy="0.35em" textAnchor="end" fontSize={TYPE.label} fill={theme.text}>{e.label}</text>
          {matrix.outcomes.map((o, j) => {
            const r = matrix.cell.get(`${e.event}|${o}`);
            const on = selected === `${e.event}|${o}`;
            return (
              <g key={o} style={{ cursor: r ? "pointer" : undefined }} onClick={() => r && onPick(r.key)}>
                <rect x={labelW + j * cw + 1} y={headH + i * rowH + 1} width={cw - 2} height={rowH - 2} rx={2} fill={r ? color(Math.max(-5, Math.min(5, r.stouffer_z))) : theme.empty} stroke={on ? theme.select : "none"} strokeWidth={2} />
                {r && Math.min(r.q ?? 1, r.stouffer_q ?? 1) < 0.05 && <text x={labelW + j * cw + cw / 2} y={headH + i * rowH + rowH / 2} dy="0.35em" textAnchor="middle" fontSize={TYPE.label} fontWeight={700} fill="#000">*</text>}
                {r && <title>{`${e.label} · ${o}: z ${r.stouffer_z.toFixed(1)}, ${r.k} patients`}</title>}
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}

/**
 * Events x state: for every recurrent driver / copy-number event, carriers vs non-carriers inside each patient
 * on cell state, cycling and RNA programs, combined across patients (random effects and Stouffer z).
 */
export default function CohortEventAssocPanel({ dataset }) {
  const theme = usePlotTheme();
  const [ref, width] = useContainerWidth(900);
  const { status, data } = useCohortExport(dataset, "event_associations.json");
  const [minK, setMinK] = useState(3);
  const [maxQ, setMaxQ] = useState(1);
  const [outcomes, setOutcomes] = useState([]);
  const [classes, setClasses] = useState([]);
  const [events, setEvents] = useState([]);
  const [direction, setDirection] = useState("any");
  const [selected, setSelected] = useState(null);
  const opts = useMemo(() => pickers(data), [data]);
  const rows = useMemo(() => summaryRows(data, { minK, maxQ, outcomes, classes, events, direction }), [data, minK, maxQ, outcomes, classes, events, direction]);
  const matrix = useMemo(() => zMatrix(data, { minK }), [data, minK]);
  const sel = rows.find((r) => r.key === selected) || rows[0] || null;
  useEffect(() => {
    if (selected && !rows.some((r) => r.key === selected)) setSelected(null);
  }, [rows, selected]);
  const headline = useMemo(() => summaryRows(data, { minK: 3, maxQ: 0.05 }).slice(0, 4), [data]);

  const baseColumns = [
    { title: "Event", dataIndex: "label", sortable: true, render: (v) => <Text strong>{v}</Text> },
    { title: "Outcome", dataIndex: "outcome", sortable: true },
    { title: "Patients", dataIndex: "k", sortable: true, firstDir: "desc", align: "right" },
    { title: "Effect", dataIndex: "effect", sortable: true, firstDir: "desc", align: "right", render: (v, r) => `${v >= 0 ? "+" : ""}${v.toFixed(2)} (${measureOf(r)})` },
    { title: "Same direction", dataIndex: "k_up", sortable: true, sortValue: (r) => Math.max(r.k_up, r.k - r.k_up) / r.k, firstDir: "desc", align: "right", render: (_, r) => `${Math.max(r.k_up, r.k - r.k_up)}/${r.k}` },
    { title: "p (random effects)", dataIndex: "p", sortable: true, align: "right", render: fmtP },
    { title: "q (random)", dataIndex: "q", sortable: true, align: "right", render: fmtP },
    { title: "Stouffer z", dataIndex: "stouffer_z", sortable: true, sortValue: (r) => Math.abs(r.stouffer_z), firstDir: "desc", align: "right", render: (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}` },
    { title: "q (Stouffer)", dataIndex: "stouffer_q", sortable: true, align: "right", render: fmtP },
    { title: "I²", dataIndex: "i2", sortable: true, align: "right", render: (v) => `${Math.round((v || 0) * 100)}%` },
  ];
  const sort = useMultiSort(baseColumns, rows, [{ key: "q", dir: "asc" }]);

  if (status === "loading") return <Skeleton active />;
  if (!data) return <Empty description="Event associations are not computed yet (_cohort/event_associations.json; srctools gos_sc_cohort_event_assoc.py)." />;
  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Card size="small" title="Driver and copy-number events vs cell state, across patients" extra={<SvgExportButton containerRef={ref} name="event-associations" />}>
        <div ref={ref}>
          {headline.length > 0 && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 8 }}
              message="Strongest combined associations (3+ patients, q < 0.05)"
              description={<ul style={{ margin: 0, paddingLeft: 18 }}>{headline.map((r) => <li key={r.key}>{describeRow(r)}</li>)}</ul>}
            />
          )}
          <Space wrap size={[12, 6]} style={{ marginBottom: 8 }}>
            <Select size="small" mode="multiple" allowClear showSearch maxTagCount="responsive" placeholder="events (all)" style={{ minWidth: 220 }} value={events} onChange={setEvents} options={opts.events.map((e) => ({ value: e.event, label: `${e.label} (${e.nPatients} pt)` }))} filterOption={(i, o) => `${o.label}`.toUpperCase().includes(i.toUpperCase())} />
            <Select size="small" mode="multiple" allowClear maxTagCount="responsive" placeholder="class (all)" style={{ minWidth: 150 }} value={classes} onChange={setClasses} options={Object.entries(CLASS_NAMES).map(([value, label]) => ({ value, label }))} />
            <Select size="small" mode="multiple" allowClear maxTagCount="responsive" placeholder="outcomes (all)" style={{ minWidth: 180 }} value={outcomes} onChange={setOutcomes} options={opts.outcomes.map((o) => ({ value: o, label: o }))} />
            <Space size={4}><Text type="secondary">Min patients</Text><InputNumber size="small" min={2} max={9} value={minK} onChange={(v) => setMinK(v || 2)} style={{ width: 56 }} /></Space>
            <Space size={4}><Text type="secondary">Max q</Text><Select size="small" value={maxQ} onChange={setMaxQ} style={{ width: 80 }} options={[1, 0.25, 0.1, 0.05].map((v) => ({ value: v, label: v === 1 ? "any" : `${v}` }))} /></Space>
            <Segmented size="small" value={direction} onChange={setDirection} options={[{ value: "any", label: "Any" }, { value: "up", label: "Higher in carriers" }, { value: "down", label: "Lower in carriers" }]} />
          </Space>
          {matrix.events.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <ZHeatmap matrix={matrix} width={width} theme={theme} selected={sel?.key} onPick={setSelected} />
            </div>
          )}
          <HintLine text="Colour = combined Stouffer z (red: higher in carriers, blue: lower); * = q < 0.05 by either combination. Carriers and non-carriers are compared inside each patient, then combined. Replicating events (same direction in several patients) are more convincing than a single large effect. Caveat: copy-number calls of cycling cells can be inflated by S phase, so amplifications that track S/G2M scores may reflect replication, not biology." />
        </div>
      </Card>
      {sel && (
        <Card size="small" title={`${sel.label}: ${sel.outcome}`}>
          <Forest row={sel} width={Math.max(520, width)} theme={theme} />
          <Text type="secondary">{describeRow(sel)}</Text>
        </Card>
      )}
      <Card size="small" title={`Associations (${rows.length})`}>
        {sort.hint}
        <Table size="small" rowKey="key" dataSource={sort.rows} columns={sort.columns} pagination={{ pageSize: 15, showSizeChanger: false }} scroll={{ x: true }} onRow={(r) => ({ onClick: () => setSelected(r.key), style: { cursor: "pointer", background: sel?.key === r.key ? theme.selectFill : undefined } })} />
      </Card>
    </Space>
  );
}
