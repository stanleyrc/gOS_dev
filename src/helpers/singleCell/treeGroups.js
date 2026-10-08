// Grouping tree leaves into clades for per-clade annotations.

/**
 * Cut a tree layout into `k` clades: starting from the root, repeatedly split
 * the clade with the most leaves at its children until there are k. Returns
 * contiguous leaf ranges [{ node, first, last }] in leaf order.
 */
export function cutTree(layout, k) {
  if (!layout || !layout.nodes.length) return [];
  const root = layout.nodes.findIndex((n) => n.parent < 0);
  let clades = [root >= 0 ? root : 0];
  const size = (id) => layout.nodes[id].lastLeaf - layout.nodes[id].firstLeaf + 1;
  while (clades.length < k) {
    const splittable = clades.filter((id) => !layout.nodes[id].isLeaf && layout.nodes[id].children.length > 1);
    if (!splittable.length) break;
    const big = splittable.reduce((a, b) => (size(b) > size(a) ? b : a));
    clades = [...clades.filter((id) => id !== big), ...layout.nodes[big].children];
  }
  return clades
    .map((node) => ({ node, first: layout.nodes[node].firstLeaf, last: layout.nodes[node].lastLeaf }))
    .sort((a, b) => a.first - b.first);
}

/**
 * Contiguous runs of equal labels along the leaf order (e.g. clones), as
 * [{ label, first, last }].
 */
export function labelRuns(labels) {
  const out = [];
  labels.forEach((label, i) => {
    const last = out[out.length - 1];
    if (last && last.label === label) last.last = i;
    else out.push({ label, first: i, last: i });
  });
  return out;
}
