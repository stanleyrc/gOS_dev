// Quality fields of one filtered event for the cohort "All events" table (d3-free). Each one reuses the helper or
// field the patient Filtered Events table / patient report uses; nothing is invented, missing values are null.
import { CLONAL_FRACTION, RARE_FRACTION } from "./patientReport";
import { exportedClonality } from "./exportedClonality";
import { cladeFitScore } from "./cladeFit";
import { dnaFusionGenes } from "./rnaFusions";
import { fusionSupport, indexRnaFusions } from "./fusionSupport";

const fin = (v) => (v == null || v === "" || v === "None" || !Number.isFinite(Number(v)) ? null : Number(v));

/** clonal / subclonal / rare from the carrier-cell fraction: the patient report's cut-offs. */
export const clonalityOf = (fraction) => (!Number.isFinite(fraction) ? null : fraction >= CLONAL_FRACTION ? "clonal" : fraction >= RARE_FRACTION ? "subclonal" : "rare");

/** Clade F1 of the carriers on the patient's tree: the Filtered Events "Clade F1" column (null without a tree). */
export function cladeF1Of(event, tree) {
  if (!tree) return null;
  const s = cladeFitScore(`${event?.cell_ids || ""}`.split(",").filter(Boolean), tree).score;
  return Number.isFinite(s) ? s : null;
}

/** Event span in Mb for copy-number events (event start / end); null for other classes or without coordinates. */
export function spanMb(event, cls) {
  if (cls !== "amp" && cls !== "homdel") return null;
  const a = fin(event?.start);
  const b = fin(event?.end);
  return a == null || b == null || b < a ? null : (b - a + 1) / 1e6;
}

/** Driver evidence class from the pipeline (likely / possible / unlikely), null when the event has none. */
export const driverClassOf = (event) => (event?.driver_class && event.driver_class !== "None" ? `${event.driver_class}` : null);

/**
 * DNA / RNA support of a fusion event (same helper as the patient table). Null for non-fusions.
 * @param rnaFusions normalised rna/fusions.json fusions of the patient, or null when that file is absent
 */
export function supportFields(event, rnaFusions) {
  const genes = dnaFusionGenes(event);
  if (!genes) return null;
  const idx = rnaFusions ? indexRnaFusions(rnaFusions) : null;
  const best = idx?.get([genes[0], genes[1]].sort().join("::"))?.[0] || null;
  const s = fusionSupport({ dna: event, rna: best, rnaKnown: Boolean(idx) });
  return { kind: s.kind, dnaCells: s.dnaCells, rnaCells: s.hasRna ? s.rnaCells : s.rnaKnown ? 0 : null, rnaReads: s.hasRna ? s.rnaReads : s.rnaKnown ? 0 : null };
}

/** "yes" / "no" for fusions (upstream-only flank join), null for everything else. */
export function upstreamOf(event) {
  if (!dnaFusionGenes(event)) return null;
  return event.upstream_only === true || `${event.upstream_only}` === "true" ? "yes" : "no";
}

/** All quality fields of one event. */
export function eventQuality(event, cls, { tree = null, rnaFusions = null, fraction } = {}) {
  const sup = supportFields(event, rnaFusions);
  return {
    clonality: exportedClonality(event) ? (exportedClonality(event) === "indeterminate" ? null : exportedClonality(event)) : clonalityOf(fraction), // dropout-aware export first
    cladeF1: cladeF1Of(event, tree),
    spanMb: spanMb(event, cls),
    driverClass: driverClassOf(event),
    support: sup ? sup.kind : null,
    dnaCells: sup ? sup.dnaCells : null,
    rnaCells: sup ? sup.rnaCells : null,
    rnaReads: sup ? sup.rnaReads : null,
    upstream: upstreamOf(event),
  };
}
