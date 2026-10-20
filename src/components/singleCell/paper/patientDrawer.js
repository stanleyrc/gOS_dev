import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { Button, Drawer, Space, Tag, Typography } from "antd";
import { LinkOutlined } from "@ant-design/icons";
import { PatientCardBody } from "../cohort/patientCards";
import { buildPatientReport } from "../../../helpers/singleCell/patientReport";
import { cellsForPatient } from "../../../helpers/singleCell/cellFiles";
import { cloneColorMap } from "../../../helpers/singleCell/matrix";
import { mainAmplicons } from "../../../helpers/singleCell/figureDefaults";
import { isNormalClone } from "../../../helpers/singleCell/figures";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";
import { patientCellsUrl } from "./interactiveSlot";

const { Text } = Typography;

/**
 * One patient's summary in a side drawer, opened from a cohort panel of a figure (a patient column, row or point):
 * cells and clone mix, clonal / subclonal drivers, signatures, burden, ecDNA amplicons with their carriers, and
 * links into the patient pages. Reads the patient's light files only (events, signatures, walks).
 */
export default function PatientDrawer({ patient, focus = null, onClose }) {
  const dataset = useSelector((s) => s.Settings?.dataset);
  const datafiles = useSelector((s) => s.CaseReports.datafiles);
  const [files, setFiles] = useState(null);
  useEffect(() => {
    setFiles(null);
    if (!patient || !dataset?.dataPath) return undefined;
    let live = true;
    const get = (f) => tryGet(casePath(dataset, patient, f)).then((r) => (r.status === "ok" ? r.data : null));
    Promise.all([get("filtered.events.json"), get("signatures.json"), get("walks.json")]).then(([events, signatures, walks]) => live && setFiles({ events: Array.isArray(events) ? events : [], signatures, walks }));
    return () => {
      live = false;
    };
  }, [patient, dataset]);
  const cells = useMemo(() => (patient ? cellsForPatient(datafiles || [], patient) : []), [datafiles, patient]);
  const report = useMemo(() => (files ? buildPatientReport({ patient, events: files.events, cells, variants: [], signatures: files.signatures }) : null), [files, patient, cells]);
  const cloneCounts = useMemo(() => {
    const out = {};
    cells.forEach((c) => {
      const k = c.clone_id ?? "Unassigned";
      out[k] = (out[k] || 0) + 1;
    });
    return out;
  }, [cells]);
  const cloneColors = useMemo(() => cloneColorMap(cells, Object.keys(cloneCounts)), [cells, cloneCounts]);
  const amps = useMemo(() => {
    const tumor = cells.filter((c) => !isNormalClone(c.clone_id)).map((c) => c.cell_id);
    return files?.walks?.walks ? mainAmplicons(files.walks.walks, tumor) : [];
  }, [files, cells]);
  return (
    <Drawer open={!!patient} onClose={onClose} mask={false} width={Math.min(560, Math.round((window.innerWidth || 1200) * 0.4))} title={patient ? `${patient} · patient summary` : ""}>
      {!report ? (
        <Text type="secondary">Loading…</Text>
      ) : (
        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          {focus?.fields && (
            <div>
              <Text type="secondary" style={{ fontSize: 13 }}>{`From ${focus.panel || "the figure"}: `}</Text>
              {Object.entries(focus.fields)
                .filter(([k]) => k !== "patient")
                .map(([k, v]) => (
                  <Tag key={k}>{`${k}: ${typeof v === "number" ? Number(v.toPrecision(4)) : v}`}</Tag>
                ))}
            </div>
          )}
          <Space wrap>
            <Button type="primary" icon={<LinkOutlined />} href={patientCellsUrl(patient, [], "")} target="_blank" rel="noopener noreferrer">
              {`Open ${patient}`}
            </Button>
          </Space>
          <PatientCardBody report={report} cloneCounts={cloneCounts} cloneColors={cloneColors} />
          <div>
            <Text type="secondary" style={{ fontSize: 13 }}>ecDNA / amplicons</Text>
            <div>
              {amps.length ? (
                amps.slice(0, 8).map((a) => (
                  <Tag key={a.key} color={a.main ? "blue" : undefined}>{`ec${a.label} · ${a.carriers} cells (${Math.round(100 * a.frac)}%) · median ${Math.round(a.medianCn)} copies`}</Tag>
                ))
              ) : (
                <Text type="secondary">not available (no walks.json)</Text>
              )}
            </div>
          </div>
        </Space>
      )}
    </Drawer>
  );
}
