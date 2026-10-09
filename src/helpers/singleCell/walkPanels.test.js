import {
  attachRare,
  subMatrix,
  bestPair,
  carriersByClone,
  changedWalkFilters,
  carriersOf,
  containmentTree,
  defaultFocusWalk,
  foldRareWalks,
  junctionRows,
  rareMaxOf,
  splitRare,
  DEFAULT_RARE_MAX,
  WALK_FILTER_DEFAULTS,
} from "./walkPanels";

const ids = ["a", "b", "c", "d", "e", "f"];
const sEGFR = { id: "s", label: "sEGFR", genes: ["EGFR"], driver_genes: ["EGFR"], nodes: [{}, {}], cells: { a: 40, b: 50, c: 30, d: 20, e: 10 } };
const wEGFR = { id: "w", label: "wEGFR", genes: ["EGFR"], nodes: [{}, {}, {}], cells: { a: 10, b: 1, c: 5, d: 8 } };
const rec1 = { id: "r1", label: "recombine1", genes: [], nodes: [{}], cells: { a: 36 } };
const rec2 = { id: "r2", label: "recombine2", genes: [], nodes: [{}], cells: { b: 27, c: 3 } };
const MAP3K1 = { id: "m", label: "MAP3K1", genes: ["MAP3K1"], nodes: [{}], cells: { e: 13, f: 12 } };

describe("ecDNA panel helpers", () => {
  it("reads the shared threshold from the layout", () => {
    expect(rareMaxOf({})).toBe(DEFAULT_RARE_MAX);
    expect(rareMaxOf({ walkRareMax: 0 })).toBe(0);
    expect(rareMaxOf(null)).toBe(DEFAULT_RARE_MAX);
  });

  it("lists the walk filters changed from their defaults", () => {
    expect(changedWalkFilters({ ...WALK_FILTER_DEFAULTS })).toEqual([]);
    expect(changedWalkFilters({ ...WALK_FILTER_DEFAULTS, minCells: 3, driverOnly: true })).toEqual(["minCells", "driverOnly"]);
    expect(changedWalkFilters(null)).toEqual([]);
  });

  it("counts carriers at a copy threshold", () => {
    expect(carriersOf(wEGFR, ids)).toBe(4);
    expect(carriersOf(wEGFR, ids, 5)).toBe(3);
  });

  it("splits rare walks off by carriers", () => {
    const { common, rare } = splitRare([rec1, wEGFR, sEGFR, rec2], ids, 2);
    expect(common.map((w) => w.id)).toEqual(["s", "w"]);
    expect(rare.map((w) => w.id)).toEqual(["r2", "r1"]);
  });

  it("folds each family's rare walks into one pseudo-walk", () => {
    const out = foldRareWalks([[sEGFR, wEGFR, rec1, rec2], [MAP3K1]], ids, 2);
    expect(out.map((w) => w.id)).toEqual(["s", "w", "rare:0", "m"]);
    const rare = out[2];
    expect(rare.rare).toBe(true);
    expect(rare.label).toBe("rare · EGFR (2)");
    expect(rare.cells).toEqual({ a: 36, b: 27, c: 3 });
    expect(rare.members.map((w) => w.id)).toEqual(["r2", "r1"]);
  });

  it("picks the pair with the most co-carriers, more prevalent walk on x", () => {
    const p = bestPair([rec1, rec2, wEGFR, sEGFR, MAP3K1], ids);
    expect([p.a, p.b]).toEqual(["s", "w"]);
    expect(p.both).toBe(4);
    expect(bestPair([sEGFR], ids)).toBeNull();
  });

  it("builds the containment hierarchy without cycles", () => {
    // 0 longest; 1 inside 0; 2 inside 1 (and 0); 3 unrelated; 4 same length as 1, mutually contained
    const lengths = [100, 50, 20, 40, 50];
    const m = [
      [1, 0.5, 0.2, 0, 0.5],
      [1, 1, 0.4, 0, 1],
      [1, 1, 1, 0, 1],
      [0, 0, 0, 1, 0],
      [1, 1, 0.4, 0, 1],
    ];
    const rows = containmentTree(m, lengths);
    expect(rows.map((r) => [r.index, r.depth])).toEqual([[0, 0], [1, 1], [4, 2], [2, 2], [3, 0]]);
    expect(rows.find((r) => r.index === 4).parent).toBe(1);
    expect(rows.find((r) => r.index === 2).parent).toBe(1);
    expect(rows.find((r) => r.index === 2).share).toBe(1);
  });

  it("summarises carriers per clone", () => {
    const clone = { a: "1", b: "1", c: "2", d: "2", e: "2", f: "3" };
    const rows = carriersByClone(sEGFR, ids, (id) => clone[id]);
    expect(rows).toEqual([
      { clone: "2", n: 3, carriers: 3, median: 20 },
      { clone: "1", n: 2, carriers: 2, median: 45 },
      { clone: "3", n: 1, carriers: 0, median: 0 },
    ]);
  });

  it("lists ALT junctions with breakpoints", () => {
    const walk = {
      nodes: [
        { chromosome: "7", start: 100, end: 2000, strand: "+" },
        { chromosome: "7", start: 5000, end: 9000, strand: "-" },
      ],
      junctions: [{ from: 0, to: 1, type: "ALT" }, { from: 1, to: 0, type: "REF" }],
    };
    expect(junctionRows(walk)).toEqual([{ key: 0, from: "7:2,000+", to: "7:9,000-", span: 7000, via: null }]);
  });

  it("defaults the single-walk card to the best supported walk", () => {
    expect(defaultFocusWalk([rec1, MAP3K1, sEGFR, wEGFR], ids).id).toBe("s");
    expect(defaultFocusWalk([], ids)).toBeNull();
  });

  it("attaches rare walks to the visible walk they overlap most", () => {
    const m = [
      [1, 0.2, 0.9, 0],
      [0.3, 1, 0.1, 0],
      [0.4, 0.6, 1, 0],
      [0, 0, 0, 1],
    ];
    // rare 2 overlaps 0 (0.9 one way) more than 1 (0.6); rare 3 overlaps nothing
    const a = attachRare(m, [2, 3], [0, 1]);
    expect(a.get(0)).toEqual([2]);
    expect(a.get(-1)).toEqual([3]);
    expect(subMatrix(m, [2, 0])).toEqual([[1, 0.4], [0.9, 1]]);
  });
});
