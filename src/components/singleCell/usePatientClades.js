import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { casePath, tryGet } from "../../redux/singleCell/loaders";

const cache = new Map();

/** The patient's clades.json (srctools gos_sc_clades.R): { status: "loading" | "ok" | "missing", data }. */
export default function usePatientClades() {
  const dataset = useSelector((s) => s.Settings.dataset);
  const patient = useSelector((s) => s.SingleCell.patient);
  const [state, setState] = useState({ status: "loading", data: null });
  useEffect(() => {
    if (!dataset || !patient) return undefined;
    const key = `${dataset.dataPath}${patient.caseReportId}`;
    if (!cache.has(key)) cache.set(key, tryGet(casePath(dataset, patient.caseReportId, "clades.json")).catch(() => ({ status: "missing" })));
    let cancelled = false;
    cache.get(key).then((r) => {
      if (!cancelled) setState(r && r.status === "ok" && r.data?.clades ? { status: "ok", data: r.data } : { status: "missing", data: null });
    });
    return () => {
      cancelled = true;
    };
  }, [dataset, patient]);
  return state;
}
