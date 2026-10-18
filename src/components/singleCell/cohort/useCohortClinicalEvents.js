import { useEffect, useState } from "react";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";

const cache = new Map();

/**
 * clinical_events.json of several patients (srctools gos_sc_clinical_events.py): { [patient]: data } for the patients that have
 * the file; others are left out. Used to add germline-like clinical variants to the tumour-suppressor hits.
 */
export default function useCohortClinicalEvents(dataset, patientIds = []) {
  const [out, setOut] = useState({});
  const key = patientIds.join(",");
  useEffect(() => {
    if (!dataset || !patientIds.length) return undefined;
    let cancelled = false;
    Promise.all(
      patientIds.map((p) => {
        const k = `${dataset.dataPath}${p}`;
        if (!cache.has(k)) cache.set(k, tryGet(casePath(dataset, p, "clinical_events.json")).catch(() => ({ status: "missing" })));
        return cache.get(k).then((r) => [p, r && r.status === "ok" && Array.isArray(r.data?.events) ? r.data : null]);
      })
    ).then((rows) => {
      if (!cancelled) setOut(Object.fromEntries(rows.filter(([, d]) => d)));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, key]);
  return out;
}
