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

/** Variant indices (from `columns`) on each branch: Map nodeId -> [variant index]. */
export function branchVariants(snv, columns, layout, full = layout) {
  const out = new Map();
  if (!snv || !layout) return out;
  const cols = columns.filter((c) => snv.variants[c]?.anchor);
  const nodes = resolveAnchors(cols.map((c) => snv.variants[c].anchor), layout, full);
  cols.forEach((c, i) => {
    const node = nodes[i];
    if (node == null || node < 0) return;
    if (!out.has(node)) out.set(node, []);
    out.get(node).push(c);
  });
  return out;
}

export const hasAnchors = (snv) => Boolean(snv?.variants?.some((v) => v.anchor));
