import { useEffect, useState } from "react";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";

// One precomputed cohort file, <dataPath>_cohort/<file> (e.g. aligned_trees.json,
// associations.json from srctools gos_sc_cohort_evolution.py), fetched once per dataset.
const cache = new Map();

export function loadCohortExport(dataset, file) {
  const key = `${dataset.dataPath}|${file}`;
  if (!cache.has(key)) {
    const promise = tryGet(casePath(dataset, "_cohort", file)).then((r) => (r.status === "ok" && r.data && typeof r.data === "object" ? r.data : null));
    promise.catch(() => cache.delete(key));
    cache.set(key, promise);
  }
  return cache.get(key);
}

/** { status: "loading" | "ok" | "none", data } */
export default function useCohortExport(dataset, file) {
  const [state, setState] = useState({ status: "loading", data: null });
  useEffect(() => {
    if (!dataset) {
      setState({ status: "none", data: null });
      return undefined;
    }
    let active = true;
    setState({ status: "loading", data: null });
    loadCohortExport(dataset, file)
      .then((data) => active && setState({ status: data ? "ok" : "none", data }))
      .catch(() => active && setState({ status: "none", data: null }));
    return () => {
      active = false;
    };
  }, [dataset, file]);
  return state;
}
