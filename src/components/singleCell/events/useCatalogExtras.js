import { useEffect, useState } from "react";
import axios from "axios";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";

const cache = new Map();

/**
 * arm_events.json and junctions_table.json of each patient (optional exports; null when the file is not there).
 * Loaded only while the catalog is open. Returns { [caseReportId]: { armEvents, junctions } } for the patients loaded so far.
 */
export default function useCatalogExtras(summaries, datasets) {
  const [extras, setExtras] = useState({});
  const key = summaries.map((s) => `${s.record.datasetId}/${s.caseReportId}`).join("|");
  useEffect(() => {
    let active = true;
    const source = axios.CancelToken.source();
    setExtras({});
    (async () => {
      const out = {};
      for (let k = 0; k < summaries.length; k += 3) {
        const batch = summaries.slice(k, k + 3);
        await Promise.all(
          batch.map(async (s) => {
            const dataset = datasets.find((d) => `${d.id}` === `${s.record.datasetId}`);
            if (!dataset) return;
            const ck = `${dataset.id}/${s.caseReportId}`;
            if (!cache.has(ck)) {
              const get = (f) => tryGet(casePath(dataset, s.caseReportId, f), { cancelToken: source.token }).then((r) => (r.status === "ok" ? r.data : null)).catch(() => null);
              const [armEvents, junctions] = await Promise.all([get("arm_events.json"), get("junctions_table.json")]);
              if (!active) return;
              cache.set(ck, { armEvents, junctions });
            }
            out[s.caseReportId] = cache.get(ck);
          })
        );
        if (!active) return;
        setExtras({ ...out });
      }
    })().catch(() => {});
    return () => {
      active = false;
      source.cancel("catalog closed");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, datasets]);
  return extras;
}
