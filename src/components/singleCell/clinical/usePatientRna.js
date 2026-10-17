import { useEffect, useState } from "react";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";

const cache = new Map();
const load = (dataset, id) => {
  const key = `${dataset.dataPath}|${id}`;
  if (!cache.has(key)) cache.set(key, tryGet(casePath(dataset, id, "rna/cells.json")).then((r) => (r.status === "ok" && Array.isArray(r.data?.cells) ? r.data.cells.map((c) => ({ ...c, patient: id })) : null)));
  return cache.get(key);
};

/**
 * RNA cells of every listed patient from its own <patient>/rna/cells.json (the cohort-level export covers fewer patients).
 * -> { status: "loading" | "ok" | "none", cells (all patients, tagged with `patient`), missing: patients without a file }
 */
export default function usePatientRna(dataset, ids) {
  const [state, setState] = useState({ status: "loading", cells: [], missing: [] });
  const key = (ids || []).join(",");
  useEffect(() => {
    if (!dataset || !ids || !ids.length) {
      setState({ status: "none", cells: [], missing: ids || [] });
      return undefined;
    }
    let active = true;
    Promise.all(ids.map((id) => load(dataset, id).catch(() => null))).then((all) => {
      if (!active) return;
      const cells = all.flatMap((x) => x || []);
      setState({ status: cells.length ? "ok" : "none", cells, missing: ids.filter((_, i) => !all[i]) });
    });
    return () => {
      active = false;
    };
  }, [dataset, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}
