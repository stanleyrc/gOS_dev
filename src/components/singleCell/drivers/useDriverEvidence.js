import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";

const cache = new Map();

/**
 * The patient's drivers/evidence.json (RNA chimeric reads and partner-gene exon
 * counts per cell for every DNA fusion; srctools gos_sc_driver_evidence.py).
 * @returns { status: "loading" | "ok" | "missing", data }
 */
export default function useDriverEvidence() {
  const dataset = useSelector((s) => s.Settings.dataset);
  const patient = useSelector((s) => s.SingleCell.patient);
  const [state, setState] = useState({ status: "loading", data: null });
  useEffect(() => {
    if (!dataset || !patient) return undefined;
    const key = `${dataset.dataPath}${patient.caseReportId}`;
    if (!cache.has(key)) {
      const p = tryGet(casePath(dataset, patient.caseReportId, "drivers/evidence.json")).catch(() => ({ status: "missing" }));
      cache.set(key, p);
    }
    let cancelled = false;
    setState({ status: "loading", data: null });
    cache.get(key).then((r) => {
      if (!cancelled) setState(r && r.status === "ok" ? { status: "ok", data: r.data } : { status: "missing", data: null });
    });
    return () => {
      cancelled = true;
    };
  }, [dataset, patient]);
  return state;
}

/** Group colours of the deep-dive (mid-tone, readable on light and dark panels). */
export const CARRIER_COLOR = "#d4380d";
export const COMPARATOR_COLOR = "#1d6fd8";
export const OTHER_COLOR = "#a6a6a6";
