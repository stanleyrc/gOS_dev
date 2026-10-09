import { leafLbi, localBranchingIndex } from "./treeFitness";

// root(x0) -> A(x1) -> leaves a1..a4 (x2) ; root -> b (x2) single long branch
const layout = {
  leaves: ["a1", "a2", "a3", "a4", "b"],
  nodes: [
    { isLeaf: false, x: 0, children: [1, 6], firstLeaf: 0, lastLeaf: 4 },
    { isLeaf: false, x: 1, children: [2, 3, 4, 5], firstLeaf: 0, lastLeaf: 3 },
    { isLeaf: true, x: 1.2, children: [], firstLeaf: 0, lastLeaf: 0 },
    { isLeaf: true, x: 1.2, children: [], firstLeaf: 1, lastLeaf: 1 },
    { isLeaf: true, x: 1.2, children: [], firstLeaf: 2, lastLeaf: 2 },
    { isLeaf: true, x: 1.2, children: [], firstLeaf: 3, lastLeaf: 3 },
    { isLeaf: true, x: 1.2, children: [], firstLeaf: 4, lastLeaf: 4 },
  ],
};

describe("local branching index", () => {
  it("is larger in bushy clades than on a lone long branch", () => {
    const l = leafLbi(layout, 0.2);
    expect(l.a1).toBeGreaterThan(l.b);
    expect(l.a1).toBeCloseTo(l.a4);
  });

  it("matches the brute-force sum on a two-leaf tree", () => {
    // root -> x (b=1), root -> y (b=1); LBI(x) = tau(1-e^{-1/tau}) [own branch] + e^{-1/tau} * tau(1-e^{-1/tau}) [y's branch]
    const two = {
      leaves: ["x", "y"],
      nodes: [
        { isLeaf: false, x: 0, children: [1, 2], firstLeaf: 0, lastLeaf: 1 },
        { isLeaf: true, x: 1, children: [], firstLeaf: 0, lastLeaf: 0 },
        { isLeaf: true, x: 1, children: [], firstLeaf: 1, lastLeaf: 1 },
      ],
    };
    const tau = 0.5;
    const e = Math.exp(-1 / tau);
    const want = tau * (1 - e) + e * tau * (1 - e);
    expect(localBranchingIndex(two, tau)[1]).toBeCloseTo(want);
    expect(localBranchingIndex({ nodes: [] }).length).toBe(0);
  });
});
