// Fish (Muller-style) plot of one sample's clonal structure along molecular
// time: clades of the DNA tree with >= minFrac of the tumour cells, nested by
// ancestry. x = tree depth (SNV-scaled branch lengths) at which the clade's
// founding branch ends; band height = the clade's share of tumour cells at
// sampling. With one time point the bands do not shrink or grow afterwards,
// so this shows order and nesting, not dynamics. d3-free for tests.

/**
 * Clades to draw: [{ node, parent (index into the result or -1), start, end,
 * n, frac, cells, clone }] in pre-order. `exclude` = leaf ids to leave out
 * (normal cells); the root is the MRCA of the remaining leaves. Clades with
 * >= maxOfParent of their drawn parent's cells are folded into the parent.
 */
export function fishClades(layout, cloneOf = new Map(), { minFrac = 0.05, minCells = 3, exclude = new Set(), maxOfParent = 0.85 } = {}) {
  if (!layout?.nodes?.length) return [];
  const leafOk = layout.leaves.map((id) => !exclude.has(`${id}`));
  const nIn = (n) => {
    let k = 0;
    for (let i = n.firstLeaf; i <= n.lastLeaf; i += 1) if (leafOk[i]) k += 1;
    return k;
  };
  const total = leafOk.filter(Boolean).length;
  if (!total) return [];
  // MRCA of the kept leaves: descend while one child holds them all
  let rootIdx = 0;
  for (;;) {
    const node = layout.nodes[rootIdx];
    const full = (node.children || []).find((c) => nIn(layout.nodes[c]) === total);
    if (full == null) break;
    rootIdx = full;
  }
  const out = [];
  const majority = (n) => {
    const m = new Map();
    for (let i = n.firstLeaf; i <= n.lastLeaf; i += 1) {
      if (!leafOk[i]) continue;
      const c = cloneOf.get(`${layout.leaves[i]}`) ?? "unassigned";
      m.set(c, (m.get(c) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  const visit = (idx, parentOut, parentX) => {
    const node = layout.nodes[idx];
    const n = nIn(node);
    // a clade holding nearly all of its drawn parent's cells adds a band of the same shape: fold it into the parent
    const parentN = parentOut >= 0 ? out[parentOut].n : total;
    const keep = idx === rootIdx || (!node.isLeaf && n >= minCells && n / total >= minFrac && n / parentN < maxOfParent);
    let here = parentOut;
    if (keep) {
      out.push({ node: idx, parent: parentOut, start: idx === rootIdx ? node.x : parentX, end: node.x, n, frac: n / total, clone: majority(node) });
      here = out.length - 1;
    }
    (node.children || []).forEach((c) => visit(c, here, node.x));
  };
  visit(rootIdx, -1, layout.nodes[rootIdx].x);
  return out;
}

/**
 * Vertical placement: each clade's band [y0, y1] in [0, 1] at sampling, nested
 * inside its parent's band and centred like a fish plot (children share the
 * parent's band in proportion to their size, centred within it).
 */
export function fishBands(clades) {
  const kids = clades.map(() => []);
  clades.forEach((c, i) => c.parent >= 0 && kids[c.parent].push(i));
  const band = clades.map(() => [0, 1]);
  const place = (i, y0, y1) => {
    band[i] = [y0, y1];
    const k = kids[i];
    if (!k.length) return;
    const parentN = clades[i].n;
    const used = k.reduce((s, j) => s + clades[j].n, 0);
    const h = y1 - y0;
    // children packed in the middle of the parent, the parent's own remainder above and below
    let y = y0 + (h * (1 - used / parentN)) / 2;
    k.forEach((j) => {
      const hj = (h * clades[j].n) / parentN;
      place(j, y, y + hj);
      y += hj;
    });
  };
  const roots = clades.map((c, i) => (c.parent < 0 ? i : -1)).filter((i) => i >= 0);
  roots.forEach((r) => place(r, 0, 1));
  return band;
}
