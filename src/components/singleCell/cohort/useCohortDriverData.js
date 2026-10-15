import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";
import { PRECOMPUTE_FILES } from "../../../helpers/singleCell/precompute";
import { cellsForPatient, snvFromSparse } from "../../../helpers/singleCell/cellFiles";
import { rankFindings } from "../../../helpers/singleCell/siteEvidence";
import { matchRnaFusions } from "../../../helpers/singleCell/rnaFusions";
import { rowMap } from "../../../helpers/singleCell/matrix";
import { buildDriverEntries, entryStates } from "../../../helpers/singleCell/driverLayer";
import { attachCalls, secondHitMap } from "../../../helpers/singleCell/twoHit";
import { eventSnvColumns, slimSnv } from "../../../helpers/singleCell/cohortDriverTrees";
import { useCgcGenes } from "../drivers/useDriverLayer";

// Per-patient inputs of the Drivers layer that the cohort view does not load for its other panels:
// snv_matrix.json (per-cell genotype at the driver SNV sites) and the site-evidence precompute (hotspots, QC verdicts).
// Loaded lazily, one patient at a time, and reduced to the driver SNV columns so nine patients stay light.
const baseCache = new Map();
const PENDING = { snv: null, sites: { hotspots: null, verdicts: null }, notes: {}, pending: true };
const keyOf = (s) => `${s.record.datasetId}/${s.caseReportId}`;
// HEAD sizes of snv_matrix.json, cached
const sizeCache = new Map();

const isNormal = (clone) => /^normal$/i.test(`${clone || ""}`);

async function loadBase(dataset, summary, file, cloneOf, chromoBins, cancelToken) {
  const key = `${dataset.id}/${summary.caseReportId}`;
  if (baseCache.has(key)) return baseCache.get(key);
  const get = (name) => tryGet(casePath(dataset, summary.caseReportId, name), { cancelToken });
  const [snvFile, callsFile, evidenceFile] = await Promise.all([get("snv_matrix.json"), get(PRECOMPUTE_FILES.calls), get(PRECOMPUTE_FILES.siteEvidence)]);
  const notes = {};
  let snv = null;
  if (snvFile.status === "ok") {
    try {
      const full = snvFromSparse(snvFile.data, file.tree.leaves, chromoBins);
      const cols = eventSnvColumns(buildDriverEntries(file.events || [], { snv: full }));
      snv = slimSnv(full, cols);
    } catch (error) {
      notes.snv = `snv_matrix.json could not be read (${error.message})`;
    }
  } else notes.snv = snvFile.status === "missing" ? "snv_matrix.json not exported for this patient" : "snv_matrix.json could not be loaded";
  let sites = { hotspots: null, verdicts: null };
  if (callsFile.status === "ok") {
    try {
      const ranked = rankFindings(callsFile.data, evidenceFile.status === "ok" ? evidenceFile.data : null, cloneOf);
      const hotspots = new Set();
      const verdicts = new Map();
      ranked.all.forEach((f) => {
        const k = `${`${f.chrom}`.replace(/^chr/i, "")}:${Number(f.pos)}`;
        if (f.hotspot || f.configured) hotspots.add(k);
        verdicts.set(k, f.verdict?.level);
      });
      sites = { hotspots, verdicts };
    } catch (error) {
      notes.sites = "site evidence could not be read";
    }
  } else notes.sites = "precompute/region_calls.json not computed (no site-evidence QC or hotspot flags)";
  const out = { snv, sites, notes };
  baseCache.set(key, out);
  return out;
}

/**
 * Drivers-layer data of every cohort patient, from the same helpers the patient layer uses
 * (buildDriverEntries, entryStates). Returns { data: { patientId: { order, tree, leafClones, entries, states, notes } },
 * loaded, total }. Patients still loading are absent from `data`.
 * @param rawFiles cohort files before the clade filter (every driver SNV column is kept), files: after it
 * @param rows cohort CN rows { patientId: { cellRows: [{ cellId, clone, row }] } }
 */
export default function useCohortDriverData({ summaries, datasets, files, rawFiles, rows, datafiles, chromoBins, enabled = true, loadSnv = false, tsgCalls = null }) {
  const [base, setBase] = useState({});
  const started = useRef(new Set());
  const cgc = useCgcGenes();
  const cloneInfo = useMemo(() => {
    const out = {};
    summaries.forEach((s) => {
      const cells = cellsForPatient(datafiles.filter((r) => `${r.datasetId}` === `${s.record.datasetId}`), s.patientKey);
      out[s.caseReportId] = new Map(cells.map((c) => [`${c.cell_id}`, c.clone_id]));
    });
    return out;
  }, [summaries, datafiles]);
  const summariesKey = summaries.map((s) => `${s.record.datasetId}/${s.caseReportId}`).join("|");
  useEffect(() => {
    started.current = new Set();
    setBase({});
  }, [summariesKey]);
  const ready = summaries.filter((s) => rawFiles[s.caseReportId]?.tree && rawFiles[s.caseReportId]?.events).map((s) => s.caseReportId).join("|");
  useEffect(() => {
    if (!enabled || !loadSnv) return undefined;
    let active = true;
    const source = axios.CancelToken.source();
    (async () => {
      for (const s of summaries) {
        const id = s.caseReportId;
        const file = rawFiles[id];
        if (!file?.tree || !file?.events || started.current.has(`${summariesKey}/${id}`)) continue;
        started.current.add(`${summariesKey}/${id}`);
        const dataset = datasets.find((d) => `${d.id}` === `${s.record.datasetId}`);
        if (!dataset) continue;
        let result;
        try {
          result = await loadBase(dataset, s, file, cloneInfo[id], chromoBins, source.token);
        } catch (error) {
          result = { snv: null, sites: { hotspots: null, verdicts: null }, notes: { snv: `could not be loaded (${error.message})` } };
        }
        if (!active) return;
        setBase((b) => ({ ...b, [id]: result }));
      }
    })().catch(() => {});
    return () => {
      active = false;
      source.cancel("cohort drivers view closed");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, loadSnv, ready, datasets, summariesKey, chromoBins]);

  const cache = useRef(new Map());
  const data = useMemo(() => {
    const out = {};
    summaries.forEach((s) => {
      const id = s.caseReportId;
      const f = files[id];
      const b = base[id] || baseCache.get(keyOf(s)) || PENDING;
      if (!f?.tree || !f?.events) return;
      const entry = rows[id];
      const hit = cache.current.get(id);
      const calls = tsgCalls?.[id] || null;
      if (hit && hit.b === b && hit.f === f && hit.entry === entry && hit.cgc === cgc && hit.bins === chromoBins && hit.calls === calls) {
        out[id] = hit.value;
        return;
      }
      const order = f.tree.leaves.map(String);
      const clones = cloneInfo[id] || new Map();
      const leafClones = order.map((c) => clones.get(c) ?? null);
      const tumorIds = order.filter((c) => !isNormal(clones.get(c)));
      const rnaList = f.rnaFusions;
      const rnaFusionCells = rnaList
        ? (event) => {
            const set = new Set();
            matchRnaFusions(event, rnaList).forEach((x) => (x.cells || []).forEach((c) => c.cell_id && set.add(`${c.cell_id}`)));
            return set;
          }
        : null;
      const entries = buildDriverEntries(f.events, { tumorIds, hotspots: b.sites.hotspots, verdicts: b.sites.verdicts, cgc, rnaFusionCells, snv: b.snv });
      const cellRows = entry?.cellRows || [];
      const cn = cellRows.length ? { cells: cellRows.map((c) => c.cellId), rows: cellRows.map((c) => c.row) } : null;
      if (calls) attachCalls(entries, calls);
      const ctx = { order, snv: b.snv, snvRows: b.snv ? rowMap(order, b.snv.cells) : null, cn, cnRows: cn ? rowMap(order, cn.cells) : null, chromoBins, twoHit: calls ? secondHitMap(calls) : null };
      const states = new Map(entries.map((d) => [d.key, entryStates(d, ctx)]));
      const notes = { ...b.notes };
      if (!entry) notes.cn = "per-cell copy number is still loading";
      else if (!cn) notes.cn = "no per-cell complex.json could be read";
      if (!rnaList) notes.rna = "rna/fusions.json not exported (fusion rows show DNA support only)";
      const value = { snvPending: Boolean(b.pending), order, tree: f.tree, leafClones, entries, states, notes, nCn: cellRows.length, cnTruncated: Boolean(entry?.truncated) };
      cache.current.set(id, { b, f, entry, cgc, bins: chromoBins, calls, value });
      out[id] = value;
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaries, files, base, rows, cgc, cloneInfo, chromoBins, tsgCalls]);
  const [sizes, setSizes] = useState(null); // { bytes, known, total } of the snv_matrix.json files not yet loaded
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    (async () => {
      let bytes = 0;
      let known = 0;
      for (const s of summaries) {
        const dataset = datasets.find((d) => `${d.id}` === `${s.record.datasetId}`);
        if (!dataset || baseCache.has(keyOf(s))) continue;
        const url = casePath(dataset, s.caseReportId, "snv_matrix.json");
        if (!sizeCache.has(url)) sizeCache.set(url, axios.head(url).then((r) => Number(r.headers["content-length"]) || null).catch(() => null));
        const n = await sizeCache.get(url);
        if (n) {
          bytes += n;
          known += 1;
        }
      }
      if (live) setSizes({ bytes, known });
    })();
    return () => {
      live = false;
    };
  }, [enabled, summariesKey, datasets]);
  const total = summaries.length;
  const loaded = summaries.filter((s) => base[s.caseReportId] || baseCache.has(keyOf(s))).length;
  return { data, loaded, total, sizes, hasCgc: cgc != null };
}
