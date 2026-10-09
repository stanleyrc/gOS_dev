import { patientTreeStats, sackin, yuleSackin } from "./treeShape";

// caterpillar ((((a,b),c),d)) vs balanced ((a,b),(c,d)); plus outgroup N under the root in the caterpillar
const caterpillar = {
  leaves: ["N", "a", "b", "c", "d"],
  nodes: [
    { isLeaf: false, x: 0, children: [1, 2], firstLeaf: 0, lastLeaf: 4 },
    { isLeaf: true, x: 1, children: [], firstLeaf: 0, lastLeaf: 0 },
    { isLeaf: false, x: 1, children: [3, 8], firstLeaf: 1, lastLeaf: 4 },
    { isLeaf: false, x: 2, children: [4, 7], firstLeaf: 1, lastLeaf: 3 },
    { isLeaf: false, x: 3, children: [5, 6], firstLeaf: 1, lastLeaf: 2 },
    { isLeaf: true, x: 4, children: [], firstLeaf: 1, lastLeaf: 1 },
    { isLeaf: true, x: 4, children: [], firstLeaf: 2, lastLeaf: 2 },
    { isLeaf: true, x: 4, children: [], firstLeaf: 3, lastLeaf: 3 },
    { isLeaf: true, x: 4, children: [], firstLeaf: 4, lastLeaf: 4 },
  ],
};
const balanced = {
  leaves: ["a", "b", "c", "d"],
  nodes: [
    { isLeaf: false, x: 0, children: [1, 2], firstLeaf: 0, lastLeaf: 3 },
    { isLeaf: false, x: 1, children: [3, 4], firstLeaf: 0, lastLeaf: 1 },
    { isLeaf: false, x: 1, children: [5, 6], firstLeaf: 2, lastLeaf: 3 },
    ...[0, 1, 2, 3].map((i) => ({ isLeaf: true, x: 2, children: [], firstLeaf: i, lastLeaf: i })),
  ],
};
const tumour = new Set(["a", "b", "c", "d"]);

describe("tree shape", () => {
  it("computes Sackin within the tumour MRCA", () => {
    expect(sackin(caterpillar, tumour)).toEqual({ sackin: 3 + 3 + 2 + 1, n: 4 });
    expect(sackin(balanced, tumour)).toEqual({ sackin: 8, n: 4 });
    expect(yuleSackin(4)).toBeCloseTo(2 * 4 * (1 / 2 + 1 / 3 + 1 / 4));
  });

  it("summarises SNV categories, imbalance and copy-number events", () => {
    const s = patientTreeStats({
      layout: caterpillar,
      tumourIds: tumour,
      variants: [{ category: "truncal" }, { category: "truncal" }, { category: "subclonal" }, { category: "private" }, { category: "outside_tumor" }],
      events: [
        { type: "SCNA", cell_fraction: 1, n_cells: 4 },
        { type: "SCNA", cell_fraction: 0.25, n_cells: 1 },
        { type: "Missense", cell_fraction: 0.5 },
      ],
    });
    expect(s).toMatchObject({ nCells: 4, nSnv: 4, trunkFrac: 0.5, privateFrac: 0.25, nScna: 2, scnaSubclonalFrac: 0.5, scnaPrivate: 1 });
    expect(s.sackinNorm).toBeGreaterThan(sackin(balanced, tumour).sackin / yuleSackin(4));
  });
});
