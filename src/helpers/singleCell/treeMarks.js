// Tree markers from saved cell groups (committee / figure links, ?treemark=):
// tip dots in each group's colour, the first group's tip branches coloured,
// and rings on the internal nodes where a parsimony (Fitch) reconstruction of
// "first group vs second group" changes state, i.e. where e.g. long ecEGFR
// was lost or an amplicon integrated. d3-free for jest.

/**
 * layout: layoutTree() output (nodes with children / isLeaf / name / parent).
 * groups: [{ color, cells: Set<cellId> }] (first = derived state, second = ancestral).
 * Returns { tip: Map<node, color>, branch: Map<node, color>, ring: Map<node, color> }.
 */
export function treeMarks(layout, groups = []) {
  const tip = new Map();
  const branch = new Map();
  const ring = new Map();
  if (!layout?.nodes?.length || !groups.length) return { tip, branch, ring };
  const groupOf = (name) => groups.findIndex((g) => g.cells.has(`${name}`));
  layout.nodes.forEach((n, k) => {
    if (!n.isLeaf) return;
    const g = groupOf(n.name);
    if (g < 0) return;
    tip.set(k, groups[g].color);
    if (g === 0) branch.set(k, groups[0].color);
  });
  if (groups.length < 2) return { tip, branch, ring };
  // Fitch: state 1 = first group, 0 = second, unmarked leaves are wildcards
  const sets = new Array(layout.nodes.length);
  for (let k = layout.nodes.length - 1; k >= 0; k -= 1) {
    const n = layout.nodes[k];
    if (n.isLeaf) {
      const g = groupOf(n.name);
      sets[k] = g === 0 ? 1 : g === 1 ? 2 : 3; // bitmask: 1 = {1}, 2 = {0}, 3 = {0,1}
    } else {
      const kids = n.children.map((c) => sets[c]);
      const inter = kids.reduce((a, b) => a & b, 3);
      sets[k] = inter || kids.reduce((a, b) => a | b, 0);
    }
  }
  const state = new Array(layout.nodes.length);
  const pick = (mask, prefer) => (mask & (prefer === 1 ? 1 : 2) ? prefer : mask & 2 ? 0 : 1);
  layout.nodes.forEach((n, k) => {
    // nodes are stored in pre-order: parents come before children
    state[k] = n.parent < 0 ? pick(sets[k], 0) : pick(sets[k], state[n.parent]);
    if (n.parent >= 0 && state[k] !== state[n.parent] && sets[k] !== 3) ring.set(k, groups[state[k] === 1 ? 0 : 1].color);
  });
  return { tip, branch, ring };
}
