import { useEffect, useState } from "react";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";

// <dataPath>_cohort/hotspot_rescue.json (exporter gos_sc_hotspot_rescue.py): read evidence at the configured hotspots
// per patient, called or not. Fetched once per dataset; { status, doc } with doc = null when the file is missing.
const cache = new Map();

export function loadHotspotRescue(dataset) {
  const key = `${dataset.dataPath}`;
  if (!cache.has(key)) {
    const promise = tryGet(casePath(dataset, "_cohort", "hotspot_rescue.json")).then((r) => (r.status === "ok" ? r.data : null));
    promise.catch(() => cache.delete(key));
    cache.set(key, promise);
  }
  return cache.get(key);
}

export default function useHotspotRescue(dataset) {
  const [state, setState] = useState({ status: "loading", doc: null });
  useEffect(() => {
    if (!dataset) {
      setState({ status: "none", doc: null });
      return undefined;
    }
    let active = true;
    loadHotspotRescue(dataset)
      .then((doc) => active && setState({ status: doc ? "ok" : "none", doc }))
      .catch(() => active && setState({ status: "none", doc: null }));
    return () => {
      active = false;
    };
  }, [dataset]);
  return state;
}
