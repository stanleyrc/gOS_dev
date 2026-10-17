import { useMemo } from "react";
import useCohortExport from "./useCohortExport";
import { cohortEntries } from "../../../helpers/singleCell/cohortOncoprint";
import { biallelicSummary, cohortCallIndex, twoHitCalls } from "../../../helpers/singleCell/twoHit";

/**
 * Tumour-suppressor two-hit calls of every cohort patient (helpers/singleCell/twoHit.js): filtered-event SNVs / deletions
 * plus the per-cell allelic LOH calls of _cohort/tsg_loss.json (scripts/singleCell/export_tsg_loss.py).
 * Returns { status: "loading" | "ok" | "none", hasLoss, callsByPatient, index (Map "patient|gene" -> call), summary (biallelicSummary) }.
 */
export default function useCohortTsg({ dataset, summaries, files }) {
  const loss = useCohortExport(dataset, "tsg_loss.json");
  const phase = useCohortExport(dataset, "tsg_phase.json"); // cis / trans of SNV pairs (scripts/singleCell/export_tsg_phase.py); absent = unphased
  const callsByPatient = useMemo(() => {
    const out = {};
    summaries.forEach((s) => {
      const events = files[s.caseReportId]?.events;
      if (!events) return;
      out[s.caseReportId] = twoHitCalls(cohortEntries(events), { loss: loss.data?.patients?.[s.caseReportId] || null, phase: phase.data?.patients?.[s.caseReportId] || null });
    });
    return out;
  }, [summaries, files, loss.data, phase.data]);
  const index = useMemo(() => cohortCallIndex(callsByPatient), [callsByPatient]);
  const summary = useMemo(() => biallelicSummary(callsByPatient), [callsByPatient]);
  return { status: loss.status, hasLoss: loss.status === "ok", callsByPatient, index, summary };
}
