import { useEffect, useMemo, useState } from "react";
import { tryGet } from "../../../redux/singleCell/loaders";
import { loadPatientSplicing } from "./cohortSpliceEvent";
import { cellKey } from "../../../helpers/singleCell/cohortGroups";

const cellsCache = new Map();
const indexCache = new Map();

/** data/_cohort/rna/cells.json (state, clone, UMAP per cell) of a dataset, fetched once: { status, data }. */
export function loadCohortCells(dataset) {
  const key = dataset.dataPath;
  if (!cellsCache.has(key)) cellsCache.set(key, tryGet(`${dataset.dataPath}_cohort/rna/cells.json`).catch(() => ({ status: "missing" })));
  return cellsCache.get(key);
}

/** Map cluster id -> { junctions, cells } of one patient's rna/splicing.json (cached), or null when the file is missing. */
function loadPatientClusters(dataset, patient) {
  const key = `${dataset.dataPath}${patient}`;
  if (!indexCache.has(key)) {
    indexCache.set(
      key,
      loadPatientSplicing(dataset, patient)
        .then((r) => (r?.status === "ok" ? new Map((r.data.clusters || []).map((c) => [c.id, { junctions: c.junctions || [], cells: c.cells || null }])) : null))
        .catch(() => null)
    );
  }
  return indexCache.get(key);
}

const sameJunctions = (a, b) => a.length === b.length && a.every((j, i) => Number(j.start) === Number(b[i].start) && Number(j.end) === Number(b[i].end));

/**
 * Per-patient cell usage of every cluster plus the cohort cell table. Loads each patient's rna/splicing.json once
 * (also used by the event violins) and cohort rna/cells.json.
 * @returns { ready, clusterOf(patient, cohortCluster) -> { cells }|null, metaOf(patient, rnaId), cells }
 */
export default function useCohortSpliceData(dataset, patients) {
  const [state, setState] = useState({ ready: false, files: {}, cells: [] });
  useEffect(() => {
    let active = true;
    if (!dataset?.dataPath) return undefined;
    setState({ ready: false, files: {}, cells: [] });
    (async () => {
      const [cells, ...maps] = await Promise.all([loadCohortCells(dataset), ...patients.map((p) => loadPatientClusters(dataset, p))]);
      if (active) setState({ ready: true, files: Object.fromEntries(patients.map((p, i) => [p, maps[i]])), cells: cells?.status === "ok" ? cells.data.cells || [] : [] });
    })();
    return () => {
      active = false;
    };
  }, [dataset, patients]);
  const index = useMemo(() => new Map(state.cells.map((c) => [cellKey(c.patient, c.rna_id), c])), [state.cells]);
  return useMemo(
    () => ({
      ready: state.ready,
      cells: state.cells,
      cellByKey: index,
      /** null when the patient's cluster is not exported, or its junctions differ from the cohort cluster */
      clusterOf: (patient, cluster) => {
        const m = state.files[patient];
        const c = m?.get(cluster.id);
        return c && c.cells && sameJunctions(c.junctions, cluster.junctions || []) ? c : null;
      },
      metaOf: (patient, id) => {
        const c = index.get(cellKey(patient, id));
        return c ? { state: c.state ?? null, clone: c.Clone_Annotation ?? null, cell: c } : null;
      },
    }),
    [state, index]
  );
}
