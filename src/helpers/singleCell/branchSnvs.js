// SNVs per tree branch. Each mapped site carries an anchor ("tipA|tipB", or
// one tip for a cell-private site) whose most recent common ancestor is the
// node it maps to (skilift sc_node_anchors), so it can be placed on any copy
// of the tree, including one pruned to a subset of cells.

const depthCache = new WeakMap();

function depths(layout) {
  if (!depthCache.has(layout)) {
    const d = new Int32Array(layout.nodes.length);
    // nodes are created parent-first
    layout.nodes.forEach((n, k) => {
      d[k] = n.parent >= 0 ? d[n.parent] + 1 : 0;
    });
    depthCache.set(layout, d);
  }
  return depthCache.get(layout);
}

/** Lowest common ancestor of two node ids. */
export function lca(layout, a, b) {
  const d = depths(layout);
  let x = a;
  let y = b;
  while (d[x] > d[y]) x = layout.nodes[x].parent;
  while (d[y] > d[x]) y = layout.nodes[y].parent;
  while (x !== y) {
    x = layout.nodes[x].parent;
    y = layout.nodes[y].parent;
  }
  return x;
}

/** Leaf node id by row (leaf order) for a layout. */
function leafNodeByRow(layout) {
  const out = new Int32Array(layout.leaves.length).fill(-1);
  layout.nodes.forEach((n, k) => {
    if (n.isLeaf) out[n.firstLeaf] = k;
  });
  return out;
}

/**
 * Node id in `layout` for each anchor. `full` is the unpruned tree the
 * anchors were written for (defaults to `layout`); when the displayed tree
 * is pruned, a clade is placed at the common ancestor of its remaining cells.
 */
export function resolveAnchors(anchors, layout, full = layout) {
  const fullRow = new Map(full.leaves.map((name, i) => [name, i]));
  const fullLeaf = leafNodeByRow(full);
  const shownRow = new Map(layout.leaves.map((name, i) => [name, i]));
  const shownLeaf = leafNodeByRow(layout);
  const cache = new Map();
  return anchors.map((anchor) => {
    if (!anchor) return null;
    if (cache.has(anchor)) return cache.get(anchor);
    let node = null;
    const rows = anchor.split("|").map((name) => fullRow.get(name));
    if (rows.every((r) => r != null)) {
      const ids = rows.map((r) => fullLeaf[r]);
      const fullNode = full.nodes[ids.length === 1 ? ids[0] : lca(full, ids[0], ids[1])];
      if (full === layout) {
        node = layout.nodes.indexOf(fullNode);
      } else {
        let lo = Infinity;
        let hi = -Infinity;
        for (let r = fullNode.firstLeaf; r <= fullNode.lastLeaf; r += 1) {
          const s = shownRow.get(full.leaves[r]);
          if (s != null) {
            lo = Math.min(lo, s);
            hi = Math.max(hi, s);
          }
        }
        if (lo <= hi) node = lo === hi ? shownLeaf[lo] : lca(layout, shownLeaf[lo], shownLeaf[hi]);
      }
    }
    cache.set(anchor, node);
    return node;
  });
}

/**
 * A node of the right size for a site whose anchors resolved elsewhere: when the
 * resolved node's leaf count differs from the site's mapped clade size
 * (clade_cells), prefer a node of that size on the same lineage (ancestor or
 * descendant of the resolved node), else the only node of that size. Guards
 * against anchor pairs that do not match the backend mapping.
 */
function checkedNode(layout, node, cladeCells, bySize) {
  const want = Number(cladeCells);
  if (node == null || node < 0 || !Number.isFinite(want)) return node;
  const n = layout.nodes[node];
  if (n.lastLeaf - n.firstLeaf + 1 === want) return node;
  const cands = bySize.get(want) || [];
  const sameLineage = cands.find((k) => {
    const c = layout.nodes[k];
    return (c.firstLeaf <= n.firstLeaf && c.lastLeaf >= n.lastLeaf) || (n.firstLeaf <= c.firstLeaf && n.lastLeaf >= c.lastLeaf);
  });
  if (sameLineage != null) return sameLineage;
  return cands.length === 1 ? cands[0] : node;
}

/** Variant indices (from `columns`) on each branch: Map nodeId -> [variant index]. */
export function branchVariants(snv, columns, layout, full = layout) {
  const out = new Map();
  if (!snv || !layout) return out;
  const cols = columns.filter((c) => snv.variants[c]?.anchor);
  const resolved = resolveAnchors(cols.map((c) => snv.variants[c].anchor), layout, full);
  const bySize = new Map();
  layout.nodes.forEach((n, k) => {
    if (n.isLeaf) return;
    const size = n.lastLeaf - n.firstLeaf + 1;
    if (!bySize.has(size)) bySize.set(size, []);
    bySize.get(size).push(k);
  });
  // clade_cells counts the full tree's cells, so the size check only applies when nothing is pruned
  const nodes = layout === full ? resolved.map((node, i) => checkedNode(layout, node, snv.variants[cols[i]].clade_cells, bySize)) : resolved;
  cols.forEach((c, i) => {
    const node = nodes[i];
    if (node == null || node < 0) return;
    if (!out.has(node)) out.set(node, []);
    out.get(node).push(c);
  });
  return out;
}

export const hasAnchors = (snv) => Boolean(snv?.variants?.some((v) => v.anchor));
