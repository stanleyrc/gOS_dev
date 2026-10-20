import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Button, Drawer, Space, Tag, Typography } from "antd";
import { LinkOutlined } from "@ant-design/icons";
import PatientFigure, { useFocusFamily } from "../figures/patientFigure";
import CellProfiles from "../figures/cellProfiles";
import { FigureStyleDefault } from "../figures/figureCanvas";
import { FIGURES_VIEW_STYLE } from "../../../helpers/singleCell/figureStyle";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";
import { encodeGroups } from "../../../helpers/singleCell/savedGroups";
import { paperCladeLabel, paperStateColor } from "../../../helpers/singleCell/paperPalette";
import singleCellActions from "../../../redux/singleCell/actions";

const { Text } = Typography;

/** Patient Single-Cell tab with these cells selected (saved group in the URL), in a new tab. */
export function patientCellsUrl(patient, cells, name) {
  const p = new URLSearchParams(window.location.search);
  ["scview", "figmode", "figpanel", "figpatient", "scsel", "scgroups"].forEach((k) => p.delete(k));
  p.set("report", patient);
  p.set("tab", "7");
  if (cells?.length) {
    p.set("scgroups", encodeGroups({ [patient]: [{ name, cells }] }));
    p.set("scsel", name);
  }
  return `${window.location.pathname}?${p.toString()}`;
}

const count = (xs) => {
  const m = new Map();
  xs.forEach((x) => m.set(x, (m.get(x) || 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

/**
 * The selected cells of a live figure panel, in a side drawer that keeps the figure visible: clade and state
 * composition, the cells' copy-number profiles across the figure's genome windows (coverage, JaBbA segments,
 * junctions), and links into the patient pages.
 */
function CellDrawer({ patient, open, ids, label, onClose, focusWalkId, domains }) {
  const { order, focusWalk, cellById } = useFocusFamily(focusWalkId);
  const cells = ids.map((id) => cellById.get(id)).filter(Boolean);
  const clades = count(cells.map((c) => paperCladeLabel(patient, c.clone_id)));
  const states = count(cells.map((c) => `${c.state ?? "no RNA"}`));
  return (
    <Drawer open={open} onClose={onClose} mask={false} width={Math.min(760, Math.round((window.innerWidth || 1200) * 0.5))} title={`${ids.length} cell${ids.length === 1 ? "" : "s"} · ${patient}${label ? ` · ${label}` : ""}`}>
      <Space direction="vertical" size={10} style={{ width: "100%" }}>
        <div>
          <Text type="secondary">Clades </Text>
          {clades.map(([k, n]) => (
            <Tag key={k}>{`${k} ${n}`}</Tag>
          ))}
        </div>
        <div>
          <Text type="secondary">States </Text>
          {states.map(([k, n]) => (
            <Tag key={k} color={paperStateColor(k) || undefined}>{`${k} ${n}`}</Tag>
          ))}
        </div>
        <Space wrap>
          <Button type="primary" icon={<LinkOutlined />} href={patientCellsUrl(patient, ids, label || "figure selection")} target="_blank" rel="noopener noreferrer">
            {`Open these cells in ${patient}`}
          </Button>
          <Button href={patientCellsUrl(patient, [], "")} target="_blank" rel="noopener noreferrer">{`${patient} patient page`}</Button>
        </Space>
        <div className="sc-paperslot-sub">Copy number of the selected cells across the figure&apos;s windows (up to 3 cells)</div>
        <CellProfiles order={order} focusWalk={focusWalk} domains={domains} cellById={cellById} />
        <div className="sc-paperslot-sub">Cells</div>
        <div style={{ maxHeight: 260, overflow: "auto", fontSize: 12 }}>
          {cells.slice(0, 300).map((c) => (
            <div key={c.cell_id} className="sc-paperslot-cell">
              <a href={patientCellsUrl(patient, [c.cell_id], c.cell_id)} target="_blank" rel="noopener noreferrer">
                {c.cell_id}
              </a>
              <Text type="secondary">{` ${paperCladeLabel(patient, c.clone_id)} · ${c.state ?? "no RNA"}`}</Text>
            </div>
          ))}
          {cells.length > 300 && <Text type="secondary">{`… ${cells.length - 300} more`}</Text>}
        </div>
      </Space>
    </Drawer>
  );
}

/**
 * A figure panel as the live gOS component, in place in a paper-figure tab: the patient's tree, per-cell CN
 * heatmap (zoom / pan to a locus), SNV matrix, clade and state strips and walk copies, row-aligned, with the
 * walk lanes and genome tracks under it. Selecting cells (brush rows, click a node or walk) opens the cell drawer.
 */
export default function InteractiveSlot({ patient }) {
  const dispatch = useDispatch();
  const dataset = useSelector((s) => s.Settings?.dataset);
  const [events, setEvents] = useState([]);
  const [focusWalkId, setFocusWalkId] = useState(null);
  const [domains, setDomains] = useState([]);
  const [drawer, setDrawer] = useState(null);
  useEffect(() => {
    setEvents([]);
    setFocusWalkId(null);
    setDrawer(null);
    if (!dataset?.dataPath || !patient) return undefined;
    let live = true;
    tryGet(casePath(dataset, patient, "filtered.events.json")).then((r) => live && setEvents(r.status === "ok" && Array.isArray(r.data) ? r.data : []));
    return () => {
      live = false;
    };
  }, [dataset, patient]);
  const selected = useSelector((s) => s.SingleCell.selectedCellIds);
  const loaded = useSelector((s) => s.SingleCell.patient?.caseReportId);
  const ids = useMemo(() => (drawer ? drawer.ids : []), [drawer]);
  return (
    <FigureStyleDefault.Provider value={FIGURES_VIEW_STYLE}>
      <div className="sc-paperslot">
        <PatientFigure
          patient={patient}
          events={events}
          focusWalkId={focusWalkId}
          onFocusWalk={setFocusWalkId}
          onView={setDomains}
          onSelectCells={(sel, label) => sel?.length && setDrawer({ ids: sel, label })}
        />
        {`${loaded}` === `${patient}` && selected?.length > 0 && !drawer && (
          <div className="sc-paperpage-selbar">
            <b>{`${selected.length} cells selected`}</b>
            <Button size="small" onClick={() => setDrawer({ ids: selected, label: "selection" })}>
              Show cells
            </Button>
            <Button size="small" onClick={() => dispatch(singleCellActions.updateSelection([]))}>
              Clear
            </Button>
          </div>
        )}
        {drawer && `${loaded}` === `${patient}` && (
          <CellDrawer patient={patient} open={!!drawer} ids={ids} label={drawer.label} onClose={() => setDrawer(null)} focusWalkId={focusWalkId} domains={domains} />
        )}
      </div>
    </FigureStyleDefault.Provider>
  );
}
