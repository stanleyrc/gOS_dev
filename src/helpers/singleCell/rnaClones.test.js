import { baselineAccuracy, dnaArmCn, knnAssign, looAccuracy, rnaArmScores } from "./rnaClones";
import { buildBinIndex } from "./matrix";

describe("rna clone assignment", () => {
  // two well-separated groups in 2-D
  const P = [Float64Array.from([0, 0.1, 0.2, 0.1, 5, 5.1, 5.2, 5.1, 0.15, 5.05]), Float64Array.from([0, 0.1, 0, 0.2, 5, 5, 5.1, 5.2, 0.05, 5.1])];
  const labels = ["A", "A", "A", "A", "B", "B", "B", "B", null, null];
  const train = [0, 1, 2, 3, 4, 5, 6, 7];

  it("assigns query cells to the nearest clone with a vote share", () => {
    const calls = knnAssign(P, train, labels, [8, 9], 3);
    expect(calls.map((c) => c.label)).toEqual(["A", "B"]);
    expect(calls[0].conf).toBe(1);
  });

  it("scores leave-one-out accuracy against the majority baseline", () => {
    const r = looAccuracy(P, train, labels, 3);
    expect(r.accuracy).toBe(1);
    expect(r.perClone.A).toEqual({ n: 4, correct: 4 });
    expect(r.confusion.B.B).toBe(4);
    expect(baselineAccuracy(train, labels)).toBe(0.5);
  });
});

describe("rna vs dna arm copy number", () => {
  const chromoBins = { 1: { startPlace: 1, endPlace: 100 }, 2: { startPlace: 101, endPlace: 200 } };
  const arms = [
    { name: "1", gStart: 1, gEnd: 100 },
    { name: "2", gStart: 101, gEnd: 200 },
  ];

  it("averages centred expression of the arm's genes", () => {
    // 2 cells, 3 genes on arm 1 (all higher in cell 0), 1 gene on arm 2; CSC matrix (gene-major)
    const summary = { cells: [{}, {}], genes: ["g1", "g2", "g3", "g4"] };
    const matrix = {
      indptr: Int32Array.from([0, 2, 4, 6, 8]),
      indices: Int32Array.from([0, 1, 0, 1, 0, 1, 0, 1]),
      data: Float32Array.from([2, 0, 3, 1, 1, 1, 1, 1]),
    };
    const genePos = new Map([["g1", 10], ["g2", 20], ["g3", 30], ["g4", 150]]);
    const r = rnaArmScores(summary, matrix, genePos, arms, { minGenes: 2, minMean: 0 });
    expect(r.arms).toEqual(["1"]);
    expect(r.scores[0][0]).toBeCloseTo(2 / 3);
    expect(r.scores[0][1]).toBeCloseTo(-2 / 3);
  });

  it("gives DNA arm CN relative to the cell's baseline", () => {
    const row = {
      binIndex: buildBinIndex({ chromosome: ["1", "2"], start: [0, 0], end: [99, 99] }, chromoBins),
      values: Float32Array.from([3, 2]),
    };
    const m = dnaArmCn({ cells: ["c"], rows: [row] }, arms, { step: 10 });
    expect([...m.get("c")]).toEqual([0.5, -0.5]);
  });
});
