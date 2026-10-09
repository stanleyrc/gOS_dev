// Collapsed view of a tree layout for overview drawings: only clades with at
// least `minSize` leaves are kept (plus the root), a kept clade whose
// children are all below the cut becomes a collapsed tip, and every tip gets
// one equal row, so a few hundred cells read as a handful of clades. Chains
// of nodes with a single kept child are merged into one branch.

/**
 * @param layout tree layout ({ nodes }) from layoutTree; node ids are pre-order
 * @param minSize smallest clade (in leaves) drawn as its own branch
 * @returns { nodes: Map(id -> { id, top, parent, children, size, x, depth, tipX, row, tip, folded }),
 *            rows, maxX, maxDepth, shownOf(id) -> nearest kept ancestor-or-self }
 *   x: branch-length position; depth: kept-ancestor count (cladogram);
 *   tipX: deepest leaf x under a collapsed tip; row: tips 0..rows-1, internal nodes the
 *   midpoint of their first and last kept child; folded: leaves in children below the cut;
 *   top: first node of a merged chain (the drawn branch runs from parent to top's clade end).
 */
export function collapseTree(layout, minSize) {
  const empty = { nodes: new Map(), rows: 0, maxX: 0, maxDepth: 0, shownOf: () => null };
  if (!layout?.nodes?.length) return empty;
  const src = layout.nodes;
  const size = (n) => n.lastLeaf - n.firstLeaf + 1;
  const keep = (id) => src[id].parent < 0 || size(src[id]) >= minSize;

  // deepest leaf x per node (ids are pre-order, so children come after parents)
  const deepest = new Float64Array(src.length);
  for (let id = src.length - 1; id >= 0; id -= 1) {
    const n = src[id];
    deepest[id] = n.isLeaf ? n.x : Math.max(...n.children.map((c) => deepest[c]));
  }

  const nodes = new Map();
  const alias = new Map(); // node merged into a chain -> the drawn node below it
  let rows = 0;
  let maxX = 0;
  let maxDepth = 0;
  const root = src.findIndex((n) => n.parent < 0);
  // returns the id drawn for this subtree: a non-root node with a single kept
  // child is merged into that child (one branch for the whole chain)
  const visit = (id, parent, depth) => {
    const n = src[id];
    const kids = n.children.filter(keep);
    if (kids.length === 1 && parent >= 0) {
      const drawn = visit(kids[0], parent, depth);
      alias.set(id, drawn);
      nodes.get(drawn).top = id;
      nodes.get(drawn).folded += n.children.filter((c) => !keep(c)).reduce((s, c) => s + size(src[c]), 0);
      return drawn;
    }
    const out = {
      id,
      top: id,
      parent,
      children: [],
      size: size(n),
      x: n.x,
      depth,
      tipX: kids.length ? n.x : deepest[id],
      tip: !kids.length,
      folded: n.children.filter((c) => !keep(c)).reduce((s, c) => s + size(src[c]), 0),
      row: 0,
    };
    nodes.set(id, out);
    maxDepth = Math.max(maxDepth, depth);
    if (out.tip) {
      out.row = rows;
      rows += 1;
      maxX = Math.max(maxX, out.tipX);
    } else {
      out.children = kids.map((c) => visit(c, id, depth + 1));
      out.row = (nodes.get(out.children[0]).row + nodes.get(out.children[out.children.length - 1]).row) / 2;
      maxX = Math.max(maxX, n.x);
    }
    return id;
  };
  visit(root, -1, 0);

  // drawn node for any tree node: itself, the drawn end of its chain, or its nearest drawn ancestor
  const shownOf = (id) => {
    let k = id;
    while (k != null && k >= 0 && !nodes.has(k) && !alias.has(k)) k = src[k].parent;
    if (k == null || k < 0) return null;
    return nodes.has(k) ? k : alias.get(k);
  };
  return { nodes, rows, maxX, maxDepth, shownOf };
}

/** Majority value of `valueOf` over leaf rows [first, last]; null unless it covers `share` of them. */
export function dominantValue(first, last, valueOf, share = 0.8) {
  const counts = new Map();
  for (let r = first; r <= last; r += 1) {
    const v = valueOf(r);
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  let best = null;
  let bestN = 0;
  counts.forEach((n, v) => {
    if (n > bestN) {
      best = v;
      bestN = n;
    }
  });
  return best != null && bestN >= share * (last - first + 1) ? best : null;
}

/**
 * Greedy vertical de-overlap for label boxes: boxes ({ x, y, w, h, ... }, y = top)
 * are taken by `prio` (lower first), then wanted y, and pushed down (or up when `dir` is -1)
 * past any already placed box they overlap horizontally. Returns copies with
 * the placed y and `shifted` = how far they moved.
 */
export function placeLabels(boxes, gap = 2) {
  const placed = [];
  [...boxes]
    .sort((a, b) => (a.prio || 0) - (b.prio || 0) || (a.dir === -1 ? b.y - a.y : a.y - b.y) || a.x - b.x)
    .forEach((b) => {
      const dir = b.dir === -1 ? -1 : 1;
      const hitAt = (y) => placed.find((p) => p.x < b.x + b.w && b.x < p.x + p.w && p.y < y + b.h + gap && y < p.y + p.h + gap);
      let y = b.y;
      let hit = hitAt(y);
      for (let guard = 0; hit && guard < 200; guard += 1) {
        y = dir > 0 ? hit.y + hit.h + gap : hit.y - b.h - gap;
        hit = hitAt(y);
      }
      placed.push({ ...b, y, shifted: y - b.y });
    });
  return placed;
}
