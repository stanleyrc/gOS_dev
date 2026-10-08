import { sitesSeenInRows } from "./snvSites";
import { mannWhitney } from "./tests";

/**
 * SNV sites gained on each branch of the tree: sites with alt reads in the
 * clade below the branch but in none of its sibling clades (truncal sites
 * excluded). Returns Map(nodeIndex -> { gained: number[], cells }).
 * `rows[r]` is the matrix row of the r-th leaf (−1 when the cell has no row).
 */
export function branchGains(layout, snv, rows, { minCells = 1 } = {}) {
  const seenOf = new Map();
  const seen = (node) => {
    if (!seenOf.has(node)) {
      const n = layout.nodes[node];
      const list = [];
      for (let r = n.firstLeaf; r <= n.lastLeaf; r += 1) if (rows[r] >= 0) list.push(rows[r]);
      seenOf.set(node, sitesSeenInRows(snv, list));
    }
    return seenOf.get(node);
  };
  const out = new Map();
  layout.nodes.forEach((n, id) => {
    if (n.parent < 0) return;
    const cells = n.lastLeaf - n.firstLeaf + 1;
    if (cells < minCells) return;
    const mine = seen(id);
    const siblings = layout.nodes[n.parent].children.filter((c) => c !== id);
    const gained = [...mine].filter((c) => snv.variants[c]?.category !== "truncal" && siblings.every((s) => !seen(s).has(c)));
    out.set(id, { gained, cells });
  });
  return out;
}

const median = (xs) => {
  const s = xs.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!s.length) return NaN;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/**
 * Per-cell mutation rate (e.g. private SNVs per callable Mb) inside a clade
 * against the rest of the tree: medians, fold change and Mann-Whitney p.
 */
export function cladeRateTest(values, inClade) {
  const a = [];
  const b = [];
  values.forEach((v, i) => {
    if (!Number.isFinite(v)) return;
    (inClade[i] ? a : b).push(v);
  });
  if (a.length < 3 || b.length < 3) return { nIn: a.length, nOut: b.length, medianIn: median(a), medianOut: median(b), fold: NaN, p: NaN };
  const mIn = median(a);
  const mOut = median(b);
  const { p } = mannWhitney(a, b);
  return { nIn: a.length, nOut: b.length, medianIn: mIn, medianOut: mOut, fold: mOut > 0 ? mIn / mOut : mIn > 0 ? Infinity : 1, p };
}

/** Private (single-cell) SNV sites with alt reads per matrix row. */
export function privateCountsPerRow(snv) {
  const isPrivate = snv.variants.map((v) => v.category === "private");
  return snv.status.map((status) => {
    let n = 0;
    for (let c = 0; c < status.length; c += 1) if (status[c] === 1 && isPrivate[c]) n += 1;
    return n;
  });
}
