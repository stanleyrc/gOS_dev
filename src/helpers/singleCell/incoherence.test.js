import { amplifiedSegments, ecdnaLike, segmentIncoherence } from "./incoherence";
import { buildBinIndex } from "./matrix";

const chromoBins = { 1: { startPlace: 1, endPlace: 10e6 } };
const row = (segs) => ({
  binIndex: buildBinIndex({ chromosome: segs.map((s) => s[0]), start: segs.map((s) => s[1]), end: segs.map((s) => s[2]) }, chromoBins),
  values: Float32Array.from(segs.map((s) => s[3])),
});

// two clades of 4 leaves (a*, b*); depths 2 for leaves, clades at 1
const leaves = ["a1", "a2", "a3", "a4", "b1", "b2", "b3", "b4"];
const layout = {
  leaves,
  nodes: [
    { isLeaf: false, x: 0, children: [1, 2], firstLeaf: 0, lastLeaf: 7 },
    { isLeaf: false, x: 1, children: [3, 4, 5, 6], firstLeaf: 0, lastLeaf: 3 },
    { isLeaf: false, x: 1, children: [7, 8, 9, 10], firstLeaf: 4, lastLeaf: 7 },
    ...leaves.map((_, i) => ({ isLeaf: true, x: 2, children: [], firstLeaf: i, lastLeaf: i })),
  ],
};

describe("phylogenetic incoherence", () => {
  it("finds amplified segments and their per-cell copies", () => {
    const cn = {
      cells: ["a1", "a2"],
      rows: [row([["1", 0, 2e6, 2], ["1", 2e6, 3e6, 20], ["1", 3e6, 10e6, 2]]), row([["1", 0, 10e6, 2]])],
    };
    const segs = amplifiedSegments(cn, chromoBins, { step: 250e3, ampCn: 6, minCellFrac: 0.5 });
    expect(segs).toHaveLength(1);
    expect(segs[0].start).toBeCloseTo(2e6, -5);
    expect(segs[0].values.get("a1")).toBe(20);
    expect(segs[0].values.get("a2")).toBe(2);
  });

  it("scores inherited copy number as coherent and random copies as incoherent", () => {
    const inherited = new Map(leaves.map((id) => [id, id.startsWith("a") ? 20 : 4]));
    const s1 = segmentIncoherence(layout, inherited, leaves);
    expect(s1.nnRatio).toBeLessThan(0.1);
    expect(s1.moranI).toBeGreaterThan(0.1); // inverse-distance weights are mild on a shallow tree
    expect(ecdnaLike(s1)).toBe(false);
    // alternating within clades: neighbours differ as much as anyone
    const random = new Map(leaves.map((id, i) => [id, i % 2 ? 40 : 4]));
    const s2 = segmentIncoherence(layout, random, leaves);
    expect(s2.nnRatio).toBeGreaterThan(0.7);
    expect(s2.cv).toBeGreaterThan(0.5);
    expect(ecdnaLike(s2)).toBe(true);
    expect(segmentIncoherence(layout, inherited, ["a1"])).toBeNull();
  });
});
