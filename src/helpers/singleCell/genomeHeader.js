/**
 * Geometry of the tight genome header on the single-cell pages (chromosome brush strip, gene track, cytoband
 * ideogram). The panel sizes to its content (no fixed-height box, so no white space under the genes); the
 * user's navigation height (resize handle) only sets how many collapsed gene rows may be shown.
 */
export const TIGHT_HEADER = {
  strip: 60, // chromosome brush strip svg (bar 30 + brush handles)
  controls: 24, // Collapsed / Squished / Expanded row
  cytobands: 28, // ideogram strip (24 px band + 2 px each side)
  cytobandsYExtent: [-0.08, 1.08], // band y 0..1 fills the strip
  minGenes: 81, // one collapsed row of labelled genes under the density strip
  pinnedGenes: 81, // gene budget while pinned (Keep gene track)
};

/**
 * Collapsed-mode gene budget (px) of the tight header.
 * plotHeight: the user's navigation height (null = default); compact: pinned or "Compact header".
 */
export function tightGenesBudget({ plotHeight = null, compact = false } = {}) {
  if (compact) return TIGHT_HEADER.pinnedGenes;
  const total = Number.isFinite(plotHeight) ? plotHeight : 240;
  return Math.max(TIGHT_HEADER.minGenes, total - TIGHT_HEADER.strip - TIGHT_HEADER.controls - TIGHT_HEADER.cytobands);
}
