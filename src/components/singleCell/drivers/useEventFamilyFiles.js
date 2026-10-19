import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";

const cache = new Map();

/**
 * The patient's event_families.json (family_rule, rules, families) and junction_identity.json (junction ids, per-cell
 * read support) written by srctools gos_sc_event_families.py. Each is { status: "ok" | "missing", data }.
 */
export default function useEventFamilyFiles() {
  const dataset = useSelector((s) => s.Settings.dataset);
  const patient = useSelector((s) => s.SingleCell.patient);
  const [state, setState] = useState({ families: { status: "loading" }, identity: { status: "loading" } });
  useEffect(() => {
    if (!dataset || !patient) return undefined;
    const get = (file) => {
      const key = `${dataset.dataPath}${patient.caseReportId}/${file}`;
      if (!cache.has(key)) cache.set(key, tryGet(casePath(dataset, patient.caseReportId, file)).catch(() => ({ status: "missing" })));
      return cache.get(key);
    };
    let alive = true;
    Promise.all([get("event_families.json"), get("junction_identity.json")]).then(([f, i]) => {
      if (alive) setState({ families: f?.status === "ok" ? f : { status: "missing" }, identity: i?.status === "ok" ? i : { status: "missing" } });
    });
    return () => {
      alive = false;
    };
  }, [dataset, patient]);
  return state;
}
