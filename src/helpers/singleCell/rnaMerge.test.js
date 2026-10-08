import { fisherCombined, geneVariances, mergeRnaMatrices, subsetCells } from "./rnaMerge";
import { chiSquareUpper } from "./tests";

const csc = (cols) => {
  // cols: per gene, [[cell, value], ...]
  const indptr = [0];
  const indices = [];
  const data = [];
  cols.forEach((c) => {
    c.forEach(([i, v]) => {
      indices.push(i);
      data.push(v);
    });
    indptr.push(indices.length);
  });
  return { indptr: Int32Array.from(indptr), indices: Int32Array.from(indices), data: Float32Array.from(data) };
};

describe("rnaMerge", () => {
  const a = { matrix: csc([[[0, 1], [1, 2]], [[1, 3]]]), genes: ["EGFR", "PTEN"], nCells: 2 };
  const b = { matrix: csc([[[0, 5]], [[2, 7]]]), genes: ["PTEN", "CDK4"], nCells: 3 };
  it("merges by gene name with cell offsets", () => {
    const m = mergeRnaMatrices([a, b]);
    expect(m.genes).toEqual(["EGFR", "PTEN", "CDK4"]);
    expect(m.nCells).toBe(5);
    expect(m.offsets).toEqual([0, 2]);
    const pten = m.geneIndex.get("PTEN");
    const entries = [];
    for (let k = m.matrix.indptr[pten]; k < m.matrix.indptr[pten + 1]; k += 1) entries.push([m.matrix.indices[k], m.matrix.data[k]]);
    expect(entries).toEqual([[1, 3], [2, 5]]);
    const cdk4 = m.geneIndex.get("CDK4");
    expect(m.matrix.indices[m.matrix.indptr[cdk4]]).toBe(4);
  });
  it("computes variances and subsets cells", () => {
    const m = mergeRnaMatrices([a, b]);
    const v = geneVariances(m.matrix, m.genes.length, [0, 1, 2, 3, 4]);
    expect(v[0]).toBeCloseTo(0.8, 5); // EGFR: 1,2,0,0,0 (sample variance)
    const s = subsetCells(m.matrix, m.genes.length, [1, 4]);
    expect(Array.from(s.indptr)).toEqual([0, 1, 2, 3]);
    expect(Array.from(s.indices)).toEqual([0, 0, 1]);
  });
  it("combines p-values", () => {
    expect(fisherCombined([0.01, 0.01], chiSquareUpper)).toBeLessThan(0.01);
    expect(fisherCombined([0.5, 0.5], chiSquareUpper)).toBeGreaterThan(0.4);
    expect(Number.isNaN(fisherCombined([], chiSquareUpper))).toBe(true);
  });
});
