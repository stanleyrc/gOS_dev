import { useEffect, useState } from "react";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";

// <dataPath><patient>/portrait.json (srctools gos_sc_portrait.py), fetched once per patient.
const cache = new Map();

/** { status: "loading" | "ok" | "none", data } for one patient; the cohort file supplies the check labels. */
export default function usePatientPortrait(dataset, patient) {
  const [state, setState] = useState({ status: "loading", data: null });
  useEffect(() => {
    if (!dataset || !patient) {
      setState({ status: "none", data: null });
      return undefined;
    }
    const key = `${dataset.dataPath}|${patient}`;
    if (!cache.has(key)) {
      const promise = tryGet(casePath(dataset, patient, "portrait.json")).then((r) => (r.status === "ok" && r.data && typeof r.data === "object" ? r.data : null));
      promise.catch(() => cache.delete(key));
      cache.set(key, promise);
    }
    let active = true;
    cache.get(key).then((data) => active && setState({ status: data ? "ok" : "none", data })).catch(() => active && setState({ status: "none", data: null }));
    return () => {
      active = false;
    };
  }, [dataset, patient]);
  return state;
}
