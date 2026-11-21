// Exported pseudobulk genome graphs (e.g. a JaBbA fit on each CN cluster's pooled cells) as track-browser rows,
// next to the clade pseudobulk computed in the browser from the per-cell graphs. Spec v0.3: `units.pseudobulk_graphs`
// is an array of entries or a URL to a JSON file `{ "pseudobulk_graphs": [...], "loci": [{ label, locus }] }`;
// without a spec the browser looks for `{dataPath}{patient}/pseudobulk_graphs.json`. d3-free (jest).

export const PSEUDOBULK_GRAPHS_URL = "{dataPath}{patient}/pseudobulk_graphs.json";
export const PSEUDOBULK_GRAPH_URL = "{dataPath}{unit}/complex.json";

const ROLE_RANK = (role) => {
  const r = `${role || ""}`.toLowerCase();
  if (r.startsWith("recommended")) return 0;
  if (r.includes("ploidy")) return 2;
  return 1;
};

/**
 * Normalize a manifest (array, or object with `pseudobulk_graphs`) into
 * [{ id, label, group, n_cells, ploidy, purity, role, url }], sorted per group with the recommended graph first.
 * Entries without an id are dropped; `url` defaults to `{dataPath}{unit}/complex.json` (unit = the entry id).
 */
export function normalizePseudobulkGraphs(manifest) {
  const list = Array.isArray(manifest) ? manifest : Array.isArray(manifest?.pseudobulk_graphs) ? manifest.pseudobulk_graphs : [];
  const out = list
    .filter((e) => e && e.id != null && `${e.id}` !== "")
    .map((e, i) => ({
      id: `${e.id}`,
      label: e.label || `${e.id}`,
      group: e.group ?? null,
      n_cells: Number.isFinite(Number(e.n_cells)) ? Number(e.n_cells) : null,
      ploidy: Number(e.ploidy) > 0 ? Number(e.ploidy) : null,
      purity: Number(e.purity) > 0 && Number(e.purity) <= 1 ? Number(e.purity) : 1,
      role: e.role || "",
      method: e.method || "",
      url: e.url || PSEUDOBULK_GRAPH_URL,
      order: i,
    }));
  out.sort((a, b) => ROLE_RANK(a.role) - ROLE_RANK(b.role) || a.order - b.order);
  return out;
}

/** Locus presets of a manifest ([{ label, locus }]); [] when absent or malformed. */
export function manifestLoci(manifest) {
  const loci = Array.isArray(manifest?.loci) ? manifest.loci : [];
  return loci.filter((l) => l && typeof l.locus === "string" && l.locus.trim()).map((l) => ({ label: l.label || l.locus, locus: l.locus }));
}

/** Pseudobulk graphs grouped by `group` (Map group -> entries in display order). */
export function graphsByGroup(entries) {
  const m = new Map();
  (entries || []).forEach((e) => {
    const g = e.group ?? "no clone";
    if (!m.has(g)) m.set(g, []);
    m.get(g).push(e);
  });
  return m;
}
