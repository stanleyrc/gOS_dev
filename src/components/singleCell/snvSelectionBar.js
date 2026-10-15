import React, { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Button, Input, Segmented, Switch, Tag, Tooltip, Typography } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import singleCellActions, { SC_MAX_TRACK_CELLS } from "../../redux/singleCell/actions";
import { carrierCells, idsToColumns, removeSet, upsertSet } from "../../helpers/singleCell/snvSelection";
import { isolateTable, tableTsv } from "../../helpers/singleCell/snvIsolate";

const { Text } = Typography;
const NONE = [];

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/tab-separated-values" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Actions on the mutations selected on the heatmap (shift / Cmd / Ctrl-click or
 * drag on the column strip under the matrix): isolate, paint on the tree, show
 * the cells that carry them (any / all), export, IGV at the first, save as a
 * named set, clear. Renders nothing while no mutation is selected and no set is saved.
 *   onIsolate()        isolate the selected sites (the parent knows its own isolate flow)
 *   onPaint(columns)   paint the selected sites on the tree(s)
 */
export default function SnvSelectionBar({ snv, annot = null, patient = "", onIsolate = null, onPaint = null, painted = false }) {
  const dispatch = useDispatch();
  const layout = useSelector((s) => s.SingleCell.layout) || {};
  const pid = useSelector((s) => s.SingleCell.patient?.caseReportId);
  const [name, setName] = useState("");
  const selected = layout.snvSelected || NONE;
  const mode = layout.snvCarrierMode === "all" ? "all" : "any";
  const sets = (pid && layout.snvSets?.[pid]) || [];
  const columns = useMemo(() => idsToColumns(snv, selected), [snv, selected]);
  const update = (patch) => dispatch(singleCellActions.updateLayout(patch));
  const setSets = (next) => update({ snvSets: { ...(layout.snvSets || {}), [pid]: next } });
  if (!snv || (!columns.length && !sets.length)) return null;

  const carriers = () => carrierCells(snv, columns, mode);
  const igvFirst = () => {
    const v = snv.variants[columns[0]];
    const ids = carrierCells(snv, [columns[0]], "any").slice(0, SC_MAX_TRACK_CELLS);
    if (v && ids.length) dispatch(singleCellActions.openIgv({ cellIds: ids, chromosome: v.chromosome, position: v.position, label: v.id }));
  };
  const nCarriers = columns.length ? carriers().length : 0;
  const saveSet = () => {
    const label = name.trim() || `Set ${sets.length + 1}`;
    setSets(upsertSet(sets, label, selected));
    setName("");
  };

  return (
    <div className="sc-snv-selection-bar" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, padding: "2px 0" }}>
      {columns.length > 0 && (
        <>
          <Tag color="blue" style={{ marginInlineEnd: 0 }}>{`${columns.length} mutation${columns.length === 1 ? "" : "s"} selected`}</Tag>
          {onIsolate && (
            <Tooltip title="Isolate the selected sites: branch counts, carrier cells, table and fit">
              <Button size="small" type={layout.snvIsolate && layout.snvSelectedOnly ? "primary" : "default"} onClick={onIsolate}>Isolate</Button>
            </Tooltip>
          )}
          {onPaint && (
            <Tooltip title="Paint only the selected sites on the tree">
              <Button size="small" type={painted ? "primary" : "default"} onClick={() => onPaint(columns)}>Paint on tree</Button>
            </Tooltip>
          )}
          <Tooltip title={`Select the ${nCarriers} cells that carry ${mode === "all" ? "all" : "any"} of the selected mutations`}>
            <Button size="small" disabled={!nCarriers} onClick={() => dispatch(singleCellActions.updateSelection(carriers()))}>
              {`Show carriers (${nCarriers})`}
            </Button>
          </Tooltip>
          <Segmented size="small" value={mode} options={[{ value: "any", label: "any" }, { value: "all", label: "all" }]} onChange={(v) => update({ snvCarrierMode: v })} />
          <Button size="small" icon={<DownloadOutlined />} onClick={() => download(`${patient || "snv"}_selected_mutations.tsv`, tableTsv(isolateTable(snv, annot, columns)))}>TSV</Button>
          <Tooltip title={`IGV at ${snv.variants[columns[0]].id} (cells that carry it)`}>
            <Button size="small" onClick={igvFirst}>IGV (first)</Button>
          </Tooltip>
          <Tooltip title="Show only the selected mutations in the matrix (a site filter)">
            <span><Switch size="small" checked={Boolean(layout.snvSelectedOnly)} onChange={(on) => update({ snvSelectedOnly: on })} /> <Text type="secondary" style={{ fontSize: 12 }}>selected only</Text></span>
          </Tooltip>
          <Input size="small" style={{ width: 130 }} placeholder="set name" value={name} onChange={(e) => setName(e.target.value)} onPressEnter={saveSet} />
          <Button size="small" onClick={saveSet} disabled={!pid}>Save set</Button>
          <Button size="small" type="link" onClick={() => update({ snvSelected: [], snvSelectedOnly: false, snvPaintSelected: false })}>Clear</Button>
        </>
      )}
      {sets.map((s) => (
        <Tooltip key={s.name} title={`${s.ids.length} mutations; click to select`}>
          <Tag closable style={{ cursor: "pointer" }} onClick={() => update({ snvSelected: s.ids })} onClose={() => setSets(removeSet(sets, s.name))}>{s.name}</Tag>
        </Tooltip>
      ))}
    </div>
  );
}
