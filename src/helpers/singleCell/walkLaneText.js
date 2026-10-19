// Text for the ecDNA walks plot: what each label-column header means and the per-lane summary line.
// Pure helpers (no d3) so the wording and denominators are testable.
const fmtInt = (n) => Number(n).toLocaleString("en-US");

/** Tooltip for a label-column header: cells, copies or size. nCells (patient cell count) is optional. */
export function walkLaneHeaderTip(key, nCells) {
  if (key === "cells") return `Carrier cells: cells with at least one copy of the walk${nCells > 0 ? `, out of ${fmtInt(nCells)} cells in this patient` : ""}. The percentage in the table is carriers / cells.`;
  if (key === "copies") return "Median copies per carrier cell (x = copies, non-carriers excluded).";
  if (key === "size") return "Genomic span of the walk, summed over its segments (bp, kb or Mb).";
  return "";
}

/** One-line lane summary with the denominator when the patient cell count is known. */
export function walkLaneSummary(ncells, median, nCells) {
  const frac = nCells > 0 ? ` of ${fmtInt(nCells)} cells (${Math.round((100 * ncells) / nCells)}%)` : " cells";
  return `${fmtInt(ncells)}${frac} carry it · median ${Number(median).toFixed(0)} copies per carrier`;
}
