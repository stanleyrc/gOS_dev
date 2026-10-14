// Clade-caller output (srctools gos_sc_clades.R): <patient>/clades.json and _cohort/clades.json.
// d3-free helpers for the cohort Clades view and the phylogeny clade overlay.

/** Name of the saved cell group that carries a clade's cells into the Single-Cell tab (?scsel=). */
export const cladeGroupName = (id) => `clade ${id}`;

/** Cohort rows with numeric fields normalised; rows without a patient or id are dropped. */
export function cohortCladeRows(json) {
  return (json?.rows || [])
    .filter((r) => r && r.patient && r.clade)
    .map((r) => ({
      ...r,
      n_cells: Number(r.n_cells) || 0,
      n_private_snv: r.n_private_snv == null ? null : Number(r.n_private_snv),
      burden: r.burden == null ? null : Number(r.burden),
      top_signature: r.top_signature || null,
      cells: Array.isArray(r.cells) ? r.cells : [],
    }));
}

/** Stable sort by a column; nulls last in either direction. */
export function sortCladeRows(rows, key, dir = "desc") {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    if (typeof x === "number" && typeof y === "number") return sign * (x - y);
    return sign * `${x}`.localeCompare(`${y}`);
  });
}

/** Scatter points: n_cells vs mutation burden, only rows with a burden. Patient order gives colour indices. */
export function cladeScatterPoints(rows) {
  const patients = [...new Set(rows.map((r) => r.patient))].sort();
  return rows
    .filter((r) => r.burden != null)
    .map((r) => ({
      id: r.clade,
      patient: r.patient,
      color: patients.indexOf(r.patient),
      x: r.n_cells,
      y: r.burden,
      tip: `${r.clade}: ${r.n_cells} cells, ${r.n_private_snv ?? "?"} private SNVs, ${r.burden} per 1000 sites, signature ${r.top_signature || "n/a"}`,
    }));
}

/**
 * Tree node ids (of a layout from layoutTree) for called clades: the smallest node whose leaf range
 * covers all of the clade's cells that are in the layout, labelled with the private-SNV count.
 * @returns Map(nodeId -> { label, clade })
 */
export function cladeNodeLabels(layout, clades) {
  const out = new Map();
  if (!layout || !clades?.length) return out;
  const row = new Map(layout.leaves.map((id, i) => [`${id}`, i]));
  clades.forEach((c) => {
    const rows = (c.cells || []).map((id) => row.get(`${id}`)).filter((r) => r != null);
    if (rows.length < 2) return;
    const lo = Math.min(...rows);
    const hi = Math.max(...rows);
    let best = -1;
    let bestSize = Infinity;
    layout.nodes.forEach((n, k) => {
      if (n.isLeaf || n.firstLeaf > lo || n.lastLeaf < hi) return;
      const size = n.lastLeaf - n.firstLeaf;
      if (size < bestSize) {
        best = k;
        bestSize = size;
      }
    });
    if (best < 0) return;
    const count = c.n_private_snv;
    const label = count == null ? `${c.n_cells}c` : `${count} SNV`;
    const prev = out.get(best);
    if (!prev || (c.n_private_snv ?? 0) > (prev.clade.n_private_snv ?? 0)) out.set(best, { label, clade: c });
  });
  return out;
}

/** Saved-groups list for a patient with the clade's cells added (replacing an earlier copy). */
export function withCladeGroup(groups = [], clade) {
  const name = cladeGroupName(clade.clade || clade.id);
  return [...groups.filter((g) => g.name !== name), { name, cells: [...clade.cells] }];
}
