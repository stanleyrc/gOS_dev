// Newick parsing and rectangular tree layout for single-cell phylogenies.
// Dependency-free so it can be unit-tested and reused by RNA views later.

const isWhitespace = (ch) => ch === " " || ch === "\n" || ch === "\r" || ch === "\t";

/**
 * Parse a Newick string into a plain tree:
 *   { name: string|null, length: number|null, children: Node[] }
 * Supports quoted labels, [comments], missing branch lengths and
 * scientific-notation lengths. Throws on malformed input.
 */
export function parseNewick(text) {
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Empty Newick string");
  }
  const s = text.trim();
  let i = 0;

  const skip = () => {
    for (;;) {
      while (i < s.length && isWhitespace(s[i])) i += 1;
      if (s[i] === "[") {
        const close = s.indexOf("]", i);
        if (close < 0) throw new Error("Unterminated Newick comment");
        i = close + 1;
      } else {
        return;
      }
    }
  };

  const readLabel = () => {
    skip();
    if (s[i] === "'" || s[i] === '"') {
      const quote = s[i];
      i += 1;
      let out = "";
      while (i < s.length) {
        if (s[i] === quote) {
          if (s[i + 1] === quote) {
            out += quote;
            i += 2;
            continue;
          }
          i += 1;
          return out;
        }
        out += s[i];
        i += 1;
      }
      throw new Error("Unterminated quoted Newick label");
    }
    let start = i;
    while (i < s.length && !"(),:;[".includes(s[i])) i += 1;
    const raw = s.slice(start, i).trim();
    // Unquoted underscores are kept as-is: cell IDs routinely contain them.
    return raw.length ? raw : null;
  };

  const readLength = () => {
    skip();
    if (s[i] !== ":") return null;
    i += 1;
    skip();
    const start = i;
    while (i < s.length && /[0-9eE+\-.]/.test(s[i])) i += 1;
    const value = Number(s.slice(start, i));
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid Newick branch length at position ${start}`);
    }
    return value;
  };

  const readNode = (depth) => {
    if (depth > 100000) throw new Error("Newick tree is too deep");
    skip();
    const node = { name: null, length: null, children: [] };
    if (s[i] === "(") {
      i += 1;
      for (;;) {
        node.children.push(readNode(depth + 1));
        skip();
        if (s[i] === ",") {
          i += 1;
          continue;
        }
        if (s[i] === ")") {
          i += 1;
          break;
        }
        throw new Error(`Unexpected '${s[i] ?? "end of input"}' in Newick at ${i}`);
      }
    }
    node.name = readLabel();
    node.length = readLength();
    return node;
  };

  const root = readNode(0);
  skip();
  if (s[i] === ";") i += 1;
  skip();
  if (i < s.length) {
    throw new Error(`Unexpected trailing Newick content at ${i}`);
  }
  return root;
}

/** Leaf names in depth-first (display) order. */
export function leafNames(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (!node.children || node.children.length === 0) {
      out.push(node.name);
    } else {
      for (let k = node.children.length - 1; k >= 0; k -= 1) {
        stack.push(node.children[k]);
      }
    }
  }
  return out;
}

/**
 * Remove leaves whose names are not in `keep`, collapsing internal nodes left
 * with a single child (branch lengths are summed). Returns null if nothing is
 * kept.
 */
export function pruneTree(root, keep) {
  const prune = (node) => {
    if (!node.children || node.children.length === 0) {
      return keep.has(node.name) ? { ...node, children: [] } : null;
    }
    const children = node.children.map(prune).filter(Boolean);
    if (children.length === 0) return null;
    if (children.length === 1) {
      const only = children[0];
      const length =
        node.length == null && only.length == null
          ? null
          : (node.length || 0) + (only.length || 0);
      return { ...only, length };
    }
    return { ...node, children };
  };
  return prune(root);
}

/**
 * Rectangular layout. Leaves get consecutive row indices (0..n-1) in DFS
 * order; internal nodes sit at the midpoint of their first and last child.
 * x is cumulative branch length from the root, or, when the tree has no
 * branch lengths, a cladogram where all leaves align at the right edge.
 *
 * Returns { nodes, leaves, maxX } where every node has
 * { id, name, x, y, parent, children, firstLeaf, lastLeaf, isLeaf }.
 */
export function layoutTree(root) {
  const nodes = [];
  let hasLengths = false;
  const visitLengths = [root];
  while (visitLengths.length) {
    const n = visitLengths.pop();
    if (n !== root && n.length != null && n.length > 0) hasLengths = true;
    (n.children || []).forEach((c) => visitLengths.push(c));
  }

  // Iterative post-order to compute heights (for cladograms) without recursion.
  const heights = new Map();
  const order = [];
  const stack = [root];
  while (stack.length) {
    const n = stack.pop();
    order.push(n);
    (n.children || []).forEach((c) => stack.push(c));
  }
  for (let k = order.length - 1; k >= 0; k -= 1) {
    const n = order[k];
    const kids = n.children || [];
    heights.set(
      n,
      kids.length === 0 ? 0 : 1 + Math.max(...kids.map((c) => heights.get(c)))
    );
  }
  const rootHeight = heights.get(root);

  const leaves = [];
  // Pre-order to assign x and ids, then post-order for y/leaf ranges.
  const assign = [{ node: root, parent: -1, x: 0 }];
  const idOf = new Map();
  while (assign.length) {
    const { node, parent, x } = assign.pop();
    const id = nodes.length;
    idOf.set(node, id);
    const nx = hasLengths
      ? x + (node === root ? 0 : Math.max(0, node.length || 0))
      : rootHeight - heights.get(node);
    nodes.push({
      id,
      name: node.name,
      x: nx,
      y: 0,
      parent,
      children: [],
      firstLeaf: -1,
      lastLeaf: -1,
      isLeaf: !node.children || node.children.length === 0,
      source: node,
    });
    if (parent >= 0) nodes[parent].children.push(id);
    const kids = node.children || [];
    for (let k = kids.length - 1; k >= 0; k -= 1) {
      assign.push({ node: kids[k], parent: id, x: nx });
    }
  }
  // Children were pushed in the order nodes were created, which is DFS order.
  // Leaves in node-id order are the DFS leaf order.
  nodes.forEach((n) => {
    if (n.isLeaf) {
      n.firstLeaf = leaves.length;
      n.lastLeaf = leaves.length;
      n.y = leaves.length;
      leaves.push(n.name);
    }
  });
  for (let k = nodes.length - 1; k >= 0; k -= 1) {
    const n = nodes[k];
    if (n.isLeaf) continue;
    const first = nodes[n.children[0]];
    const last = nodes[n.children[n.children.length - 1]];
    n.firstLeaf = first.firstLeaf;
    n.lastLeaf = last.lastLeaf;
    n.y = (first.y + last.y) / 2;
  }
  nodes.forEach((n) => delete n.source);
  const maxX = nodes.reduce((m, n) => Math.max(m, n.x), 0);
  return { nodes, leaves, maxX };
}

/**
 * Build a display tree for a set of cells (from Newick text or a parsed tree):
 * prune to cells that exist, then lay out. Cells absent from the tree are returned in `unplaced` so callers
 * can append them below the tree rows.
 */
export function treeForCells(newickOrRoot, cellIds) {
  const keep = new Set(cellIds);
  const root =
    typeof newickOrRoot === "string" ? parseNewick(newickOrRoot) : newickOrRoot;
  const pruned = pruneTree(root, keep);
  if (!pruned) {
    return { layout: null, unplaced: [...cellIds] };
  }
  const layout = layoutTree(pruned);
  const placed = new Set(layout.leaves);
  const unplaced = cellIds.filter((id) => !placed.has(id));
  return { layout, unplaced };
}

/**
 * Copy of a tree rescaled so its deepest leaf sits at distance 1 from the
 * root (edges without lengths count as 1 when the tree has no lengths at all).
 * Used to put several patients' trees side by side on a common scale.
 */
export function toUnitHeight(root) {
  let hasLengths = false;
  const check = [root];
  while (check.length) {
    const n = check.pop();
    if (n !== root && n.length != null && n.length > 0) hasLengths = true;
    (n.children || []).forEach((c) => check.push(c));
  }
  const edge = (n) => (hasLengths ? Math.max(0, n.length || 0) : 1);
  let max = 0;
  const depth = [[root, 0]];
  while (depth.length) {
    const [n, d] = depth.pop();
    if (!n.children || !n.children.length) max = Math.max(max, d);
    (n.children || []).forEach((c) => depth.push([c, d + edge(c)]));
  }
  const scale = max > 0 ? 1 / max : 1;
  const copy = (n, isRoot) => ({
    name: n.name,
    length: isRoot ? 0 : edge(n) * scale,
    children: (n.children || []).map((c) => copy(c, false)),
  });
  return copy(root, true);
}
