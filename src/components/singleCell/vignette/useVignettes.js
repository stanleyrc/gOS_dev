import { useEffect, useMemo, useState } from "react";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";
import { normalizeVignettes, vignettesAtConfidence } from "../../../helpers/singleCell/vignettes";
import { useFindingConfidence } from "../confidenceToggle";

// <dataPath>_cohort/vignettes.json, fetched once per dataset.
const cache = new Map();

export function loadVignettes(dataset) {
  const key = `${dataset.dataPath}`;
  if (!cache.has(key)) {
    const promise = tryGet(casePath(dataset, "_cohort", "vignettes.json")).then((r) => (r.status === "ok" ? normalizeVignettes(r.data) : null));
    promise.catch(() => cache.delete(key));
    cache.set(key, promise);
  }
  return cache.get(key);
}

/** { status: "loading" | "ok" | "none", vignettes }; splice items follow the splicing confidence toggle (spliceconf). */
export default function useVignettes(dataset) {
  const [state, setState] = useState({ status: "loading", vignettes: null });
  const [level] = useFindingConfidence();
  useEffect(() => {
    if (!dataset) {
      setState({ status: "none", vignettes: null });
      return undefined;
    }
    let active = true;
    loadVignettes(dataset)
      .then((vignettes) => active && setState({ status: vignettes ? "ok" : "none", vignettes }))
      .catch(() => active && setState({ status: "none", vignettes: null }));
    return () => {
      active = false;
    };
  }, [dataset]);
  return useMemo(() => (state.vignettes ? { ...state, vignettes: vignettesAtConfidence(state.vignettes, level) } : state), [state, level]);
}
