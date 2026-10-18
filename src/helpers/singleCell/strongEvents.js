/**
 * Strong single-cell events: deletions in at least 10% of tumor cells, any
 * other event in at least 3 cells and 5% of tumor cells. Rows without cell
 * counts (bulk) always pass. A HOMDEL flagged broad_cn0 (CN 0 over a whole chromosome / arm in its
 * carrier cells: a copy-number fit artefact, gos_sc_homdel_qc.py) never passes.
 */
export function isStrongEvent(record) {
  if (record?.broad_cn0 === true || `${record?.broad_cn0}` === "true") return false;
  const n = Number(record?.n_cells);
  const f = Number(record?.cell_fraction);
  if (!Number.isFinite(n) || !Number.isFinite(f)) return true;
  const deletion = /homdel|del/i.test(`${record.vartype || ""}`) || /homdel/i.test(`${record.type || ""}`);
  return deletion ? f >= 0.1 : n >= 3 && f >= 0.05;
}
