import React, { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Card, Empty, Skeleton, Space, Table, Tooltip, Typography } from "antd";
import datasetsActions from "../../../redux/datasets/actions";
import singleCellActions from "../../../redux/singleCell/actions";
import { cladeGroupName, cladeScatterPoints, cohortCladeRows, withCladeGroup } from "../../../helpers/singleCell/clades";
import { patientColor } from "../../../helpers/singleCell/patientColors";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import useContainerWidth from "../useContainerWidth";
import usePlotTheme from "../usePlotTheme";
import useCohortExport from "./useCohortExport";

const { Text } = Typography;
const H = 300;
const M = { l: 52, r: 14, t: 10, b: 38 };

/** n_cells vs mutation burden, one dot per called clade, coloured by patient. */
function CladeScatter({ points, patients, width, theme, onPick }) {
  const [hover, setHover] = useState(null);
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMax = Math.max(...xs, 1);
  const yMax = Math.max(...ys, 1);
  const px = (v) => M.l + (Math.log10(v + 1) / Math.log10(xMax + 1)) * (width - M.l - M.r);
  const py = (v) => H - M.b - (v / yMax) * (H - M.t - M.b);
  const xt = [1, 3, 10, 30, 100, 300, 1000].filter((v) => v <= xMax);
  const yt = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);
  return (
    <svg width={width} height={H} role="img">
      <title>Clade size vs mutation burden</title>
      {yt.map((v) => (
        <g key={v}>
          <line x1={M.l} x2={width - M.r} y1={py(v)} y2={py(v)} stroke={theme.grid} />
          <text x={M.l - 6} y={py(v)} dy="0.35em" textAnchor="end" fontSize={TYPE.tick} fill={theme.muted}>{v >= 10 ? Math.round(v) : v.toFixed(1)}</text>
        </g>
      ))}
      {xt.map((v) => (
        <text key={v} x={px(v)} y={H - M.b + 14} textAnchor="middle" fontSize={TYPE.tick} fill={theme.muted}>{v}</text>
      ))}
      <text x={(M.l + width - M.r) / 2} y={H - 4} textAnchor="middle" fontSize={TYPE.label} fill={theme.text}>cells in clade (log scale)</text>
      <text transform={`translate(12 ${H / 2}) rotate(-90)`} textAnchor="middle" fontSize={TYPE.label} fill={theme.text}>private SNVs per 1000 genotyped sites</text>
      {points.map((p) => (
        <circle
          key={p.id}
          cx={px(p.x)}
          cy={py(p.y)}
          r={hover === p.id ? 7 : 5}
          fill={patientColor(patients.indexOf(p.patient))}
          fillOpacity={0.8}
          stroke={theme.text}
          strokeOpacity={hover === p.id ? 1 : 0.25}
          style={{ cursor: "pointer" }}
          onMouseEnter={() => setHover(p.id)}
          onMouseLeave={() => setHover(null)}
          onClick={() => onPick(p.id)}
        >
          <title>{`${p.patient} ${p.tip}`}</title>
        </circle>
      ))}
    </svg>
  );
}

/**
 * Cohort Clades view: every clade called by gos_sc_clades.R (_cohort/clades.json), a sortable table
 * and a size-vs-burden scatter. Clicking a clade selects its cells in that patient's Single-Cell tab
 * (saved group + ?scsel=, the same mechanism as the saved-group links).
 */
export default function CohortCladesPanel({ dataset, summaries }) {
  const dispatch = useDispatch();
  const theme = usePlotTheme();
  const [ref, width] = useContainerWidth(800);
  const { status, data } = useCohortExport(dataset, "clades.json");
  const layout = useSelector((s) => s.SingleCell.layout);
  const rows = useMemo(() => cohortCladeRows(data), [data]);
  const patients = useMemo(() => [...new Set(rows.map((r) => r.patient))].sort(), [rows]);
  const points = useMemo(() => cladeScatterPoints(rows), [rows]);

  const open = (row) => {
    const summary = summaries.find((s) => `${s.caseReportId}` === `${row.patient}`);
    if (!summary) return;
    const all = layout.savedGroups || {};
    dispatch(singleCellActions.updateLayout({ savedGroups: { ...all, [row.patient]: withCladeGroup(all[row.patient], row) } }));
    const url = new URL(window.location.href);
    url.searchParams.set("report", row.patient);
    url.searchParams.set("scsel", cladeGroupName(row.clade));
    url.searchParams.set("tab", "7");
    window.history.replaceState(window.history.state, "", url.toString());
    dispatch(datasetsActions.openCaseReport(summary.record.datasetId, summary.caseReportId));
  };
  const openById = (id) => {
    const row = rows.find((r) => r.clade === id);
    if (row) open(row);
  };

  if (status === "loading") return <Skeleton active />;
  if (!rows.length) return <Empty description="Clades are not computed yet (_cohort/clades.json; srctools gos_sc_clades.R)." />;
  const num = (key) => (a, b) => (a[key] ?? -Infinity) - (b[key] ?? -Infinity);
  const columns = [
    { title: "Patient", dataIndex: "patient", sorter: (a, b) => a.patient.localeCompare(b.patient), filters: patients.map((p) => ({ text: p, value: p })), onFilter: (v, r) => r.patient === v },
    { title: "Clade", dataIndex: "clade", render: (v) => v.replace(/^.*_/, "") },
    { title: "Cells", dataIndex: "n_cells", sorter: num("n_cells"), align: "right" },
    { title: "Private SNVs", dataIndex: "n_private_snv", sorter: num("n_private_snv"), align: "right", render: (v) => v ?? "n/a" },
    { title: "Burden", dataIndex: "burden", sorter: num("burden"), defaultSortOrder: "descend", align: "right", render: (v) => (v == null ? "n/a" : v.toFixed(2)),
      onHeaderCell: () => ({ title: "private SNVs per 1000 genotyped sites" }) },
    { title: "Signature", dataIndex: "top_signature", sorter: (a, b) => `${a.top_signature || ""}`.localeCompare(`${b.top_signature || ""}`), render: (v) => v || "n/a" },
    { title: "Clone", dataIndex: "clone_id" },
    { title: "Drivers / events", dataIndex: "key_drivers", ellipsis: true, render: (v) => <Tooltip title={v}>{v}</Tooltip> },
  ];
  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Card size="small" title="Clade size vs mutation burden">
        <div ref={ref}>
          <CladeScatter points={points} patients={patients} width={width} theme={theme} onPick={openById} />
        </div>
        <Space size={12} wrap>
          {patients.map((p, k) => (
            <Space key={p} size={4}>
              <span style={{ width: 9, height: 9, borderRadius: 5, background: patientColor(k), display: "inline-block" }} />
              <Text type="secondary" style={{ fontSize: TYPE.tick }}>{p}</Text>
            </Space>
          ))}
        </Space>
      </Card>
      <Card size="small" title={`Called clades (${rows.length})`} extra={<Text type="secondary">Click a row to select the clade's cells in the patient's Single-Cell tab.</Text>}>
        <Table size="small" rowKey="clade" dataSource={rows} columns={columns} pagination={{ pageSize: 15, showSizeChanger: false }}
          onRow={(row) => ({ onClick: () => open(row), style: { cursor: "pointer" } })} />
      </Card>
    </Space>
  );
}
