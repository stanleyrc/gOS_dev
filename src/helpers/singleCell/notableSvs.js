// d3-free: "notable structural variants" = complex-SV families (classifier families, not validated SVs); ecDNA families first,
// then rDelDup / rDel / rDup / TIC / chromoplexy / BFB / chromothripsis / rigma / tyfonas by cell fraction.
import { cladeFitScore } from "./cladeFit";
import { placementOf } from "./complexTiming";
import { complexChromosomes, dmOverlap } from "./complexLabels";
import { classificationText, familyClassifications } from "./complexFamilies";
import { parseFootprint } from "./complexZoom";
import { GBM_GENES } from "./geneInfo";
import { genesInside } from "./geneSpans";

export const NOTABLE_KINDS = /^(dm|cpxdm|rdeldup|rdel|rdup|tic|chromoplexy|bfb|chromothripsis|rigma|tyfonas)$/i;
export const isEcdnaKind = (k) => /^(dm|cpxdm)$/i.test(`${k || ""}`);

/** Genes (protein-coding by default) overlapping the footprint: driver genes first, then by citation importance. */
export function genesInFootprint(genesList = [], location, { max = 8, driverSet = GBM_GENES, codingOnly = true } = {}) {
  const fp = parseFootprint(location);
  if (!fp.length || !genesList.length) return { genes: [], total: 0 };
  const seen = new Set();
  const hits = genesList.filter((g) => {
    if (codingOnly && g.bioType && g.bioType !== "protein-coding") return false;
    if (!g.title || seen.has(g.title)) return false;
    const hit = fp.some((f) => `${g.chromosome}` === f.chromosome && g.startPoint <= f.end && g.endPoint >= f.start);
    if (hit) seen.add(g.title);
    return hit;
  });
  hits.sort((a, b) => Boolean(driverSet[b.title]) - Boolean(driverSet[a.title]) || (Number(b.importance) || 0) - (Number(a.importance) || 0) || a.title.localeCompare(b.title));
  return { genes: hits.slice(0, max).map((g) => g.title), total: hits.length, drivers: hits.filter((g) => driverSet[g.title]).length };
}

const kindOf = (entry) => `${entry.family?.dominant?.vartype || entry.event?.vartype || ""}`;

/**
 * Notable SV rows from driver entries (buildDriverEntries / cohortEntries output).
 * opts: geneSpans (parseGeneSpans output; preferred, whole GENCODE) or null, genesList (gOS gene track, fallback) or null, tumorN, treeLayout (adds clade placement), driverSet.
 * Row: { key, entry, label, chromosomes, members: text, n, fraction, placement, f1, cladeSize, genes, nGenes, ecdna: { family, label } | null }.
 */
export function notableSvs(entries = [], { genesList = null, geneSpans = null, treeLayout = null, tumorN = 0, driverSet = GBM_GENES } = {}) {
  const dmEntries = entries.filter((d) => d.cls === "complex");
  return entries
    .filter((d) => d.cls === "complex" && NOTABLE_KINDS.test(kindOf(d)) && d.n > 0)
    .map((d) => {
      const location = d.family?.dominant?.Genome_Location || d.event?.Genome_Location;
      const fit = treeLayout ? cladeFitScore(d.carriers || [], treeLayout) : null;
      const okFit = fit && Number.isFinite(fit.score) ? fit : null;
      const g = geneSpans ? genesInside(geneSpans, location, { driverSet }) : genesList ? genesInFootprint(genesList, location, { driverSet }) : null;
      const dm = dmOverlap(d, dmEntries);
      const members = d.family ? d.family.classifications : familyClassifications([d.event]);
      return {
        key: d.key,
        entry: d,
        label: d.label,
        isEcdna: isEcdnaKind(kindOf(d)),
        chromosomes: complexChromosomes(d.family?.footprint || location).map((c) => `chr${c}`),
        members: classificationText(members),
        n: d.n,
        fraction: d.fraction,
        placement: tumorN || d.fraction ? placementOf(d.n, tumorN || Math.round(d.n / (d.fraction || 1)), okFit) : null,
        f1: okFit ? okFit.score : null,
        cladeSize: okFit ? okFit.clade : null,
        genes: g ? g.genes : null,
        genesSource: geneSpans ? "spans" : g ? "track" : null,
        nGenes: g ? g.total : null,
        nDrivers: g ? g.drivers : null,
        ecdna: dm && dm.overlap > 0 ? { label: dm.dms.map((x) => x.label)[0], overlap: dm.overlap, carriers: dm.carriers } : null,
      };
    })
    .sort((a, b) => Number(b.isEcdna) - Number(a.isEcdna) || (b.fraction || 0) - (a.fraction || 0) || b.n - a.n || a.label.localeCompare(b.label));
}

/** Cohort lines: one per family, sorted by cell fraction. perPatient: { patient: entries }. */
export function cohortNotableSvs(perPatient = {}, opts = {}) {
  return Object.entries(perPatient)
    .flatMap(([patient, entries]) => notableSvs(entries, opts).map((r) => ({ ...r, patient })))
    .sort((a, b) => Number(b.isEcdna) - Number(a.isEcdna) || (b.fraction || 0) - (a.fraction || 0) || b.n - a.n || a.patient.localeCompare(b.patient));
}
