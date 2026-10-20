import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { Table, Tag, Tooltip, Typography } from "antd";
import { casePath, tryGet } from "../../redux/singleCell/loaders";
import { CALL_COLOR, RULE_TEXT, STATUS_FILE, VERDICT_COLOR, VERDICT_TEXT, cladeRows, dotPlotLayout, statusForEvent, statusLines, isEcdnaEvent } from "../../helpers/singleCell/ecdnaStatus";

const { Text } = Typography;
const cache = new Map();

/** The patient's ecdna_status.json: { status: "loading" | "ok" | "missing", data }. */
export function useEcdnaStatus() {
  const dataset = useSelector((s) => s.Settings.dataset);
  const patient = useSelector((s) => s.SingleCell.patient);
  const [state, setState] = useState({ status: "loading", data: null });
  useEffect(() => {
    if (!dataset || !patient) return undefined;
    const key = `${dataset.dataPath}${patient.caseReportId}`;
    if (!cache.has(key)) cache.set(key, tryGet(casePath(dataset, patient.caseReportId, STATUS_FILE)).catch(() => ({ status: "missing" })));
    let cancelled = false;
    cache.get(key).then((r) => {
      if (!cancelled) setState(r && r.status === "ok" ? { status: "ok", data: r.data } : { status: "missing", data: null });
    });
    return () => {
      cancelled = true;
    };
  }, [dataset, patient]);
  return state;
}

/** Chip for a computed status (statusForEvent output). missing: show "not available" for ecDNA events without a file. */
export function EcdnaStatusChip({ status, missing = false, style }) {
  if (!status) {
    return missing ? (
      <Tooltip title={`ecDNA status: not available (${STATUS_FILE} not loaded for this patient)`}>
        <Tag style={style}>ecDNA status n/a</Tag>
      </Tooltip>
    ) : null;
  }
  const lines = statusLines(status);
  return (
    <Tooltip
      overlayStyle={{ maxWidth: 520 }}
      title={
        <div style={{ fontSize: 12 }}>
          {lines.map((l, i) => (
            <div key={i} style={{ fontWeight: i === 0 ? 600 : 400 }}>{l}</div>
          ))}
          <div style={{ marginTop: 4, opacity: 0.8 }}>{RULE_TEXT}</div>
        </div>
      }
    >
      <Tag color={status.color} style={style} data-ecdna-status={status.verdict}>
        {status.text}
      </Tag>
    </Tooltip>
  );
}

/** Chip for a driver entry / event on the patient page (loads the patient's file). */
export function EntryEcdnaChip({ entry, style }) {
  const st = useEcdnaStatus();
  const status = useMemo(() => (st.status === "ok" ? statusForEvent(st.data, entry) : null), [st, entry]);
  if (!isEcdnaEvent(entry) || st.status === "loading") return null;
  return <EcdnaStatusChip status={status} missing={st.status !== "ok"} style={style} />;
}

function DotPlot({ doc, amplicon }) {
  const L = useMemo(() => dotPlotLayout(doc, amplicon, { width: 560, height: 220 }), [doc, amplicon]);
  if (!L.available) return <Text type="secondary">{`Per-clade CN plot: not available (${L.reason})`}</Text>;
  const { margin } = L;
  return (
    <svg width={L.width} height={L.height} style={{ display: "block" }} data-ecdna-dotplot>
      {L.yTicks.map((t) => (
        <g key={t.label}>
          <line x1={margin.l} x2={L.width - margin.r} y1={t.y} y2={t.y} stroke="#f0f0f0" />
          <text x={margin.l - 4} y={t.y} dy="0.35em" textAnchor="end" fontSize={10} fill="#8c8c8c">{t.label}</text>
        </g>
      ))}
      <text transform={`translate(10,${margin.t + (L.height - margin.t - margin.b) / 2}) rotate(-90)`} textAnchor="middle" fontSize={10} fill="#595959">CN (coverage)</text>
      {L.groups.map((g) => (
        <g key={g.key}>
          {g.points.map((p) => (
            <circle key={p.cell} cx={p.x} cy={p.y} r={2.4} fill={CALL_COLOR[g.call] || "#8c8c8c"} fillOpacity={0.7}>
              <title>{`${p.cell}: CN ${p.value}`}</title>
            </circle>
          ))}
          <text x={g.x} y={L.height - margin.b + 14} textAnchor="middle" fontSize={10} fill="#262626">{`${g.label} (n=${g.n})`}</text>
          <text x={g.x} y={L.height - margin.b + 27} textAnchor="middle" fontSize={10} fill={CALL_COLOR[g.call] || "#8c8c8c"}>{`${g.call.replace(" (sister untested)", "*")}${Number.isFinite(g.D) ? `, D ${Number(g.D).toPrecision(2)}` : ""}`}</text>
        </g>
      ))}
    </svg>
  );
}

const fmt = (x, d = 2) => (Number.isFinite(x) ? Number(x).toPrecision(d) : "n/a");

/** Drawer block: ecDNA status per overlapping amplicon, per-clade table and CN dot plot. Only for gGnome DM / Cpxdm entries. */
export function EcdnaStatusBlock({ entry }) {
  const st = useEcdnaStatus();
  const status = useMemo(() => (st.status === "ok" ? statusForEvent(st.data, entry) : null), [st, entry]);
  if (!isEcdnaEvent(entry)) return null;
  if (st.status === "loading") return null;
  if (st.status !== "ok") return <div style={{ marginBottom: 8 }}><Text type="secondary">{`ecDNA status: not available (${STATUS_FILE} not loaded for this patient)`}</Text></div>;
  if (!status) return <div style={{ marginBottom: 8 }}><Text type="secondary">ecDNA status: not available (no focal amplicon at CN ≥ 5 in ≥ 5 cells overlaps this footprint)</Text></div>;
  const columns = [
    { title: "Clade", dataIndex: "clade" },
    { title: "Call", dataIndex: "call", render: (c) => <Text style={{ color: CALL_COLOR[c] }}>{c}</Text> },
    { title: "Carriers", render: (_, r) => `${r.n}/${r.nGroup}` },
    { title: "Median CN", render: (_, r) => fmt(r.median, 3) },
    { title: "CV", render: (_, r) => fmt(r.cv) },
    { title: "D (95% CI)", render: (_, r) => `${fmt(r.D)} (${fmt(r.ci[0])} to ${fmt(r.ci[1])})` },
    { title: "Sister D", render: (_, r) => fmt(r.dSib) },
    { title: "gGnome DM cells", render: (_, r) => (Number.isFinite(r.ggDm) ? r.ggDm : "n/a") },
  ];
  return (
    <div style={{ marginBottom: 10 }} data-ecdna-status-block>
      <div style={{ marginBottom: 4 }}>
        <Text strong>ecDNA status by clade </Text>
        <EcdnaStatusChip status={status} />
      </div>
      <Text type="secondary" style={{ fontSize: 12 }}>{RULE_TEXT}</Text>
      {status.amplicons.slice(0, 3).map((a) => (
        <div key={a.id} style={{ marginTop: 8 }}>
          <Text>{`chr${a.chrom}:${(a.start / 1e6).toFixed(2)}-${(a.end / 1e6).toFixed(2)} Mb${a.label ? ` (${a.label})` : ""}: `}</Text>
          <Tag color={VERDICT_COLOR[a.verdict]}>{VERDICT_TEXT[a.verdict] || a.verdict}</Tag>
          {a.verdict_with_sphase && a.verdict_with_sphase !== a.verdict && <Text type="secondary">{`(with S-phase cells: ${a.verdict_with_sphase})`}</Text>}
          <Table size="small" pagination={false} rowKey="key" dataSource={cladeRows(a)} columns={columns} style={{ marginTop: 4 }} />
          <div style={{ marginTop: 6 }}>
            <DotPlot doc={st.data} amplicon={a} />
          </div>
        </div>
      ))}
      {status.amplicons.length > 3 && <Text type="secondary">{`+${status.amplicons.length - 3} more amplicons in this footprint`}</Text>}
    </div>
  );
}
