// How well a set of carrier cells follows the tree: the best F1 between the
// carriers and any clade (internal node or leaf) of the displayed tree.
// 1 = the carriers are exactly one clade; values near 0 = scattered cells
// (typical of noisy junction / deletion calls).

/**
 * @param carrierIds cell ids carrying the event
 * @param layout tree layout ({ nodes, leaves })
 * @returns { score, node, clade: number of leaves in the best clade, inClade, carriers }
 */
export function cladeFitScore(carrierIds, layout) {
  if (!layout || !layout.leaves?.length) return { score: NaN, node: null, clade: 0, inClade: 0, carriers: 0 };
  const row = new Map(layout.leaves.map((id, i) => [id, i]));
  const rows = [...new Set(carrierIds)].map((id) => row.get(id)).filter((r) => r != null).sort((a, b) => a - b);
  const carriers = rows.length;
  if (!carriers) return { score: NaN, node: null, clade: 0, inClade: 0, carriers: 0 };
  // prefix counts of carriers over leaf order: carriers in [a, b] = P[b+1] - P[a]
  const P = new Int32Array(layout.leaves.length + 1);
  let k = 0;
  for (let i = 0; i < layout.leaves.length; i += 1) {
    if (k < rows.length && rows[k] === i) k += 1;
    P[i + 1] = k;
  }
  let best = { score: -1, node: null, clade: 0, inClade: 0 };
  layout.nodes.forEach((n, id) => {
    const size = n.lastLeaf - n.firstLeaf + 1;
    const inClade = P[n.lastLeaf + 1] - P[n.firstLeaf];
    if (!inClade) return;
    const f1 = (2 * inClade) / (size + carriers);
    if (f1 > best.score) best = { score: f1, node: id, clade: size, inClade };
  });
  return { ...best, carriers };
}

/** Clade-fit scores for filtered events (keyed by uid or index), memo-friendly. */
export function eventCladeScores(events, layout) {
  const out = new Map();
  (events || []).forEach((e, i) => {
    const ids = `${e.cell_ids || ""}`.split(",").filter(Boolean);
    out.set(e.uid ?? i, cladeFitScore(ids, layout));
  });
  return out;
}
