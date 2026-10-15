// Per-site QC scores (snv_qc.json, written by srctools gos_sc_site_qc.py from
// the site-filter tables) merged into the sparse snv_matrix.json variants.

/**
 * Copy QC fields (sum_logodds, n_alt, ...) from qc.sites[id] onto the matching
 * variants of the sparse SNV matrix. Returns a new object; the input is untouched.
 */
export function mergeSiteQc(sparse, qc) {
  if (!sparse?.variants || !qc?.sites) return sparse;
  const variants = sparse.variants.map((v) => {
    const q = qc.sites[v.id ?? v.variantId];
    return q ? { ...v, ...q } : v;
  });
  return { ...sparse, variants };
}
