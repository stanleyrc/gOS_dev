// Copy-number heatmaps under the Compare Trees tab: which layers show (URL param cmpheat)
// and how each tree's leaf order maps onto the patient's copy-number rows.
// Dependency-free (no d3) so the logic is unit-testable in isolation.

export const CMPHEAT_PARAM = "cmpheat";
export const CMPHEAT_MODES = ["snv", "cn", "both"];
export const CMPHEAT_DEFAULT = "snv";

/** cmpheat=snv|cn|both from a URL value; anything else is the default (SNVs). */
export function parseCmpHeat(value) {
  return CMPHEAT_MODES.includes(value) ? value : CMPHEAT_DEFAULT;
}

/** URL value for a mode (null = the default, so the param is left out). */
export function serializeCmpHeat(mode) {
  return mode && mode !== CMPHEAT_DEFAULT && CMPHEAT_MODES.includes(mode) ? mode : null;
}

export const showsSnv = (mode) => mode !== "cn";
export const showsCn = (mode) => mode === "cn" || mode === "both";

/**
 * Rows of one tree's CN heatmap: for each leaf (in the tree's order) the position
 * of its profile in the patient's copy-number payload, -1 when it has none.
 * @param leaves cell ids in tree order
 * @param payloadCells payload.cells (ids in payload order)
 * @param payloadRows payload.rows (profile or null per payload cell)
 * @returns { map: Int32Array, missing: number } missing = leaves drawn as blank rows
 */
export function cnRowsForLeaves(leaves, payloadCells, payloadRows) {
  const pos = new Map();
  (payloadCells || []).forEach((c, k) => pos.set(`${c}`, k));
  let missing = 0;
  const map = Int32Array.from(leaves || [], (id) => {
    const p = pos.has(`${id}`) ? pos.get(`${id}`) : -1;
    if (p < 0 || !payloadRows || !payloadRows[p]) {
      missing += 1;
      return -1;
    }
    return p;
  });
  return { map, missing };
}
