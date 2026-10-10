import React, { useEffect } from "react";
import { useSelector } from "react-redux";
import { evidenceAction } from "../../../helpers/singleCell/vignettes";
import { peekEvidence, subscribeEvidence, takeEvidence } from "../../../helpers/singleCell/evidenceFocus";
import useVignettes from "./useVignettes";
import { EvidenceDrawer, useEvidenceRunner } from "./patientVignette";

/**
 * Runs an evidence chip clicked in the cohort Key findings list once that
 * patient's page is open and its single-cell data have loaded (the chip
 * queues { kind: "vignette-run", patient, findingId, index } and opens the
 * patient). Mounted once in the detail view; renders only the evidence drawer.
 */
export default function VignetteActionRunner() {
  const dataset = useSelector((s) => s.Settings.dataset);
  const { patient, loading, cells } = useSelector((s) => s.SingleCell);
  const id = patient?.caseReportId;
  const ready = Boolean(id) && !loading && (cells || []).length > 0;
  const { vignettes } = useVignettes(ready && peekEvidence()?.kind === "vignette-run" ? dataset : null);
  const { run, drawer, closeDrawer } = useEvidenceRunner(id);
  useEffect(() => {
    if (!ready || !vignettes) return undefined;
    const consume = () => {
      const req = takeEvidence("vignette-run", id);
      const v = req && vignettes.patients[id];
      const f = v?.findings.find((x) => x.id === req.findingId);
      const e = f?.evidence[req.index];
      if (e) run(evidenceAction(e, f, v), `${f.short} · ${e.label}`);
    };
    const timer = setTimeout(consume, 300);
    const unsub = subscribeEvidence(() => setTimeout(consume, 300));
    return () => {
      clearTimeout(timer);
      unsub();
    };
  }, [ready, vignettes, id, run]);
  return <EvidenceDrawer drawer={drawer} onClose={closeDrawer} />;
}
