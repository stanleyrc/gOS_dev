import React, { useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Button, Input, Space, Spin, Typography, message } from "antd";
import datasetsActions from "../../../redux/datasets/actions";
import settingsActions from "../../../redux/settings/actions";
import singleCellActions from "../../../redux/singleCell/actions";
import HintLine from "../hintLine";
import useContainerWidth from "../useContainerWidth";
import { cellsInRect, keysByPatient, patientCellTables, spliceGroupName, stripLayout } from "../../../helpers/singleCell/spliceCells";
import { groupsOf, makeDef, upsertGroup, withGroups } from "../../../helpers/singleCell/cohortGroups";

const { Text } = Typography;
export const USING = "#d4380d";
export const COVERED = "#4E79A7";
const FADED = "#d0d4da";

/** Mini cohort UMAP coloured by junction use (cells of the picked event); cells off the event are grey. */
function MiniUmap({ cells, status, selection, onSelect, size = 300 }) {
  const placed = useMemo(() => cells.filter((c) => Number.isFinite(c.umap_1) && Number.isFinite(c.umap_2)), [cells]);
  const box = useMemo(() => {
    const xs = placed.map((c) => c.umap_1);
    const ys = placed.map((c) => c.umap_2);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  }, [placed]);
  const [drag, setDrag] = useState(null);
  const svg = useRef(null);
  const sx = (v) => 8 + ((v - box.x0) / (box.x1 - box.x0 || 1)) * (size - 16);
  const sy = (v) => size - 8 - ((v - box.y0) / (box.y1 - box.y0 || 1)) * (size - 16);
  const pt = (e) => {
    const r = svg.current.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const finish = (e) => {
    if (!drag) return;
    const [x, y] = pt(e);
    const [a, b] = [Math.min(x, drag[0]), Math.max(x, drag[0])];
    const [c, d] = [Math.min(y, drag[1]), Math.max(y, drag[1])];
    setDrag(null);
    if (b - a < 3 && d - c < 3) return;
    const keys = placed.filter((q) => status.has(q.key) && sx(q.umap_1) >= a && sx(q.umap_1) <= b && sy(q.umap_2) >= c && sy(q.umap_2) <= d).map((q) => q.key);
    onSelect(keys, e.shiftKey);
  };
  return (
    <svg
      ref={svg}
      width={size}
      height={size}
      style={{ display: "block", cursor: "crosshair", border: "1px solid rgba(128,128,128,0.25)" }}
      data-testid="splice-mini-umap"
      onMouseDown={(e) => setDrag(pt(e))}
      onMouseUp={finish}
      onMouseLeave={() => setDrag(null)}
    >
      {placed.map((c) => {
        const st = status.get(c.key);
        const sel = selection.has(c.key);
        return <circle key={c.key} cx={sx(c.umap_1)} cy={sy(c.umap_2)} r={st ? 3 : 1.6} fill={st === "using" ? USING : st === "covered" ? COVERED : FADED} fillOpacity={st ? 0.95 : 0.45} stroke={sel ? "#000" : "none"} strokeWidth={1.2} />;
      })}
      {drag && <text x={6} y={14} fontSize={10} fill="currentColor">drag a box (shift adds)</text>}
    </svg>
  );
}

/**
 * Cells at an event: per patient, a strip of the cells using the aberrant junction (red) and covered cells not using it
 * (blue), ordered by state then clone, plus a UMAP coloured the same way. Click / drag selects cells; the selection can
 * open the patient's Single-Cell tab or be saved as a cohort group.
 */
export default function CohortSpliceCells({ dataset, summaries = [], patients, cluster, focus, data }) {
  const dispatch = useDispatch();
  const layoutState = useSelector((s) => s.SingleCell.layout);
  const [ref, width] = useContainerWidth(900);
  const [selection, setSelection] = useState(() => new Set());
  const [hover, setHover] = useState(null);
  const [name, setName] = useState("");
  const [drag, setDrag] = useState(null);
  const svgRef = useRef(null);
  const dragged = useRef(false);
  const tables = useMemo(
    () => (data.ready ? patientCellTables(patients, (p) => data.clusterOf(p, cluster), focus, data.metaOf) : []),
    [data, patients, cluster, focus]
  );
  const focusKey = `${cluster.id}|${focus.ks.join(",")}`;
  React.useEffect(() => setSelection(new Set()), [focusKey]);
  const W = Math.max(520, Math.min(width, 1100) - 330);
  const lay = useMemo(() => stripLayout(tables, W), [tables, W]);
  const rowOf = useMemo(() => new Map(tables.flatMap((t) => (t.rows || []).map((r) => [r.key, r]))), [tables]);
  const status = useMemo(() => new Map([...rowOf].map(([k, r]) => [k, r.using ? "using" : "covered"])), [rowOf]);
  if (!data.ready) return <Spin size="small" />;
  const totalUsing = tables.reduce((a, t) => a + t.using, 0);
  const addKeys = (keys, add) => setSelection((prev) => new Set(add ? [...prev, ...keys] : keys));
  const toggle = (key, add) =>
    setSelection((prev) => {
      const next = new Set(add ? prev : []);
      if (prev.has(key) && (add || prev.size === 1)) next.delete(key);
      else next.add(key);
      return next;
    });
  const point = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const onUp = (e) => {
    if (!drag) return;
    const [x, y] = point(e);
    const moved = Math.abs(x - drag[0]) > 3 || Math.abs(y - drag[1]) > 3;
    setDrag(null);
    dragged.current = moved;
    if (moved) addKeys(cellsInRect(lay, { x0: drag[0], y0: drag[1], x1: x, y1: y }), e.shiftKey);
  };
  const byPatient = keysByPatient(selection);
  const label = focus.label;
  const defaultName = spliceGroupName(cluster.gene, label, focus.side);
  const saved = groupsOf(layoutState.cohortGroups, dataset.id);
  const saveGroup = () => {
    if (!selection.size) return;
    const gname = name.trim() || defaultName;
    dispatch(singleCellActions.updateLayout({ cohortGroups: withGroups(layoutState.cohortGroups, dataset.id, upsertGroup(saved, makeDef({ name: gname, keys: [...selection] }))) }));
    message.success(`Saved ${selection.size} cells as cohort group "${gname}" (Transcriptome > RNA > cell groups)`);
  };
  const openPatient = (patient) => {
    const s = summaries.find((x) => `${x.caseReportId}` === `${patient}`);
    if (!s) return;
    const ids = (byPatient[patient] || []).map((id) => data.cellByKey.get(`${patient}::${id}`)?.cell_id).filter(Boolean);
    if (!ids.length) {
      message.warning(`${patient}: the selected cells have no DNA cell id (cell_id) in rna/cells.json`);
      return;
    }
    const gname = `${cluster.gene} ${label}`.slice(0, 40);
    const all = layoutState.savedGroups || {};
    const mine = (all[patient] || []).filter((g) => g.name !== gname);
    dispatch(singleCellActions.updateLayout({ savedGroups: { ...all, [patient]: [...mine, { name: gname, cells: ids }] } }));
    const url = new URL(window.location.href);
    url.searchParams.set("report", patient);
    url.searchParams.set("scsel", gname);
    url.searchParams.set("tab", "7");
    window.history.replaceState(window.history.state, "", url.toString());
    dispatch(datasetsActions.openCaseReport(s.record.datasetId, s.caseReportId, { allowNewTab: true }));
    dispatch(settingsActions.updateTab("7"));
  };
  const selectAllUsing = () => setSelection(new Set(tables.flatMap((t) => (t.rows || []).filter((r) => r.using).map((r) => r.key))));
  const hr = hover ? rowOf.get(hover) : null;
  const hm = hr ? data.cellByKey.get(hover) : null;
  return (
    <Space direction="vertical" size={6} style={{ width: "100%" }} data-testid="cohort-splice-cells">
      <Space wrap>
        <Text strong>Cells at this event</Text>
        <HintLine inline text={`Each square is a cell with reads on the event's junctions. Red: uses ${label} (at least one read); blue: covered (>= 3 reads) but not using it. Ordered by patient, then state, then clone. Click or drag to select (shift adds); the UMAP on the right shows the same cells and accepts a drag box.`} />
        <Text type="secondary">{`${totalUsing} cells using in ${tables.filter((t) => t.using > 0).length} patients`}</Text>
      </Space>
      <div ref={ref} style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ position: "relative" }}>
          <svg
            ref={svgRef}
            width={lay.labelW + W}
            height={lay.height}
            style={{ display: "block", cursor: "crosshair", userSelect: "none" }}
            fontSize={11}
            onMouseDown={(e) => setDrag(point(e))}
            onMouseUp={onUp}
            onMouseLeave={() => setDrag(null)}
          >
            {lay.blocks.map((b, i) => {
              const t = tables[i];
              return (
                <g key={b.patient}>
                  <text x={0} y={b.y + 9} fill="currentColor" fontWeight={600}>{b.patient}</text>
                  <text x={0} y={b.y + 22} fill="currentColor" opacity={0.7} fontSize={10}>
                    {t.rows ? `${t.using} using / ${t.covered} covered` : "cells not exported for this patient"}
                  </text>
                  {b.cells.map((q) => {
                    const r = rowOf.get(q.key);
                    const sel = selection.has(q.key);
                    return (
                      <rect
                        key={q.key}
                        x={q.x}
                        y={q.y}
                        width={lay.cell}
                        height={lay.cell}
                        fill={r.using ? USING : COVERED}
                        fillOpacity={r.using ? 0.55 + 0.45 * (Number.isFinite(r.frac) ? r.frac : 1) : 0.55}
                        stroke={sel ? "#000" : "none"}
                        strokeWidth={1.5}
                        onMouseEnter={() => setHover(q.key)}
                        onMouseLeave={() => setHover(null)}
                        onClick={(e) => {
                          if (dragged.current) {
                            dragged.current = false;
                            return;
                          }
                          toggle(q.key, e.shiftKey);
                        }}
                      />
                    );
                  })}
                  {t.rows && t.rows.length === 0 && <text x={lay.labelW} y={b.y + 9} fill="currentColor" opacity={0.6} fontSize={10}>no covered cells</text>}
                </g>
              );
            })}
            {drag && <circle cx={drag[0]} cy={drag[1]} r={0} />}
          </svg>
          {hr && (
            <div style={{ position: "absolute", right: 0, top: 0, background: "var(--sc-plot-bg, #fff)", border: "1px solid rgba(128,128,128,0.4)", padding: "4px 8px", fontSize: 12, pointerEvents: "none", zIndex: 2 }} data-testid="splice-cell-tip">
              <div><b>{hr.id}</b></div>
              <div>{`${hr.focus} reads on ${label}, ${hr.other} on the other junction(s); PSI ${Number.isFinite(hr.frac) ? hr.frac.toFixed(2) : "–"}`}</div>
              <div>{`state ${hm?.state ?? "–"} · clone ${hm?.Clone_Annotation ?? "–"} · ${hr.using ? "using" : "covered, not using"}`}</div>
            </div>
          )}
        </div>
        {data.cells.length > 0 ? <MiniUmap cells={data.cells.map((c) => ({ ...c, key: `${c.patient}::${c.rna_id}` }))} status={status} selection={selection} onSelect={addKeys} /> : <Text type="secondary">Cohort UMAP not available (_cohort/rna/cells.json missing).</Text>}
      </div>
      <Space wrap>
        <Text>{selection.size} cells selected</Text>
        <Button size="small" onClick={selectAllUsing} disabled={!totalUsing}>Select all using</Button>
        <Button size="small" onClick={() => setSelection(new Set())} disabled={!selection.size}>Clear</Button>
        {Object.entries(byPatient).map(([p, ids]) => (
          <Button key={p} size="small" type="primary" ghost onClick={() => openPatient(p)}>{`Select in ${p} (${ids.length})`}</Button>
        ))}
        <Input size="small" style={{ width: 230 }} placeholder={defaultName} value={name} onChange={(e) => setName(e.target.value)} />
        <Button size="small" onClick={saveGroup} disabled={!selection.size}>Save as cohort group</Button>
      </Space>
      <Space size={12}>
        <Text style={{ fontSize: 12 }}><span style={{ color: USING }}>■</span> using {label}</Text>
        <Text style={{ fontSize: 12 }}><span style={{ color: COVERED }}>■</span> covered, not using</Text>
        <Text style={{ fontSize: 12 }}><span style={{ color: FADED }}>■</span> no reads on this event</Text>
      </Space>
    </Space>
  );
}
