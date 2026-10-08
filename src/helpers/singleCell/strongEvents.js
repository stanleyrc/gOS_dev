/**
 * Strong single-cell events: deletions in at least 10% of tumor cells, any
 * other event in at least 3 cells and 5% of tumor cells. Rows without cell
 * counts (bulk) always pass.
 */
export function isStrongEvent(record) {
  const n = Number(record?.n_cells);
  const f = Number(record?.cell_fraction);
  if (!Number.isFinite(n) || !Number.isFinite(f)) return true;
  const deletion = /homdel|del/i.test(`${record.vartype || ""}`) || /homdel/i.test(`${record.type || ""}`);
  return deletion ? f >= 0.1 : n >= 3 && f >= 0.05;
}
