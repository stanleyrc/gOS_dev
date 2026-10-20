import { columnBins, groupedColumnBins, treeColumnOrder } from "./matrix";
import { layoutTree, parseNewick } from "./newick";

// Synthetic fixtures only.
function randomTree(nLeaves, seed) {
  let x = seed;
  const rnd = () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
  let nodes = Array.from({ length: nLeaves }, (_, i) => `t${i}:1`);
  while (nodes.length > 1) {
    const i = Math.floor(rnd() * nodes.length);
    const a = nodes.splice(i, 1)[0];
    const j = Math.floor(rnd() * nodes.length);
    const b = nodes.splice(j, 1)[0];
    nodes.push(`(${a},${b}):1`);
  }
  return { newick: `${nodes[0]};`, rnd };
}

// the previous implementation (every node tested for every site), kept here as the reference
function referenceOrder(snv, layout, rows) {
  const nVar = snv.variants.length;
  const nLeaves = layout.leaves.length;
  const carriers = Array.from({ length: nVar }, () => []);
  const covered = Array.from({ length: nVar }, () => []);
  for (let r = 0; r < nLeaves; r += 1) {
    const st = snv.status[rows[r]];
    for (let c = 0; c < nVar; c += 1) {
      if (st[c] >= 0) covered[c].push(r);
      if (st[c] === 1) carriers[c].push(r);
    }
  }
  const countIn = (arr, lo, hi) => arr.filter((v) => v >= lo && v <= hi).length;
  const nodes = layout.nodes.filter((n) => n.lastLeaf > n.firstLeaf || n.isLeaf);
  const rank = new Map();
  [...nodes].sort((a, b) => a.firstLeaf - b.firstLeaf || b.lastLeaf - a.lastLeaf).forEach((n, k) => rank.set(n, k));
  const placement = new Int32Array(nVar); // as the original (sites without carriers wrap to -1 and sort first)
  const prevalence = new Float64Array(nVar);
  for (let c = 0; c < nVar; c += 1) {
    const nCarry = carriers[c].length;
    prevalence[c] = covered[c].length ? nCarry / covered[c].length : 0;
    if (!nCarry) {
      placement[c] = Number.MAX_SAFE_INTEGER;
      continue;
    }
    let best = null;
    let bestScore = -1;
    nodes.forEach((n) => {
      const inside = countIn(carriers[c], n.firstLeaf, n.lastLeaf);
      if (!inside) return;
      const cov = countIn(covered[c], n.firstLeaf, n.lastLeaf);
      const p = inside / nCarry;
      const r = cov ? inside / cov : 0;
      const f1 = (2 * p * r) / (p + r || 1);
      if (f1 > bestScore + 1e-12 || (Math.abs(f1 - bestScore) <= 1e-12 && rank.get(n) < rank.get(best))) {
        bestScore = f1;
        best = n;
      }
    });
    placement[c] = best ? rank.get(best) : Number.MAX_SAFE_INTEGER;
  }
  return snv.variants.map((v) => v.index).sort((a, b) => placement[a] - placement[b] || prevalence[b] - prevalence[a] || a - b);
}

describe("SNV matrix at scale", () => {
  it("tree column order matches the every-node reference on random trees", () => {
    [3, 7, 11].forEach((seed) => {
      const { newick, rnd } = randomTree(40, seed);
      const layout = layoutTree(parseNewick(newick));
      const nVar = 300;
      const ids = layout.leaves;
      const status = ids.map(() => Int8Array.from({ length: nVar }, () => (rnd() < 0.2 ? -1 : rnd() < 0.15 ? 1 : 0)));
      const snv = { variants: Array.from({ length: nVar }, (_, index) => ({ index, id: `v${index}` })), status, alt: [], depth: [] };
      const rows = Int32Array.from(ids, (_, k) => k);
      const got = treeColumnOrder(snv, layout, rows);
      const ref = referenceOrder(snv, layout, rows);
      expect(got).toEqual(ref);
    });
  });

  it("grouped bins never straddle branches and keep small branches visible", () => {
    const keys = [...Array(1000).fill("A"), ...Array(3).fill("B"), ...Array(997).fill("C")];
    const bins = groupedColumnBins(keys, 100);
    expect(bins.grouped).toBe(true);
    const groupsOfBin = [];
    for (let x = 0; x < 100; x += 1) {
      const g = new Set(keys.slice(bins.binStart[x], bins.binEnd[x]));
      expect(g.size).toBe(1);
      groupsOfBin.push([...g][0]);
    }
    expect(groupsOfBin.filter((g) => g === "B").length).toBeGreaterThanOrEqual(1);
    // every site is in exactly one bin, in order
    let next = 0;
    for (let x = 0; x < 100; x += 1) {
      if (bins.binEnd[x] - bins.binStart[x] >= 1 && bins.binStart[x] >= next) {
        expect(bins.binStart[x]).toBe(next);
        next = bins.binEnd[x];
      }
    }
    expect(next).toBe(2000);
  });

  it("grouped bins fall back to plain bins when zoomed in or with too many groups", () => {
    const keys = ["A", "A", "B"];
    expect(groupedColumnBins(keys, 10)).toEqual(columnBins(3, 10));
    const many = Array.from({ length: 50 }, (_, i) => `g${i}`);
    expect(groupedColumnBins(many, 20)).toEqual(columnBins(50, 20));
  });
});
