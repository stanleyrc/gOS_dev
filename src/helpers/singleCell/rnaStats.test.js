import {
  benjaminiHochberg,
  differentialExpression,
  hypergeomUpper,
  kernelDensity,
  overRepresentation,
  parseGmt,
  quartiles,
  wilcoxonFromNonzero,
} from "./rnaStats";
import { readMatrixBuffers } from "./staticRna";

// Reference values from R 4.3: wilcox.test(exact = FALSE), phyper, p.adjust.
describe("rnaStats", () => {
  it("matches R's Wilcoxon normal approximation", () => {
    expect(wilcoxonFromNonzero([1, 2, 3, 4, 5], [6, 7, 8, 9, 10], 5, 5).p).toBeCloseTo(0.01218578, 6);
    // zeros are implied: A = (0,0,0,1,2.5,2.5), B = (0,3,4,4,5)
    expect(wilcoxonFromNonzero([1, 2.5, 2.5], [3, 4, 4, 5], 6, 5).p).toBeCloseTo(0.06042645, 6);
  });

  it("matches phyper and p.adjust(BH)", () => {
    expect(hypergeomUpper(3, 100, 10, 10)).toBeCloseTo(0.06001858, 6);
    benjaminiHochberg([0.01, 0.04, 0.03, 0.2]).forEach((q, k) =>
      expect(q).toBeCloseTo([0.04, 0.05333333, 0.05333333, 0.2][k], 6)
    );
  });

  it("computes Seurat-style fold changes from the sparse matrix", async () => {
    // genes x cells: G1 = [2, 2, 0, 0], G2 = [0, 1, 1, 1]
    const i32 = (a) => Int32Array.from(a).buffer;
    const f32 = (a) => Float32Array.from(a).buffer;
    const m = readMatrixBuffers(i32([0, 2, 5]), i32([0, 1, 1, 2, 3]), f32([2, 2, 1, 1, 1]));
    const rows = await differentialExpression(m, ["G1", "G2"], 4, [0, 1], [2, 3]);
    const g1 = rows.find((r) => r.gene === "G1");
    expect(g1.pct_1).toBe(1);
    expect(g1.pct_2).toBe(0);
    expect(g1.avg_log2FC).toBeCloseTo(Math.log2((2 * Math.expm1(2) + 1) / 2) - Math.log2(1 / 2), 6);
    expect(g1.p_val_adj).toBeCloseTo(Math.min(1, g1.p_val * 2), 9);
  });

  it("runs over-representation on GMT sets", () => {
    const sets = parseGmt("S1\tx\tA\tB\tC\tD\tE\nS2\tx\tF\tG\tH\tI\tJ\n");
    const universe = "ABCDEFGHIJKLMNOPQRST".split("");
    const rows = overRepresentation(["A", "B", "C", "D"], universe, sets);
    expect(rows[0].term).toBe("S1");
    expect(rows[0].overlap).toBe(4);
    expect(rows[0].p_val).toBeLessThan(rows[1].p_val);
  });

  it("gives densities and quartiles", () => {
    const d = kernelDensity([1, 1, 1, 2], [1, 5]);
    expect(d[0]).toBeGreaterThan(d[1]);
    expect(quartiles([1, 2, 3, 4, 5]).median).toBe(3);
  });
});
