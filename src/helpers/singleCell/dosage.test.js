import { pearson, spearman, slope, geneLocus } from "./dosage";

describe("dosage statistics", () => {
  it("correlates", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 1000])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1);
    expect(Number.isNaN(pearson([1, 1, 1], [1, 2, 3]))).toBe(true);
  });
  it("fits a slope", () => expect(slope([1, 2, 3], [3, 5, 7])).toBeCloseTo(2));
  it("finds a gene locus", () => {
    const genes = { optionsList: [{ label: "EGFR", value: 0 }], genesStartPoint: [100], genesEndPoint: [200] };
    expect(geneLocus(genes, "egfr")).toEqual({ gene: "EGFR", start: 100, end: 200, mid: 150 });
    expect(geneLocus(genes, "TP53")).toBeNull();
  });
});

describe("dosageByChromosome", () => {
  it("summarises rho per chromosome", () => {
    const { dosageByChromosome } = require("./dosage");
    const genesState = { optionsList: [{ label: "A", value: 0 }, { label: "B", value: 1 }, { label: "C", value: 2 }], genesStartPoint: [10, 20, 1010], genesEndPoint: [12, 22, 1012] };
    const chromoBins = { 1: { startPlace: 1, endPlace: 1000 }, 2: { startPlace: 1001, endPlace: 2000 } };
    const out = dosageByChromosome([{ gene: "A", rho: 0.6 }, { gene: "B", rho: 0.1 }, { gene: "C", rho: 0.4 }], genesState, chromoBins);
    expect(out).toEqual([
      { chromosome: "1", n: 2, medianRho: 0.35, fracSensitive: 0.5 },
      { chromosome: "2", n: 1, medianRho: 0.4, fracSensitive: 1 },
    ]);
  });
});
