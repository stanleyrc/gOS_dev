import { useEffect, useState } from "react";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";
import { normalizeStory } from "../../../helpers/singleCell/story";

// <dataPath>_cohort/story.json, fetched once per dataset.
const cache = new Map();

export function loadStory(dataset) {
  const key = `${dataset.dataPath}`;
  if (!cache.has(key)) {
    const promise = tryGet(casePath(dataset, "_cohort", "story.json")).then((r) => (r.status === "ok" ? normalizeStory(r.data) : null));
    promise.catch(() => cache.delete(key));
    cache.set(key, promise);
  }
  return cache.get(key);
}

/** { status: "loading" | "ok" | "none", story } */
export default function useStory(dataset) {
  const [state, setState] = useState({ status: "loading", story: null });
  useEffect(() => {
    if (!dataset) {
      setState({ status: "none", story: null });
      return undefined;
    }
    let active = true;
    loadStory(dataset)
      .then((story) => active && setState({ status: story ? "ok" : "none", story }))
      .catch(() => active && setState({ status: "none", story: null }));
    return () => {
      active = false;
    };
  }, [dataset]);
  return state;
}
