import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";

const cache = new Map();

/**
 * data/<P>/trees/support.json (bootstrap support per tree, see helpers/singleCell/treeSupport.js).
 * @returns { status: "idle" | "loading" | "ok" | "missing" | "error", data, patient }
 */
export default function useTreeSupport() {
  const dataset = useSelector((s) => s.Settings.dataset);
  const patient = useSelector((s) => s.SingleCell.patient);
  const [res, setRes] = useState({ key: null, status: "idle", data: null });
  const id = patient?.caseReportId;

  useEffect(() => {
    if (!dataset || !id) return undefined;
    const key = `${dataset.dataPath}${id}`;
    if (!cache.has(key)) cache.set(key, tryGet(casePath(dataset, id, "trees/support.json")).catch((error) => ({ status: "error", error })));
    let cancelled = false;
    cache.get(key).then((r) => {
      if (cancelled) return;
      if (r?.status === "error") cache.delete(key);
      setRes({ key, status: r?.status === "ok" ? "ok" : r?.status || "error", data: r?.status === "ok" ? r.data : null });
    });
    return () => {
      cancelled = true;
    };
  }, [dataset, id]);

  const key = dataset && id ? `${dataset.dataPath}${id}` : null;
  if (!key || res.key !== key) return { status: key ? "loading" : "idle", data: null, patient: id };
  return { status: res.status, data: res.data, patient: id };
}
