import { dotStats, geneSetScores, parseGeneList } from "./geneSets";

describe("geneSets", () => {
  it("parses lists", () => {
    expect(parseGeneList("EGFR, PDGFRA\nCDK4;MDM2 EGFR")).toEqual(["EGFR", "PDGFRA", "CDK4", "MDM2"]);
  });
  it("scores as the mean z over used genes", () => {
    const table = { A: Float32Array.from([0, 2, 4]), B: Float32Array.from([1, 1, 1]) };
    const { scores, used, missing } = geneSetScores(["A", "B", "C"], 3, (g) => table[g] || null);
    expect(used).toEqual(["A"]);
    expect(missing).toEqual(["C"]);
    expect(scores[0]).toBeCloseTo(-1.2247, 3);
    expect(scores[1]).toBeCloseTo(0, 5);
  });
  it("computes dot statistics", () => {
    const [g1, g2] = dotStats(Float32Array.from([0, 1, 3, 0]), [[0, 1], [2, 3]]);
    expect(g1.fraction).toBe(0.5);
    expect(g2.mean).toBe(1.5);
  });
});
