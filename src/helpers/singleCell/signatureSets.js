// Site sets for signature analysis of a single-cell patient: by tree
// position, by clone (sites with alt reads in the clone's cells), the
// current selection, and the mutation heatmap's filter.

import { rowMap } from "./matrix";
import { filterSnvColumns, sitesSeenInRows } from "./snvSites";
import { cosine, sbs96Counts } from "./signatures";

const cellphy = (v) => v.cellphyInput === true || v.cellphy_input === true;

/**
 * @returns [{ key, name, kind, columns }] where columns are variant indices.
 */
export function signatureSiteSets(snv, { cells = [], selectedCellIds = [], layout = {} } = {}) {
  if (!snv) return [];
  const all = snv.variants.map((_, c) => c);
  const tree = all.filter((c) => cellphy(snv.variants[c]));
  const base = tree.length ? tree : all;
  const sets = [{ key: "all", name: "all", kind: "tree", columns: base }];
  ["truncal", "subclonal", "private"].forEach((cat) => {
    const columns = base.filter((c) => snv.variants[c].category === cat);
    if (columns.length) sets.push({ key: cat, name: cat, kind: "tree", columns });
  });
  const clones = new Map();
  cells.forEach((c) => {
    if (c.clone_id == null || /^normal$/i.test(`${c.clone_id}`)) return;
    if (!clones.has(`${c.clone_id}`)) clones.set(`${c.clone_id}`, []);
    clones.get(`${c.clone_id}`).push(c.cell_id);
  });
  const baseSet = new Set(base);
  [...clones.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
    .forEach(([clone, ids]) => {
      const rows = rowMap(ids, snv.cells).filter((p) => p >= 0);
      const seen = sitesSeenInRows(snv, rows);
      const columns = [...seen].filter((c) => baseSet.has(c));
      if (columns.length) sets.push({ key: `clone:${clone}`, name: `clone: ${clone}`, kind: "clone", clone, columns });
    });
  if (selectedCellIds.length) {
    const rows = rowMap(selectedCellIds, snv.cells).filter((p) => p >= 0);
    const seen = sitesSeenInRows(snv, rows);
    sets.push({ key: "selection", name: `selection (${selectedCellIds.length} cells)`, kind: "selection", columns: [...seen] });
  }
  const filtered = filterSnvColumns(snv, all, layout);
  if (filtered.length !== all.length) sets.push({ key: "filtered", name: "heatmap filter", kind: "filter", columns: filtered });
  return sets;
}

/** SBS96 counts of a set's sites (those with a context). */
export function setProfile(snv, columns) {
  const contexts = columns.map((c) => snv.variants[c].context).filter(Boolean);
  return { ...sbs96Counts(contexts), contexts };
}

/** Cosine similarity matrix between set profiles: { keys, matrix[i][j] }. */
export function profileSimilarity(profiles) {
  const keys = profiles.map((p) => p.key);
  const matrix = profiles.map((a) => profiles.map((b) => cosine(a.counts, b.counts)));
  return { keys, matrix };
}
