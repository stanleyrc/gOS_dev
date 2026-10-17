import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";
import { mergeClinicalEvents } from "../../../helpers/singleCell/clinicalEvents";

const cache = new Map();

/**
 * The patient's clinical_events.json (clinical-assay alterations as filtered-events rows with single-cell recovery, ClinVar and
 * gnomAD; srctools gos_sc_clinical_events.py). Optional: a patient without the file gets { status: "missing" } and nothing changes.
 */
export default function useClinicalEvents() {
  const dataset = useSelector((s) => s.Settings.dataset);
  const patient = useSelector((s) => s.SingleCell.patient);
  const [state, setState] = useState({ status: "loading", data: null });
  useEffect(() => {
    if (!dataset || !patient) return undefined;
    const key = `${dataset.dataPath}${patient.caseReportId}`;
    if (!cache.has(key)) cache.set(key, tryGet(casePath(dataset, patient.caseReportId, "clinical_events.json")).catch(() => ({ status: "missing" })));
    let cancelled = false;
    setState({ status: "loading", data: null });
    cache.get(key).then((r) => {
      if (!cancelled) setState(r && r.status === "ok" && r.data && Array.isArray(r.data.events) ? { status: "ok", data: r.data } : { status: "missing", data: null });
    });
    return () => {
      cancelled = true;
    };
  }, [dataset, patient]);
  return state;
}

/** The patient's filtered events plus the clinical findings (unless the "Clinical findings" switch is off), without duplicates. */
export function useMergedEvents() {
  const events = useSelector((s) => s.FilteredEvents.filteredEvents);
  const on = useSelector((s) => s.SingleCell.layout?.drivers?.clinical) !== false;
  const clinical = useClinicalEvents();
  return useMemo(() => (on && clinical.status === "ok" ? mergeClinicalEvents(events || [], clinical.data) : events || []), [events, on, clinical.status, clinical.data]);
}
