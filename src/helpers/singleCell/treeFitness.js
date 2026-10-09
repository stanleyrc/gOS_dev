// Fitness from tree shape: the local branching index (LBI, Neher, Russell &
// Shraiman 2014) of every node, the exponentially discounted tree length
// around it. Rapidly expanding lineages sit in bushy neighbourhoods and have
// high LBI. O(n) with one pass up and one pass down the tree. d3-free.
//
//   f(c) = tau (1 - exp(-b_c / tau)) + exp(-b_c / tau) D(c)      (branch c and below, seen from its parent)
//   D(v) = sum over children c of f(c)
//   g(v) = tau (1 - exp(-b_v / tau)) + exp(-b_v / tau) U(v)      (v's branch and the rest of the tree, seen from v)
//   U(c) = g(p) + sum over siblings s of c of f(s)               (p = parent of c; g(root) = 0)
//   LBI(v) = D(v) + g(v)

/** LBI per node (Float64Array over layout.nodes); tau defaults to 1/16 of the mean root-to-leaf depth. */
export function localBranchingIndex(layout, tau = null) {
  const nodes = layout?.nodes || [];
  const n = nodes.length;
  const out = new Float64Array(n);
  if (!n) return out;
  const parent = new Int32Array(n).fill(-1);
  nodes.forEach((node, i) => (node.children || []).forEach((c) => (parent[c] = i)));
  const root = parent.indexOf(-1);
  const b = Float64Array.from(nodes, (node, i) => (parent[i] >= 0 ? Math.max(0, node.x - nodes[parent[i]].x) : 0));
  let t = tau;
  if (!(t > 0)) {
    const leaves = nodes.filter((nd) => nd.isLeaf);
    const mean = leaves.reduce((s, nd) => s + (nd.x - nodes[root].x), 0) / Math.max(1, leaves.length);
    t = mean > 0 ? mean / 16 : 1;
  }
  // post-order (children before parents)
  const order = [];
  const stack = [root];
  while (stack.length) {
    const v = stack.pop();
    order.push(v);
    (nodes[v].children || []).forEach((c) => stack.push(c));
  }
  const D = new Float64Array(n);
  const f = new Float64Array(n);
  for (let k = order.length - 1; k >= 0; k -= 1) {
    const v = order[k];
    let s = 0;
    (nodes[v].children || []).forEach((c) => (s += f[c]));
    D[v] = s;
    const e = Math.exp(-b[v] / t);
    f[v] = t * (1 - e) + e * D[v];
  }
  const U = new Float64Array(n);
  const g = new Float64Array(n);
  order.forEach((v) => {
    if (v === root) g[v] = 0;
    else {
      const e = Math.exp(-b[v] / t);
      g[v] = t * (1 - e) + e * U[v];
    }
    const kids = nodes[v].children || [];
    const total = kids.reduce((s, c) => s + f[c], 0);
    kids.forEach((c) => (U[c] = g[v] + total - f[c]));
  });
  for (let v = 0; v < n; v += 1) out[v] = D[v] + g[v];
  return out;
}

/** LBI of each leaf keyed by leaf id. */
export function leafLbi(layout, tau = null) {
  const lbi = localBranchingIndex(layout, tau);
  const out = {};
  (layout?.nodes || []).forEach((node, i) => {
    if (node.isLeaf) out[`${layout.leaves[node.firstLeaf]}`] = lbi[i];
  });
  return out;
}
