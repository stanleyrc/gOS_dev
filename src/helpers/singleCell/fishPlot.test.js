import { fishBands, fishClades } from "./fishPlot";

// root(0,x0) -> [n1 (x1) -> leaves a b c d ; n2 (x2) -> leaves e f] ; plus outgroup leaf "N" under the root
const layout = {
  leaves: ["N", "a", "b", "c", "d", "e", "f"],
  nodes: [
    { isLeaf: false, x: 0, children: [1, 2], firstLeaf: 0, lastLeaf: 6 },
    { isLeaf: true, x: 5, children: [], firstLeaf: 0, lastLeaf: 0 },
    { isLeaf: false, x: 1, children: [3, 4], firstLeaf: 1, lastLeaf: 6 },
    { isLeaf: false, x: 2, children: [5, 6, 7, 8], firstLeaf: 1, lastLeaf: 4 },
    { isLeaf: false, x: 3, children: [9, 10], firstLeaf: 5, lastLeaf: 6 },
    ...["a", "b", "c", "d", "e", "f"].map((_, i) => ({ isLeaf: true, x: 4, children: [], firstLeaf: i + 1, lastLeaf: i + 1 })),
  ],
};
// fix children indices of n1 / n2 to the leaf nodes 5..10
layout.nodes[3].children = [5, 6, 7, 8];
layout.nodes[4].children = [9, 10];

describe("fish plot", () => {
  const cloneOf = new Map([["a", "C1"], ["b", "C1"], ["c", "C1"], ["d", "C2"], ["e", "C2"], ["f", "C2"]]);

  it("roots at the MRCA of the tumour cells and nests clades", () => {
    const cl = fishClades(layout, cloneOf, { exclude: new Set(["N"]), minCells: 2, minFrac: 0.2 });
    expect(cl.map((c) => [c.node, c.parent, c.n])).toEqual([
      [2, -1, 6],
      [3, 0, 4],
      [4, 0, 2],
    ]);
    expect(cl[1]).toMatchObject({ start: 1, end: 2, clone: "C1" });
    expect(cl[0].frac).toBe(1);
  });

  it("drops small clades and places bands inside their parent", () => {
    const cl = fishClades(layout, cloneOf, { exclude: new Set(["N"]), minCells: 3, minFrac: 0.2 });
    expect(cl.map((c) => c.node)).toEqual([2, 3]);
    const b = fishBands(cl);
    expect(b[0]).toEqual([0, 1]);
    expect(b[1][1] - b[1][0]).toBeCloseTo(4 / 6);
    expect(b[1][0]).toBeCloseTo((1 - 4 / 6) / 2);
  });

  it("handles empty input", () => {
    expect(fishClades(null)).toEqual([]);
    expect(fishBands([])).toEqual([]);
  });
});
