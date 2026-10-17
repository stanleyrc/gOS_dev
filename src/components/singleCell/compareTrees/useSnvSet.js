import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";
import { snvFromSparse } from "../../../helpers/singleCell/cellFiles";
import { mergeSiteQc } from "../../../helpers/singleCell/siteQc";
import { FULL_SET } from "../../../helpers/singleCell/compareChoices";

const cache = new Map();

/**
 * The SNV matrix of a mutation set: "full" is the single-cell store's matrix (snv_matrix.json),
 * the others are fetched when first selected (data/<P>/<set.file>, same sparse format).
 * @returns { status: "idle" | "loading" | "ok" | "missing" | "error", data }
 */
export default function useSnvSet(set) {
  const dataset = useSelector((s) => s.Settings.dataset);
  const chromoBins = useSelector((s) => s.Settings.chromoBins);
  const patient = useSelector((s) => s.SingleCell.patient);
  const cells = useSelector((s) => s.SingleCell.cells);
  const store = useSelector((s) => s.SingleCell.snv);
  const [res, setRes] = useState({ key: null, status: "idle", data: null });
  const id = patient?.caseReportId;
  const external = set && set.name !== FULL_SET ? set : null;
  const key = external && dataset && id ? `${dataset.dataPath}${id}/${external.file}` : null;

  useEffect(() => {
    if (!key) return undefined;
    if (!cache.has(key)) {
      cache.set(key, tryGet(casePath(dataset, id, external.file)).catch((error) => ({ status: "error", error })));
    }
    let cancelled = false;
    setRes({ key, status: "loading", data: null });
    cache.get(key).then((r) => {
      if (cancelled) return;
      if (r?.status !== "ok") cache.delete(key);
      if (r?.status !== "ok") return setRes({ key, status: r?.status || "error", data: null });
      try {
        const snv = snvFromSparse(mergeSiteQc(r.data, null), cells.map((c) => c.cell_id), chromoBins);
        return setRes({ key, status: "ok", data: snv });
      } catch (error) {
        return setRes({ key, status: "error", data: null });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!set) return { status: "loading", data: null };
  if (!external) return store?.status === "ok" ? { status: "ok", data: store.data } : { status: store?.status || "missing", data: null };
  if (!key || res.key !== key) return { status: "loading", data: null };
  return res;
}

const indexCache = new Map();

/** data/<P>/snv_sets.json: the matrices available for the patient (see helpers/singleCell/compareChoices.js). Missing = only the full matrix. */
export function useSnvSetIndex() {
  const dataset = useSelector((s) => s.Settings.dataset);
  const patient = useSelector((s) => s.SingleCell.patient);
  const [res, setRes] = useState({ key: null, data: null, done: false });
  const id = patient?.caseReportId;
  const key = dataset && id ? `${dataset.dataPath}${id}` : null;
  useEffect(() => {
    if (!key) return undefined;
    if (!indexCache.has(key)) indexCache.set(key, tryGet(casePath(dataset, id, "snv_sets.json")).catch(() => ({ status: "error" })));
    let cancelled = false;
    indexCache.get(key).then((r) => {
      if (!cancelled) setRes({ key, data: r?.status === "ok" ? r.data : null, done: true });
    });
    return () => {
      cancelled = true;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data: res.key === key ? res.data : null, done: res.key === key && res.done };
}
