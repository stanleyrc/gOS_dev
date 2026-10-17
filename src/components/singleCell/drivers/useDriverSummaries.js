import { useMemo } from "react";
import { useMergedEvents } from "./useClinicalEvents";
import { useSelector } from "react-redux";
import useTreeView from "../useTreeView";
import useDriverEvidence from "./useDriverEvidence";
import { GENE_SETS, geneSetScores } from "../../../helpers/singleCell/geneSets";
import { geneValues } from "../../../helpers/singleCell/staticRna";
import { eventGlobalPosition } from "../../../helpers/singleCell/eventDomains";
import { balanceTable, chimericSupport, cnContrast, plateOf, subclonalDrivers } from "../../../helpers/singleCell/driverContrast";
import { LANDMARK_GENES, alterationKind, bundleDrivers, describeCnRegions, driverPriority, KEY_FIT, inCancerGene, isKnownDriver, keyFindingsFirst, linkedSpliceFindings, rankCandidates, summarizeDriver } from "../../../helpers/singleCell/driverSummary";

const STEP = 1e6;
const isNormalClone = (clone) => /^normal$/i.test(`${clone || ""}`);

/** Tumor cell ids in tree order (normals dropped). */
export function useTumorIds() {
  const cells = useSelector((s) => s.SingleCell.cells);
  const { treeLayout } = useTreeView();
  return useMemo(() => {
    const normal = new Set(cells.filter((c) => isNormalClone(c.clone_id)).map((c) => `${c.cell_id}`));
    const ids = treeLayout?.leaves?.length ? treeLayout.leaves.map(String) : cells.map((c) => `${c.cell_id}`);
    return ids.filter((id) => !normal.has(id));
  }, [cells, treeLayout]);
}

/** Per-cell program scores (built-in GBM state, cycle, hypoxia, interferon sets) over the RNA rows. */
export function useProgramScores(rna) {
  const { summary, matrix } = rna || {};
  return useMemo(() => {
    if (!summary || !matrix) return [];
    const n = summary.cells.length;
    const valuesOf = (g) => {
      const gi = summary.geneIndex?.get(g);
      return gi == null ? null : geneValues(matrix, n, gi);
    };
    return Object.entries(GENE_SETS)
      .map(([name, genes]) => ({ name, ...geneSetScores(genes, n, valuesOf) }))
      .filter((p) => p.used.length >= 5);
  }, [summary, matrix]);
}

/**
 * Ranked, plain-language summaries of the open patient's subclonal drivers:
 * drivers carried by the same cells are bundled (lead + co-travellers), each
 * lead compared with every other tumor cell for its own expression, program
 * scores, cell state, copy number, chimeric RNA reads and linked splicing.
 * Only the first `limit` bundles (of the known ones with knownOnly) get the (CN / expression) effects; the rest
 * carry identity, cells and evidence only.
 * @param rna useRnaData() of the caller (avoids loading the matrix twice)
 * @returns { bundles, summaries: [summary], tumorIds, loading }
 */
export default function useDriverSummaries(rna, { limit = 8, knownOnly = false } = {}) {
  const events = useMergedEvents();
  const cn = useSelector((s) => s.SingleCell.cn);
  const splicing = useSelector((s) => s.SingleCell.rnaSplicing);
  const { chromoBins, genomeLength } = useSelector((s) => s.Settings);
  const { treeLayout } = useTreeView();
  const tumorIds = useTumorIds();
  const evidence = useDriverEvidence();
  const programs = useProgramScores(rna);

  const bundles = useMemo(() => {
    const drivers = subclonalDrivers(events || [], tumorIds, treeLayout);
    drivers.forEach((d) => (d.priority = driverPriority(d)));
    return keyFindingsFirst(rankCandidates(bundleDrivers(drivers)));
  }, [events, tumorIds, treeLayout]);

  const cnData = cn?.status === "ok" ? cn.data : null;
  const positions = useMemo(() => {
    const out = [];
    for (let g = STEP / 2; g < (genomeLength || 0); g += STEP) out.push(g);
    return out;
  }, [genomeLength]);
  // genes that name a copy-number region: amplified / deleted genes of the patient, and curated cancer / GBM genes
  const genesState = useSelector((s) => s.Genes);
  const scna = useMemo(() => {
    const out = (events || [])
      .filter((e) => ["amp", "homdel"].includes(alterationKind(e)))
      .map((e) => ({ gene: `${e.gene}`, global: eventGlobalPosition(e, chromoBins) }))
      .filter((s) => Number.isFinite(s.global));
    const { optionsList = [], genesStartPoint = [], genesEndPoint = [] } = genesState || {};
    optionsList.forEach((o) => {
      if (!LANDMARK_GENES.has(`${o.label}`)) return;
      const mid = (Number(genesStartPoint[o.value]) + Number(genesEndPoint[o.value])) / 2;
      if (Number.isFinite(mid)) out.push({ gene: `${o.label}`, global: mid });
    });
    return out;
  }, [events, chromoBins, genesState]);

  const { summary, matrix, rowOfId } = rna || {};
  const summaries = useMemo(() => {
    const tumorSet = new Set(tumorIds);
    const cellOf = new Map((summary?.cells || []).map((c, k) => [k, c]));
    const rows = (ids) => ids.map((id) => rowOfId?.get(id)).filter((r) => r != null);
    const geneCache = new Map();
    const expr =
      summary && matrix
        ? (gene, ids) => {
            const gi = summary.geneIndex?.get(gene) ?? summary.geneIndex?.get(`${gene}`.toUpperCase());
            if (gi == null) return null;
            if (!geneCache.has(gi)) geneCache.set(gi, geneValues(matrix, summary.cells.length, gi));
            const v = geneCache.get(gi);
            return rows(ids).map((r) => v[r]);
          }
        : null;
    const programScores = programs.map((p) => ({ name: p.name, of: (ids) => rows(ids).map((r) => p.scores[r]) }));
    const stateField = (summary?.fields || []).some((f) => f.name === "state") ? "state" : null;
    const stateOf = stateField
      ? (a, b) => balanceTable(rows(a), rows(b), [stateField], (r) => cellOf.get(r)?.[stateField] ?? null)[0]?.levels || null
      : null;
    const findings = splicing?.status === "ok" ? splicing.data.findings || [] : [];
    // effects for every key finding (one branch, cancer gene) plus the first `limit` candidates
    const isKey = (b) => (b.lead.fit?.score ?? 0) >= KEY_FIT && inCancerGene(b.lead);
    const detailed = new Set([
      ...bundles.filter(isKey).map((b) => b.key),
      ...bundles.filter((b) => !knownOnly || isKnownDriver(b.lead)).slice(0, limit).map((b) => b.key),
    ]);
    return bundles.map((bundle) => {
      const carriers = bundle.lead.carriers;
      const carrierSet = new Set(carriers);
      const nonCarriers = tumorIds.filter((id) => !carrierSet.has(id));
      const full = detailed.has(bundle.key);
      const label = bundle.lead.event.fusion_genes;
      const entry = full && label ? evidence.data?.fusions?.find((f) => f.label === label) : null;
      const sup = entry ? chimericSupport(entry, carriers, nonCarriers).a : null;
      const withRna = (ids) => ids.filter((id) => rowOfId?.has(id));
      return summarizeDriver(bundle, {
        total: tumorSet.size,
        nonCarriers,
        expr: full ? expr : null,
        programScores: full && programScores.length ? programScores : null,
        stateOf: full ? stateOf : null,
        cnRegions: full && cnData && positions.length ? describeCnRegions(cnContrast(cnData, carriers, nonCarriers, positions).regions, chromoBins, scna, { step: STEP }) : [],
        chimeric: sup ? { withRna: sup.withRna, chimericCells: sup.cells, reads: sup.reads, discarded: sup.discarded } : null,
        spliceLinks: full ? linkedSpliceFindings(findings, withRna(carriers), withRna(nonCarriers)) : [],
        plateRow: balanceTable(carriers, nonCarriers, ["plate"], (id) => plateOf(id))[0],
      });
    });
  }, [bundles, tumorIds, summary, matrix, rowOfId, programs, splicing, evidence, cnData, positions, chromoBins, scna, limit, knownOnly]);

  return { bundles, summaries, tumorIds, programs, loading: Boolean(rna?.summary && !rna?.matrix) || cn?.status === "loading" };
}
