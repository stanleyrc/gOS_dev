import React, { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Alert, Empty, InputNumber, Radio, Space, Table, Tag, Tooltip, Typography } from "antd";
import useTreeView from "./useTreeView";
import HintLine from "./hintLine";
import settingsActions from "../../redux/settings/actions";
import singleCellActions from "../../redux/singleCell/actions";
import { driverKey } from "../../helpers/singleCell/driverContrast";
import { MIN_CELLS, edgeText, eventOrder, layoutOrder } from "../../helpers/singleCell/complexTiming";

const { Text } = Typography;
const COLORS = { truncal: "#237804", subclonal: "#1d39c4", private: "#8c8c8c" };
const isNormal = (clone) => /^normal$/i.test(`${clone || ""}`);

/**
 * Event order: complex SVs whose carriers nest (inner event inside outer event), drawn as a layered Hasse diagram.
 * Nesting is consistent with order (the inner event arose in a cell that already carried the outer one), not proof.
 */
export default function ComplexOrderCard() {
  const dispatch = useDispatch();
  const events = useSelector((s) => s.FilteredEvents.filteredEvents);
  const cells = useSelector((s) => s.SingleCell.cells);
  const { treeLayout, order: rowOrder } = useTreeView();
  const [minCells, setMinCells] = useState(MIN_CELLS);
  const [view, setView] = useState("graph");
  const [hover, setHover] = useState(null);
  const tumorIds = useMemo(() => {
    const normal = new Set((cells || []).filter((c) => isNormal(c.clone_id)).map((c) => `${c.cell_id}`));
    return (rowOrder || []).filter((id) => !normal.has(`${id}`));
  }, [cells, rowOrder]);
  const order = useMemo(() => eventOrder(events || [], { tree: treeLayout, tumorIds, minCells }), [events, treeLayout, tumorIds, minCells]);
  const byId = useMemo(() => new Map(order.nodes.map((n) => [n.id, n])), [order]);
  const geom = useMemo(() => layoutOrder(order), [order]);
  const open = (n) => {
    dispatch(singleCellActions.updateHeatmapType("drivers"));
    dispatch(singleCellActions.updateDriverDrawer(driverKey(n.events[0])));
    dispatch(settingsActions.updateTab("7"));
  };
  if (!(events || []).some((e) => e?.type === "Complex SV")) return <Empty description="No complex SV events in this patient" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  const nested = order.edges.length;
  const nodeTip = (n) => `${n.names.join(" = ")}: ${n.n} carrier cells${n.f1 != null ? `; best clade ${n.cladeSize} cells, F1 ${n.f1.toFixed(2)}` : "; clade not available (no tree)"}`;
  const colTitle = (d) => (d === 0 ? "outermost (carried by the most cells)" : `nested ${d} deep`);
  const columns = [
    { title: "Event", dataIndex: "names", render: (names, n) => <a onClick={() => open(n)}>{names.join(" = ")}</a> },
    { title: "Cells", dataIndex: "n", width: 70 },
    { title: "Clade", width: 150, render: (_, n) => (n.f1 != null ? <Tag color={COLORS[n.placement]}>{`${n.placement}, ${n.cladeSize} cells, F1 ${n.f1.toFixed(2)}`}</Tag> : <Text type="secondary">not available (no tree)</Text>) },
    { title: "Inside (outer events)", render: (_, n) => (n.parents.length ? n.parents.map((p) => { const e = order.edges.find((x) => x.from === p && x.to === n.id); return <div key={p}><Tooltip title={edgeText(e, byId)}><span>{`${byId.get(p).names[0]}: ${e.overlap} of ${e.inner}`}</span></Tooltip></div>; }) : <Text type="secondary">none</Text>) },
    { title: "Contains (inner events)", render: (_, n) => (n.children.length ? n.children.map((c) => { const e = order.edges.find((x) => x.from === n.id && x.to === c); return <div key={c}>{`${byId.get(c).names[0]}: ${e.overlap} of ${e.inner}`}</div>; }) : <Text type="secondary">none</Text>) },
  ];
  return (
    <div>
      <Space wrap style={{ marginBottom: 8 }}>
        <Radio.Group size="small" value={view} onChange={(e) => setView(e.target.value)} options={[{ value: "graph", label: "Diagram" }, { value: "list", label: "List" }]} optionType="button" />
        <span>Min carrier cells</span>
        <InputNumber size="small" min={2} max={200} value={minCells} onChange={(v) => v && setMinCells(v)} />
        <Text type="secondary">{`${order.nodes.length} events, ${nested} nesting link${nested === 1 ? "" : "s"} (inner has >= 90% of its carriers inside the outer)`}</Text>
      </Space>
      <Alert type="info" showIcon style={{ marginBottom: 8 }} message="Nesting is consistent with an order, not proof: allele or junction dropout can hide carriers, and independent events in the same clade nest the same way. Identical carrier sets under two classifier names are one node." />
      {!order.nodes.length ? (
        <Empty description={`No complex event with at least ${minCells} cells`} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : view === "list" ? (
        <Table size="small" rowKey="id" pagination={false} dataSource={order.nodes} columns={columns} />
      ) : (
        <div style={{ overflow: "auto", maxHeight: 900 }}>
          <svg width={geom.width + 20} height={geom.height + 24} role="img" aria-label="Complex event order">
            <defs><marker id="cpxArrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#8c8c8c" /></marker></defs>
            {Array.from({ length: order.depth + 1 }, (_, d) => (
              <text key={d} x={10 + d * 340} y={geom.height + 16} fontSize={11} fill="#8c8c8c">{colTitle(d)}</text>
            ))}
            {order.edges.map((e) => {
              const a = geom.pos.get(e.from);
              const b = geom.pos.get(e.to);
              const x1 = a.x + a.w;
              const y1 = a.y + a.h / 2;
              const x2 = b.x;
              const y2 = b.y + b.h / 2;
              const mx = (x1 + x2) / 2;
              const lit = hover && (hover === e.from || hover === e.to);
              const showLabel = lit || (!hover && order.edges.length <= 12);
              return (
                <g key={`${e.from}>${e.to}`} opacity={hover && !lit ? 0.12 : order.edges.length > 12 && !lit ? 0.45 : 1}>
                  <path d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2 - 2},${y2}`} fill="none" stroke={e.outside ? "#d48806" : "#8c8c8c"} strokeWidth={lit ? 2 : 1.2} markerEnd="url(#cpxArrow)">
                    <title>{edgeText(e, byId)}</title>
                  </path>
                  {showLabel && <text x={mx} y={(y1 + y2) / 2 - 3} fontSize={10} textAnchor="middle" fill="#595959">{`${e.overlap} of ${e.inner}`}</text>}
                </g>
              );
            })}
            {order.nodes.map((n) => {
              const p = geom.pos.get(n.id);
              const lit = hover === n.id;
              return (
                <g key={n.id} transform={`translate(${p.x},${p.y})`} style={{ cursor: "pointer" }} onClick={() => open(n)} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}>
                  <title>{nodeTip(n)}</title>
                  <rect width={p.w} height={p.h} rx={6} fill="#fff" stroke={COLORS[n.placement]} strokeWidth={lit ? 3 : 1.5} />
                  <text x={8} y={16} fontSize={12} fontWeight={600} fill="#262626">{n.names[0]}</text>
                  {n.names[1] && <text x={8} y={29} fontSize={10} fill="#595959">{`= ${n.names.slice(1).join(" = ")}`}</text>}
                  <text x={8} y={n.names[1] ? 41 : 33} fontSize={10} fill={COLORS[n.placement]}>{`${n.n} cells, ${n.f1 != null ? `${n.placement}, clade ${n.cladeSize}${n.cladeSize === tumorIds.length ? " (root)" : ""}, F1 ${n.f1.toFixed(2)}` : "clade n/a"}`}</text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
      <HintLine text="Click an event to open it in the Drivers layer. Edge label: carriers of the inner event that are also carriers of the outer one. Orange edge: some inner carriers lie outside the outer event." />
    </div>
  );
}
