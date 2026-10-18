import { useMemo } from "react";
import useCohortExport from "./useCohortExport";
import { cohortEntries } from "../../../helpers/singleCell/cohortOncoprint";
import { twoHitCalls } from "../../../helpers/singleCell/twoHit";
import { patientBadges } from "../../../helpers/singleCell/tsgHits";
import { mergeClinicalEvents } from "../../../helpers/singleCell/clinicalEvents";
import useCohortClinicalEvents from "./useCohortClinicalEvents";

/**
 * Multi-hit tumour suppressors of one patient for the badge rows (patient card, home card):
 * { status: "loading" | "ok" | "none", badges: tsgHits.patientBadges summaries (best first), hasLoss }.
 * `events` is the patient's filtered.events.json (undefined while loading, null when missing).
 */
export default function useTsgBadges(dataset, patientId, events) {
  const loss = useCohortExport(dataset, "tsg_loss.json");
  const phase = useCohortExport(dataset, "tsg_phase.json");
  const broad = useCohortExport(dataset, "broad_cn0.json");
  const mine = loss.data?.patients?.[patientId] || null;
  const myPhase = phase.data?.patients?.[patientId] || null;
  const myBroad = broad.data?.patients?.[patientId] || null;
  const clinical = useCohortClinicalEvents(dataset, patientId ? [patientId] : [])[patientId] || null;
  return useMemo(() => {
    if (events === undefined || loss.status === "loading" || phase.status === "loading") return { status: "loading", badges: [], hasLoss: false };
    if (!Array.isArray(events)) return { status: "none", badges: [], hasLoss: false };
    const calls = twoHitCalls(cohortEntries(clinical ? mergeClinicalEvents(events, clinical) : events), { loss: mine, phase: myPhase, broadCn0: myBroad });
    return { status: "ok", badges: patientBadges(calls, patientId), hasLoss: Boolean(mine) };
  }, [events, mine, myPhase, myBroad, loss.status, phase.status, patientId, clinical]);
}
