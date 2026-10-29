// Split the cells that have no copy-number profile (blank heatmap rows) into
// Normal cells (never run through JaBbA, so no complex.json: expected) and
// non-normal cells (unexpected: keep the warning). d3-free.
import { isNormalClone } from "./figures";

/**
 * @param {Array} rows      per-cell CN rows (falsy = no profile), aligned with cellIds
 * @param {Array} cellIds   cell ids aligned with rows
 * @param {Map|Function} cloneOf  cell id -> clone label (Map or function)
 * @returns {{normal: number, other: number}}
 */
export function splitMissingGenomes(rows, cellIds, cloneOf) {
  const get = typeof cloneOf === "function" ? cloneOf : (id) => cloneOf?.get(id);
  let normal = 0;
  let other = 0;
  (rows || []).forEach((r, i) => {
    if (r) return;
    if (isNormalClone(get(cellIds?.[i]))) normal += 1;
    else other += 1;
  });
  return { normal, other };
}
