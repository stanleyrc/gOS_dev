import React, { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import EventsCatalogTable from "./eventsCatalogTable";
import useCohortFiles from "../cohort/useCohortFiles";
import { selectMergedEvents } from "../../../redux/interpretations/selectors";
import settingsActions from "../../../redux/settings/actions";
import singleCellActions from "../../../redux/singleCell/actions";

/** The open patient's events catalog: the same files the cohort view reads (cached), events with the report's re-tiering. */
export default function PatientEventsCatalog() {
  const dispatch = useDispatch();
  const dataset = useSelector((s) => s.Settings.dataset);
  const patient = useSelector((s) => s.SingleCell.patient);
  const events = useSelector((s) => selectMergedEvents(s).filteredEvents);
  const id = patient?.caseReportId;
  const summaries = useMemo(() => (id && dataset ? [{ caseReportId: id, record: { datasetId: dataset.id } }] : []), [id, dataset]);
  const datasets = useMemo(() => (dataset ? [dataset] : []), [dataset]);
  const { files, progress } = useCohortFiles(summaries, datasets);
  const filesByPatient = useMemo(() => {
    const f = files[id];
    return f ? { [id]: { ...f, events: Array.isArray(events) && events.length ? events : f.events } } : {};
  }, [files, id, events]);
  const open = (row) => {
    if (row.link?.heatmap) dispatch(singleCellActions.updateHeatmapType(row.link.heatmap));
    dispatch(settingsActions.updateTab(`${row.link?.tab ?? 7}`));
  };
  return <EventsCatalogTable filesByPatient={filesByPatient} patients={id ? [id] : []} datasetKey={dataset?.id || "gbm-sc"} scope="patient" onOpen={open} loading={progress < 100 || !id} />;
}
