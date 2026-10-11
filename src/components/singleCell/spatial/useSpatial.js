import { useEffect, useState } from "react";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";
import { normalizeSpatial } from "../../../helpers/singleCell/spatial";

// <dataPath><patient>/spatial.json (srctools gos_sc_slidetag.R), fetched once per patient.
const cache = new Map();

export function loadSpatial(dataset, patientId) {
  const key = `${dataset.dataPath}${patientId}`;
  if (!cache.has(key)) {
    const promise = tryGet(casePath(dataset, patientId, "spatial.json")).then((r) =>
      r.status === "ok" ? { status: "ok", data: normalizeSpatial(r.data), raw: r.data } : { status: r.status === "missing" ? "none" : "error", data: null }
    );
    promise.catch(() => cache.delete(key));
    cache.set(key, promise);
  }
  return cache.get(key);
}

/** { status: "loading" | "ok" | "none" | "error", data: normalizeSpatial(...) | null, raw } */
export default function useSpatial(dataset, patientId) {
  const [state, setState] = useState({ status: "loading", data: null, raw: null });
  useEffect(() => {
    if (!dataset || !patientId) {
      setState({ status: "none", data: null, raw: null });
      return undefined;
    }
    let active = true;
    setState({ status: "loading", data: null, raw: null });
    loadSpatial(dataset, patientId)
      .then((r) => active && setState({ raw: null, ...r }))
      .catch(() => active && setState({ status: "error", data: null, raw: null }));
    return () => {
      active = false;
    };
  }, [dataset, patientId]);
  return state;
}
