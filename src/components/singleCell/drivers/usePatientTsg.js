import { useMemo } from "react";
import { useSelector } from "react-redux";
import useCohortExport from "../cohort/useCohortExport";
import { attachCalls, secondHitMap, twoHitCalls } from "../../../helpers/singleCell/twoHit";

/**
 * Two-hit calls of the open patient from its driver entries and _cohort/tsg_loss.json.
 * Returns { calls, secondHits (Map SNV entry key -> cells with the second hit, for entryStates ctx.twoHit), status }.
 */
export default function usePatientTsg(entries, tumorIds) {
  const dataset = useSelector((s) => s.Settings.dataset);
  const patient = useSelector((s) => s.SingleCell.patient);
  const loss = useCohortExport(dataset, "tsg_loss.json");
  const phase = useCohortExport(dataset, "tsg_phase.json");
  const myPhase = phase.data?.patients?.[patient?.caseReportId] || null;
  const mine = loss.data?.patients?.[patient?.caseReportId] || null;
  return useMemo(() => {
    const calls = twoHitCalls(entries || [], { loss: mine, tumorIds, phase: myPhase });
    attachCalls(entries || [], calls);
    return { calls, secondHits: secondHitMap(calls), status: loss.status, hasLoss: Boolean(mine) };
  }, [entries, mine, myPhase, tumorIds, loss.status]);
}
