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
