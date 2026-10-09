import { bh, heritabilityLabel, leafDistances, moranI, moranPermutation, pUpper, signalTable, treeWeights } from "./heritability";

// ((a:1,b:1):4,(c:1,d:1):4) with two extra leaves per clade:
// leaves 0-3 in clade L, 4-7 in clade R; depths x = 5 for every leaf.
function twoCladeLayout() {
  const leaves = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const nodes = [
    { isLeaf: false, x: 0, children: [1, 2], firstLeaf: 0, lastLeaf: 7 },
    { isLeaf: false, x: 4, children: [3, 4, 5, 6], firstLeaf: 0, lastLeaf: 3 },
    { isLeaf: false, x: 4, children: [7, 8, 9, 10], firstLeaf: 4, lastLeaf: 7 },
  ];
  leaves.forEach((_, i) => nodes.push({ isLeaf: true, x: 5, children: [], firstLeaf: i, lastLeaf: i }));
  return { leaves, nodes };
}

describe("heritability", () => {
  const layout = twoCladeLayout();

  it("computes patristic distances", () => {
    const D = leafDistances(layout);
    const n = 8;
    expect(D[0 * n + 1]).toBeCloseTo(2);
    expect(D[0 * n + 4]).toBeCloseTo(10);
    expect(D[0]).toBe(0);
  });

  it("finds strong signal for a clade-aligned value and none for an alternating one", () => {
    const w = treeWeights(layout, layout.leaves);
    expect(w.n).toBe(8);
    const clade = [1, 1.1, 0.9, 1, 5, 5.1, 4.9, 5];
    const r = moranI(clade, w);
    expect(r.I).toBeGreaterThan(0.5);
    expect(r.z).toBeGreaterThan(2);
    expect(r.p).toBeLessThan(0.05);
    const alt = [1, 5, 1, 5, 1, 5, 1, 5];
    const r2 = moranI(alt, w);
    expect(r2.I).toBeLessThan(r.I);
    expect(r2.p).toBeGreaterThan(0.2);
    const perm = moranPermutation(clade, w, { nPerm: 199, seed: 3 });
    expect(perm.p).toBeLessThan(0.05);
    expect(moranPermutation(clade, w, { nPerm: 199, seed: 3 }).p).toBe(perm.p);
  });

  it("drops ids missing from the tree and imputes missing values", () => {
    const w = treeWeights(layout, ["a", "b", "zz", "c", "d", "e", "f", "g", "h"]);
    expect(w.ids).not.toContain("zz");
    const r = moranI([1, 1, NaN, 1, 5, 5, 5, 5], w);
    expect(Number.isFinite(r.I)).toBe(true);
    expect(treeWeights(layout, ["a", "b"])).toBeNull();
  });

  it("adjusts p-values and labels rows", () => {
    expect(bh([0.01, 0.04, NaN, 0.03])).toEqual([0.03, 0.04, NaN, 0.04]);
    expect(pUpper(0)).toBeCloseTo(0.5);
    expect(pUpper(1.6449)).toBeCloseTo(0.05, 3);
    const w = treeWeights(layout, layout.leaves);
    const rows = signalTable(w, [
      { key: "clade", values: { a: 1, b: 1, c: 1, d: 1, e: 5, f: 5, g: 5, h: 5 } },
      { key: "alt", values: (id) => ({ a: 1, b: 5, c: 1, d: 5, e: 1, f: 5, g: 1, h: 5 }[id]) },
    ]);
    expect(rows.map((r) => r.key)).toEqual(["clade", "alt"]);
    expect(heritabilityLabel(rows[0])).toBe("heritable");
    expect(heritabilityLabel(rows[1])).toBe("plastic / none");
    expect(heritabilityLabel(null)).toBe("n/a");
  });
});
