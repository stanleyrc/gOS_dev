import { useEffect, useState } from "react";
import axios from "axios";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";
import { layoutTree, parseNewick } from "../../../helpers/singleCell/newick";
import { packSnvCells } from "../../../helpers/singleCell/figures";
import { normalizeFusions } from "../../../helpers/singleCell/rnaFusions";

// Patient-level files of every single-cell patient, for the cohort views:
// SNV sites (with tree categories), SBS signature fits and filtered events.
// The per-cell SNV reads (snvCells) are 90% of snv_matrix.json (up to 385 MB), so they load on demand
// (Figures view, event drawer): the sites come from the small snv_variants.json when the data folder
// has it (gos_sc_web_assets.py), else from the full matrix as before.
const cache = new Map();
const snvCellsCache = new Map();

/** Per-cell SNV reads of one patient, packed (null when the matrix is not available), fetched once. */
export function loadSnvCells(dataset, summary, cancelToken) {
  const key = `${dataset.id}/${summary.caseReportId}`;
  if (!snvCellsCache.has(key)) {
    const promise = tryGet(casePath(dataset, summary.caseReportId, "snv_matrix.json"), { cancelToken }).then((snv) =>
      snv.status === "ok" && snv.data?.cells ? packSnvCells(snv.data.cells) : null
    );
    promise.catch(() => snvCellsCache.delete(key));
    snvCellsCache.set(key, promise);
  }
  return snvCellsCache.get(key);
}

async function loadPatient(dataset, summary, cancelToken) {
  const key = `${dataset.id}/${summary.caseReportId}`;
  if (cache.has(key)) return cache.get(key);
  const get = (file) => tryGet(casePath(dataset, summary.caseReportId, file), { cancelToken });
  const [slim, signatures, events, tree, walks, rnaFusions] = await Promise.all([
    get("snv_variants.json"),
    get("signatures.json"),
    get("filtered.events.json"),
    tryGet(casePath(dataset, summary.caseReportId, "tree.nwk"), { cancelToken, responseType: "text" }),
    // ecDNA / amplicon walks with per-cell copies (skilift sc_export_walks), optional
    get("walks.json"),
    // RNA fusion calls (optional): DNA / RNA support of fusion events
    get("rna/fusions.json"),
  ]);
  // no slim file: the full matrix gives the sites and the packed reads together
  const snv = slim.status === "ok" ? slim : await get("snv_matrix.json");
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
    // per-cell reads at the sites, packed (Figures tab SNV panel)
    snvCells: slim.status !== "ok" && snv.status === "ok" && snv.data?.cells ? packSnvCells(snv.data.cells) : null,
    snvCellsLoaded: slim.status !== "ok",
    signatures: signatures.status === "ok" ? signatures.data : null,
    events: events.status === "ok" ? (Array.isArray(events.data) ? events.data : []) : null,
    tree: treeLayout,
    walks: walks.status === "ok" ? walks.data : null,
    rnaFusions: (() => {
      if (rnaFusions.status !== "ok") return null;
      try {
        return normalizeFusions(rnaFusions.data).fusions;
      } catch (error) {
        return null;
      }
    })(),
  };
  cache.set(key, out);
  return out;
}

/** { files: { caseReportId: { variants, signatures, events } }, progress } */
export default function useCohortFiles(summaries, datasets, snvCellsFor = []) {
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
  // per-cell SNV reads for the patients that need them now (Figures: all, event drawer: one)
  const wanted = (snvCellsFor || []).join("|");
  useEffect(() => {
    if (!wanted) return undefined;
    let active = true;
    const source = axios.CancelToken.source();
    (async () => {
      for (const id of wanted.split("|")) {
        const summary = summaries.find((s) => s.caseReportId === id);
        const dataset = summary && datasets.find((d) => `${d.id}` === `${summary.record.datasetId}`);
        const base = summary && cache.get(`${dataset?.id}/${id}`);
        if (!dataset || !base || base.snvCellsLoaded || base.snvCells) continue;
        let packed = null;
        try {
          packed = await loadSnvCells(dataset, summary, source.token);
        } catch (error) {
          packed = null;
        }
        if (!active) return;
        base.snvCells = packed;
        base.snvCellsLoaded = true;
        setFiles((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], snvCells: packed, snvCellsLoaded: true } } : prev));
      }
    })().catch(() => {});
    return () => {
      active = false;
      source.cancel("snv cells no longer needed");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, progress >= 100]);
  return { files, progress };
}
