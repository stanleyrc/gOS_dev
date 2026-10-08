import { useEffect, useState } from "react";
import axios from "axios";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";
import { layoutTree, parseNewick } from "../../../helpers/singleCell/newick";

// Patient-level files of every single-cell patient, for the cohort views:
// SNV sites (with tree categories), SBS signature fits and filtered events.
const cache = new Map();

async function loadPatient(dataset, summary, cancelToken) {
  const key = `${dataset.id}/${summary.caseReportId}`;
  if (cache.has(key)) return cache.get(key);
  const get = (file) => tryGet(casePath(dataset, summary.caseReportId, file), { cancelToken });
  const [snv, signatures, events, tree] = await Promise.all([
    get("snv_matrix.json"),
    get("signatures.json"),
    get("filtered.events.json"),
    tryGet(casePath(dataset, summary.caseReportId, "tree.nwk"), { cancelToken, responseType: "text" }),
  ]);
  let treeLayout = null;
  if (tree.status === "ok") {
    try {
      treeLayout = layoutTree(parseNewick(tree.data));
    } catch (error) {
      treeLayout = null;
    }
  }
  const out = {
    variants: snv.status === "ok" ? snv.data?.variants || [] : null,
    signatures: signatures.status === "ok" ? signatures.data : null,
    events: events.status === "ok" ? (Array.isArray(events.data) ? events.data : []) : null,
    tree: treeLayout,
  };
  cache.set(key, out);
  return out;
}

/** { files: { caseReportId: { variants, signatures, events } }, progress } */
export default function useCohortFiles(summaries, datasets) {
  const [files, setFiles] = useState({});
  const [progress, setProgress] = useState(0);
  const summariesKey = summaries.map((s) => `${s.record.datasetId}/${s.caseReportId}`).join("|");
  useEffect(() => {
    let active = true;
    const source = axios.CancelToken.source();
    setFiles({});
    setProgress(summaries.length ? 0 : 100);
    (async () => {
      const out = {};
      for (let k = 0; k < summaries.length; k += 4) {
        const batch = summaries.slice(k, k + 4);
        const results = await Promise.all(
          batch.map(async (s) => {
            const dataset = datasets.find((d) => `${d.id}` === `${s.record.datasetId}`);
            if (!dataset) return [s.caseReportId, null];
            try {
              return [s.caseReportId, await loadPatient(dataset, s, source.token)];
            } catch (error) {
              return [s.caseReportId, null];
            }
          })
        );
        if (!active) return;
        results.forEach(([id, value]) => (out[id] = value));
        setFiles({ ...out });
        setProgress(Math.round((100 * Math.min(summaries.length, k + batch.length)) / Math.max(1, summaries.length)));
      }
    })().catch(() => {});
    return () => {
      active = false;
      source.cancel("cohort view closed");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summariesKey, datasets]);
  return { files, progress };
}
