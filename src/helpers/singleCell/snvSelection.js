// Selecting mutation (SNV) columns, mirroring cell selection: click one,
// Cmd/Ctrl-click to add or remove, Shift-click for a range of columns in the
// current order, drag a range across the column strip. The selection is a list
// of variant ids (stable across column orders and filters). d3-free.

/** Add or remove one id. */
export const toggleId = (selected, id) => (selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

/** Union / intersection / difference of two id lists (order of `a`, then new ids of `b`). */
export const unionIds = (a, b) => {
  const seen = new Set(a);
  return [...a, ...b.filter((x) => !seen.has(x) && seen.add(x))];
};
export const intersectIds = (a, b) => {
  const keep = new Set(b);
  return a.filter((x) => keep.has(x));
};
export const differenceIds = (a, b) => {
  const drop = new Set(b);
  return a.filter((x) => !drop.has(x));
};

/** Ids of columns lo..hi (inclusive, either order) of `orderIds`. */
export function idsInRange(orderIds, lo, hi) {
  if (!orderIds.length) return [];
  const a = Math.max(0, Math.min(lo, hi));
  const b = Math.min(orderIds.length - 1, Math.max(lo, hi));
  return orderIds.slice(a, b + 1);
}

/**
 * Result of clicking the column block lo..hi (one column, or the sites sharing
 * a pixel when the matrix is binned). `anchorId` is the column last clicked.
 *   plain        -> exactly that block
 *   multi (Cmd/Ctrl) -> add the block, or remove it when all of it is selected
 *   shift        -> every column between the anchor and the block (added to the
 *                   selection when multi is also held)
 * Returns { selected, anchorId }.
 */
export function columnPick(selected, orderIds, { lo, hi = lo, anchorId = null, shift = false, multi = false }) {
  const block = idsInRange(orderIds, lo, hi);
  if (!block.length) return { selected, anchorId };
  const anchorIdx = anchorId == null ? -1 : orderIds.indexOf(anchorId);
  if (shift && anchorIdx >= 0) {
    const range = idsInRange(orderIds, Math.min(anchorIdx, lo), Math.max(anchorIdx, hi));
    return { selected: multi ? unionIds(selected, range) : range, anchorId };
  }
  if (multi) {
    const sel = new Set(selected);
    const allIn = block.every((id) => sel.has(id));
    return { selected: allIn ? differenceIds(selected, block) : unionIds(selected, block), anchorId: block[0] };
  }
  return { selected: block, anchorId: block[0] };
}

/** Selection after a drag over columns i0..i1: that range, added to `base` when additive. */
export const dragPick = (base, orderIds, i0, i1, additive = false) => {
  const range = idsInRange(orderIds, i0, i1);
  return additive ? unionIds(base, range) : range;
};

/** Variant (column) indices of the ids, in `ids` order; unknown ids are dropped. */
export function idsToColumns(snv, ids) {
  if (!snv || !ids?.length) return [];
  const index = new Map(snv.variants.map((v, c) => [v.id, c]));
  return ids.map((id) => index.get(id)).filter((c) => c != null);
}

/** Ids that exist in the matrix (a link may name sites of another patient). */
export const knownIds = (snv, ids) => idsToColumns(snv, ids).map((c) => snv.variants[c].id);

/** Cell ids with alt reads at any (default) or all of the columns. Cells without a call at a site never count for "all". */
export function carrierCells(snv, columns, mode = "any") {
  if (!snv || !columns.length) return [];
  const out = [];
  snv.cells.forEach((id, p) => {
    const st = snv.status[p];
    if (!st) return;
    let n = 0;
    for (let k = 0; k < columns.length; k += 1) if (st[columns[k]] === 1) n += 1;
    if (mode === "all" ? n === columns.length : n > 0) out.push(id);
  });
  return out;
}

/** Keep only the selected sites (the "selected only" filter). */
export const selectedOnlyIds = (snvSelected, snvSelectedOnly) => (snvSelectedOnly && snvSelected?.length ? snvSelected : null);

/* ---- URL: snsel=<id>,<id> ---- */
export const SNSEL_PARAM = "snsel";
export const serializeSnsel = (ids) => (ids?.length ? ids.join(",") : null);
export const parseSnsel = (value) => (value || "").split(",").map((s) => s.trim()).filter(Boolean);

/* ---- named mutation sets (kept per patient, like saved cell groups) ---- */
export function upsertSet(sets, name, ids) {
  const label = `${name}`.trim();
  if (!label || !ids.length) return sets;
  return [...sets.filter((s) => s.name !== label), { name: label, ids: [...ids] }];
}
export const removeSet = (sets, name) => sets.filter((s) => s.name !== name);
