import { useMemo } from "react";
import useCohortExport from "../cohort/useCohortExport";

/**
 * Clinical assay exports of the cohort: _cohort/clinical_assays.json (parsed Oncopanel / Genexus reports + clinical
 * metadata) and _cohort/clinical_recovery.json (recovery in the single-cell data). Both come from srctools
 * gos_sc_clinical.py / gos_sc_clinical_recovery.py. -> { status: "loading" | "ok" | "none", assays, recovery }
 */
export default function useClinicalAssays(dataset) {
  const a = useCohortExport(dataset, "clinical_assays.json");
  const r = useCohortExport(dataset, "clinical_recovery.json");
  return useMemo(
    () => ({ status: a.status === "loading" || r.status === "loading" ? "loading" : a.data || r.data ? "ok" : "none", assays: a.data, recovery: r.data }),
    [a.status, a.data, r.status, r.data]
  );
}
