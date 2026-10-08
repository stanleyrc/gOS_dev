import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import filteredEventsActions from "../../redux/filteredEvents/actions";

export const PENDING_EVENT_KEY = "gos-sc-pending-event";

/** Remember an event to open once a patient's report has loaded (cohort → patient). */
export function setPendingEvent(patient, event) {
  try {
    window.sessionStorage.setItem(
      PENDING_EVENT_KEY,
      JSON.stringify({ patient, gene: event.gene || event.fusion_genes, type: event.type, variant_g: event.Variant_g, location: event.Genome_Location })
    );
  } catch (error) {
    // storage unavailable: the patient still opens
  }
}

/** Finds the pending event in the loaded filtered events and opens its details (plots tab). */
export function matchPendingEvent(pending, events) {
  if (!pending || !events?.length) return null;
  return (
    events.find((e) => (e.gene || e.fusion_genes) === pending.gene && e.type === pending.type && (!pending.variant_g || e.Variant_g === pending.variant_g)) ||
    events.find((e) => (e.gene || e.fusion_genes) === pending.gene && (!pending.location || e.Genome_Location === pending.location)) ||
    null
  );
}

/** Mounted on the single-cell patient page: opens the pending event's popup when its events arrive. */
export default function PendingEventOpener() {
  const dispatch = useDispatch();
  const patient = useSelector((state) => state.SingleCell.patient);
  const events = useSelector((state) => state.FilteredEvents.filteredEvents);
  useEffect(() => {
    let pending = null;
    try {
      pending = JSON.parse(window.sessionStorage.getItem(PENDING_EVENT_KEY) || "null");
    } catch (error) {
      pending = null;
    }
    if (!pending || !patient || pending.patient !== patient.caseReportId || !events?.length) return;
    const match = matchPendingEvent(pending, events);
    try {
      window.sessionStorage.removeItem(PENDING_EVENT_KEY);
    } catch (error) {
      // ignore
    }
    if (match) dispatch(filteredEventsActions.selectFilteredEvent(match, "plots"));
  }, [dispatch, patient, events]);
  return null;
}
