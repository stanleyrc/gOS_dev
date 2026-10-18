import { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import singleCellActions from "../../../redux/singleCell/actions";
import useTreeView from "../useTreeView";
import { pcFile } from "../evidence/notComputed";
import { rankFindings } from "../../../helpers/singleCell/siteEvidence";
import { matchRnaFusions } from "../../../helpers/singleCell/rnaFusions";
import { parseCancerGeneList } from "../../../helpers/singleCell/geneInfo";
import { rowMap } from "../../../helpers/singleCell/matrix";
import usePatientTsg from "./usePatientTsg";
import useClinicalEvents, { useMergedEvents } from "./useClinicalEvents";
import { entryHitCount, groupMultiHitEntries } from "../../../helpers/singleCell/tsgHits";
import { DEFAULT_SELECTION, buildDriverEntries, collapseColumns, entryFits, entryStates, entryVafs, recommendedOrder, selectDrivers } from "../../../helpers/singleCell/driverLayer";

const isNormalClone = (clone) => /^normal$/i.test(`${clone || ""}`);

// COSMIC Cancer Gene Census flags come with OncoKB's gene list (fetched once; null while unavailable)
let cgcPromise = null;
const loadCgc = () => {
  if (!cgcPromise) {
    cgcPromise = fetch("https://www.oncokb.org/api/v1/utils/cancerGeneList.txt")
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${r.status}`))))
      .then((text) => new Set([...parseCancerGeneList(text)].filter(([, v]) => v.cgc).map(([g]) => g)))
      .catch(() => null);
  }
  return cgcPromise;
};

/** COSMIC CGC gene symbols, or null when the list could not be loaded. */
export function useCgcGenes() {
  const [genes, setGenes] = useState(null);
  useEffect(() => {
    let live = true;
    loadCgc().then((g) => live && setGenes(g));
    return () => {
      live = false;
    };
  }, []);
  return genes;
}

/**
 * The Drivers layer's data, shared by the Single-Cell heatmap, the driver
 * drawer and the Report tab's clonal history: every driver entry of the
 * patient, the user's selection (redux layout.drivers, also in the URL) and
 * the entries it shows.
 */
export default function useDriverLayer() {
  const dispatch = useDispatch();
  const events = useMergedEvents(); // filtered events + clinical-assay findings (Clinical findings switch)
  const clinical = useClinicalEvents();
  const { cells, snv, cn, rnaFusions, precompute, layout } = useSelector((s) => s.SingleCell);
  const chromoBins = useSelector((s) => s.Settings.chromoBins);
  const { order, treeLayout } = useTreeView();
  const cgc = useCgcGenes();
  const tumorIds = useMemo(() => {
    const normal = new Set(cells.filter((c) => isNormalClone(c.clone_id)).map((c) => `${c.cell_id}`));
    return order.filter((id) => !normal.has(`${id}`));
  }, [cells, order]);
  const calls = pcFile(precompute, "calls");
  const evidence = pcFile(precompute, "siteEvidence");
  const cloneOf = useMemo(() => new Map(cells.map((c) => [`${c.cell_id}`, c.clone_id ?? "unassigned"])), [cells]);
  const sites = useMemo(() => {
    if (!calls.ok) return { hotspots: null, verdicts: null, ids: new Map() };
    const ranked = rankFindings(calls.data, evidence.data, cloneOf);
    const hotspots = new Set();
    const verdicts = new Map();
    const ids = new Map();
    ranked.all.forEach((f) => {
      const key = `${`${f.chrom}`.replace(/^chr/i, "")}:${Number(f.pos)}`;
      if (f.hotspot || f.configured) hotspots.add(key);
      verdicts.set(key, f.verdict?.level);
      ids.set(key, f.id);
    });
    return { hotspots, verdicts, ids };
  }, [calls.ok, calls.data, evidence.data, cloneOf]);
  const rnaFusionCells = useMemo(() => {
    if (rnaFusions?.status !== "ok") return null;
    const list = rnaFusions.data.fusions || [];
    return (event) => {
      const out = new Set();
      matchRnaFusions(event, list).forEach((f) => (f.cells || []).forEach((c) => c.cell_id && out.add(`${c.cell_id}`)));
      return out;
    };
  }, [rnaFusions]);
  const snvData = snv?.status === "ok" ? snv.data : null;
  const entries = useMemo(
    () => buildDriverEntries(events || [], { tumorIds, hotspots: sites.hotspots, verdicts: sites.verdicts, cgc, rnaFusionCells, snv: snvData }),
    [events, tumorIds, sites, cgc, rnaFusionCells, snvData]
  );
  // not-recovered clinical findings are not hits; germline-like ones go in as germline hits (twoHit.js never counts them as somatic)
  const somaticEntries = useMemo(() => entries.filter((d) => d.somatic || d.germline), [entries]);
  const tsg = usePatientTsg(somaticEntries, tumorIds);
  const selection = layout.drivers || DEFAULT_SELECTION;
  const fits = useMemo(() => entryFits(entries, treeLayout), [entries, treeLayout]);
  const shown = useMemo(() => {
    const list = selectDrivers(entries, selection, fits);
    const ordered = selection.preset === "recommended" ? recommendedOrder(list) : list;
    return groupMultiHitEntries(ordered, tsg.calls); // the entries of a tumour suppressor with 2+ hits sit together
  }, [entries, selection, fits, tsg.calls]);
  // per-cell states and display columns (redundant CN events collapsed)
  const display = useMemo(() => {
    const ctx = { order, snv: snvData, snvRows: snvData ? rowMap(order, snvData.cells) : null, cn: cn.status === "ok" ? cn.data : null, cnRows: cn.status === "ok" ? rowMap(order, cn.data.cells) : null, chromoBins, twoHit: tsg.secondHits };
    const out = collapseColumns(shown, shown.map((d) => entryStates(d, ctx)));
    out.columns.forEach((c) => {
      const n = entryHitCount(c.entry, tsg.calls);
      if (n >= 2) c.label = `${c.label} ×${n}`; // flag: this gene has n hits (see the Two hits row / drawer)
    });
    out.columns.forEach((c) => (c.vafs = entryVafs(c.entry, ctx))); // per-cell VAF of tree-site SNVs (null = call colours only)
    return out;
  }, [shown, order, snvData, cn, chromoBins, tsg.secondHits, tsg.calls]);
  const setSelection = useCallback((next) => dispatch(singleCellActions.updateLayout({ drivers: next })), [dispatch]);
  return { tsg, entries, shown, fits, columns: display.columns, collapsed: display.collapsed, selection, setSelection, tumorIds, order, treeLayout, hasClinical: clinical.status === "ok", clinicalCounts: clinical.data, hasCgc: cgc != null, hasRna: rnaFusionCells != null, siteIds: sites.ids };
}
