import { cellClockBurden, cladeClockTiming, clockSites, mrcaTiming, placeByCladeSize } from "./timing";

// 4 truncal sites (0-3), 2 subclonal (4,5), 2 private (6,7); signatures: clock at 0,1,4,6
const snv = {
  variants: [
    { category: "truncal" },
    { category: "truncal" },
    { category: "truncal" },
    { category: "truncal" },
    { category: "subclonal" },
    { category: "subclonal" },
    { category: "private" },
    { category: "private" },
  ],
  status: [
    [1, 1, 1, 1, 1, 0, 1, 0], // full sensitivity, 2 post-trunk clock (4, 6)
    [1, 1, 0, 0, 1, 1, 0, 1], // sensitivity 0.5, 1 post-trunk clock (4) -> corrected 2
  ],
};
const signatureOf = ["SBS1", "SBS5", "SBS3", null, "SBS1", "SBS11", "SBS5", "SBS11"];

describe("clock timing", () => {
  it("selects clock-like sites", () => {
    expect(clockSites(signatureOf)).toEqual([0, 1, 4, 6]);
  });

  it("corrects per-cell clock burden for dropout and times the MRCA", () => {
    const clock = clockSites(signatureOf);
    const b = cellClockBurden(snv, [0, 1, -1], clock);
    expect(b[2]).toBeNull();
    expect(b[0]).toMatchObject({ sensitivity: 1, postClock: 2, postClockCorrected: 2 });
    expect(b[1]).toMatchObject({ sensitivity: 0.5, postClock: 1, postClockCorrected: 2 });
    const m = mrcaTiming(snv, clock, b);
    expect(m).toMatchObject({ truncalClock: 2, postClockMedian: 2 });
    expect(m.mrcaFraction).toBeCloseTo(0.5);
  });

  it("places clade founding on the clock scale", () => {
    // root(0) -> A(1) -> leaf(2); gains on node 1: sites 4, 5 (one clock)
    const layout = { nodes: [{ parent: -1 }, { parent: 0 }, { parent: 1 }] };
    const gains = new Map([[1, { gained: [4, 5], cells: 2 }]]);
    const r = cladeClockTiming(layout, gains, clockSites(signatureOf), { truncalClock: 2, postClockMedian: 2 });
    expect(r[0]).toMatchObject({ node: 1, gained: 2, clockGained: 1, clockFraction: 0.5, cumulativeClock: 1 });
    expect(r[0].foundedAt).toBeCloseTo(0.75);
  });

  it("places subclonal sites by clade size, breaking ties by alt cells", () => {
    // root(0) -> A(1: leaves 0,1) , B(2: leaves 2,3); both clades have 2 cells
    const layout = {
      nodes: [
        { isLeaf: false, children: [1, 2], firstLeaf: 0, lastLeaf: 3 },
        { isLeaf: false, children: [], firstLeaf: 0, lastLeaf: 1 },
        { isLeaf: false, children: [], firstLeaf: 2, lastLeaf: 3 },
      ],
    };
    const s = {
      variants: [{ category: "subclonal", clade_cells: 2 }, { category: "subclonal", clade_cells: 4 }, { category: "truncal", clade_cells: 4 }],
      status: [
        [0, 1, 1],
        [0, 1, 1],
        [1, 1, 1],
        [1, 0, 1],
      ],
    };
    const out = placeByCladeSize(layout, s, [0, 1, 2, 3]);
    expect(out.get(2)).toEqual([0]);
    expect(out.get(0)).toEqual([1]);
    expect(out.has(1)).toBe(false);
  });
});
