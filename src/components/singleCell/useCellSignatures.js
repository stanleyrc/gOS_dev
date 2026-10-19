import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { casePath, tryGet } from "../../redux/singleCell/loaders";
const cache = new Map();
export default function useCellSignatures() {
  const dataset = useSelector((s) => s.Settings.dataset);
  const patient = useSelector((s) => s.SingleCell.patient);
  const key = dataset && patient ? casePath(dataset, patient.caseReportId, "signatures_cells.json") : null;
  const [state, setState] = useState({ key: null, data: null });
  useEffect(() => {
    if (!key) return undefined;
    let stopped = false;
    if (!cache.has(key)) cache.set(key, tryGet(key).catch(() => ({ status: "missing" })));
    cache.get(key).then((r) => { if (!stopped) setState({ key, data: r.status === "ok" && Array.isArray(r.data?.cells) ? r.data : null }); });
    return () => { stopped = true; };
  }, [key]);
  return state.key === key ? state.data : null;
}
