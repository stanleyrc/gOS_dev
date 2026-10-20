import React, { useMemo } from "react";
import { useSelector } from "react-redux";
import { Button, Drawer, Space, Tag, Typography } from "antd";
import { LinkOutlined } from "@ant-design/icons";
import PanelDataTable from "./panelDataTable";
import { cellsForPatient } from "../../../helpers/singleCell/cellFiles";
import { paperCladeLabel, paperStateColor } from "../../../helpers/singleCell/paperPalette";
import { selectionTable } from "../../../helpers/singleCell/paperSidecar";
import { patientCellsUrl } from "./interactiveSlot";

const { Text } = Typography;

const count = (xs) => {
  const m = new Map();
  xs.forEach((x) => m.set(x, (m.get(x) || 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

/**
 * The cells selected in a figure tab, without leaving the figure: clade and state composition (from the cohort
 * datafiles), a table of the cells with every per-cell value the figure shows (sidecar rows and marks), and links
 * to open them in the patient pages.
 */
export default function SelectionDrawer({ ids, patient, label, sidecar, figLabel, onClose }) {
  const datafiles = useSelector((s) => s.CaseReports.datafiles);
  const cells = useMemo(() => (patient ? cellsForPatient(datafiles || [], patient) : []), [datafiles, patient]);
  const byId = useMemo(() => new Map(cells.map((c) => [`${c.cell_id}`, c])), [cells]);
  const sel = ids.map((id) => byId.get(`${id}`)).filter(Boolean);
  const clades = count(sel.map((c) => paperCladeLabel(patient, c.clone_id)));
  const states = count(sel.map((c) => `${c.state ?? "no RNA"}`));
  const table = useMemo(() => selectionTable(sidecar, ids, (id) => byId.get(`${id}`), (c) => paperCladeLabel(patient, c?.clone_id)), [sidecar, ids, byId, patient]);
  return (
    <Drawer open onClose={onClose} mask={false} width={Math.min(760, Math.round((window.innerWidth || 1200) * 0.5))} title={`${ids.length} cell${ids.length === 1 ? "" : "s"}${patient ? ` · ${patient}` : ""}${label ? ` · ${label}` : ""}`}>
      <Space direction="vertical" size={10} style={{ width: "100%" }}>
        {patient ? (
          <>
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
              <Button type="primary" icon={<LinkOutlined />} href={patientCellsUrl(patient, ids, `${figLabel} selection`)} target="_blank" rel="noopener noreferrer">
                {`Open these cells in ${patient}`}
              </Button>
              <Button href={patientCellsUrl(patient, [], "")} target="_blank" rel="noopener noreferrer">{`${patient} patient page`}</Button>
            </Space>
          </>
        ) : (
          <Text type="secondary">patient not known for this selection</Text>
        )}
        <PanelDataTable tables={[table]} name={`${figLabel}_selection`} />
      </Space>
    </Drawer>
  );
}
