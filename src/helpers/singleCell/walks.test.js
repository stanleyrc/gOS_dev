import { filterWalks, spearman, walkCombinations, walkGenes, walkStats } from "./walks";

const walks = [
  { id: "a", circular: true, curated: true, driver_genes: ["EGFR"], cells: { c1: 40, c2: 60, c3: 2 }, nodes: [{ chromosome: "7", start: 100, end: 200, strand: "+" }] },
  { id: "b", circular: true, curated: false, driver_genes: [], cells: { c1: 10 }, nodes: [] },
  { id: "c", circular: false, curated: false, driver_genes: [], cells: { c4: 1 }, nodes: [] },
];
const cells = ["c1", "c2", "c3", "c4"];

describe("walks", () => {
  it("computes stats and filters", () => {
    expect(walkStats(walks[0], cells)).toEqual({ ncells: 3, fraction: 0.75, medianCn: 40, maxCn: 60, totalCn: 102 });
    expect(filterWalks(walks, cells, { minCells: 1, minMedianCn: 4 }).map((w) => w.id)).toEqual(["a", "b"]);
    expect(filterWalks(walks, cells, { minCells: 1, minMedianCn: 0, curatedOnly: true }).map((w) => w.id)).toEqual(["a"]);
  });
  it("counts co-occurrence combinations", () => {
    const combos = walkCombinations(walks, cells, 5);
    expect(combos[0]).toMatchObject({ walks: [], n: 2 });
    expect(combos.find((c) => c.walks.join() === "a,b").n).toBe(1);
  });
  it("finds genes on nodes and ranks correlations", () => {
    const chromoBins = { 7: { startPlace: 1000, startPoint: 1 } };
    const genes = [{ name: "EGFR", start: 1150, end: 1180 }, { name: "FAR", start: 5000, end: 6000 }];
    expect(walkGenes(walks[0], genes, chromoBins).map((g) => g.name)).toEqual(["EGFR"]);
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1);
  });
});
