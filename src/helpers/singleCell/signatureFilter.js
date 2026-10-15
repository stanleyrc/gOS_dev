// The Signatures tab's use of the shared SNV site filters (the heatmap's
// category / cellphy / drivers / clade score / Sites select / track filters).
// d3-free so it can be tested on synthetic fixtures.

import { filterSnvColumns } from "./snvSites";

/** Layout key of the "Use SNV filters" toggle; on unless explicitly switched off. */
export const useSnvFilters = (layout) => layout?.sigUseSnvFilters !== false;

/**
 * Variant indices that pass the shared SNV site filters, or null when the
 * toggle is off or no filter is active (then nothing is restricted).
 * @returns {{ allowed: Set<number>|null, n: number, m: number, active: boolean }}
 */
export function allowedSites(snv, layout, annot = null) {
  const m = snv?.variants?.length || 0;
  if (!snv || !useSnvFilters(layout)) return { allowed: null, n: m, m, active: false };
  const all = snv.variants.map((_, c) => c);
  const kept = filterSnvColumns(snv, all, { ...layout, annot });
  if (kept.length === m) return { allowed: null, n: m, m, active: false };
  return { allowed: new Set(kept), n: kept.length, m, active: true };
}

/** Restrict each site set to the allowed sites, keeping the unfiltered size as `total`. */
export function restrictSets(sets, allowed) {
  if (!allowed) return sets.map((s) => ({ ...s, total: s.columns.length }));
  return sets
    .filter((s) => s.kind !== "filter") // the old "heatmap filter" set is now every set
    .map((s) => ({ ...s, total: s.columns.length, columns: s.columns.filter((c) => allowed.has(c)) }));
}

/** "N of M sites" for one set. */
export const siteCountNote = (set) => `${set.columns.length} of ${set.total ?? set.columns.length} sites`;
