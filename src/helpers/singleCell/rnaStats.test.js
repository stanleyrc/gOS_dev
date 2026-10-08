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

describe("quick clustering", () => {
  const { pca, kmeans, scaledExpression, clusteredGeneOrder } = require("./rnaStats");
  it("separates two obvious groups with PCA + k-means", () => {
    // 10 cells x 4 genes: cells 0-4 express genes 0-1, cells 5-9 genes 2-3.
    const nCells = 10;
    const dense = (on) => Array.from({ length: nCells }, (_, i) => (on(i) ? 3 + (i % 2) * 0.1 : 0));
    const genes = [dense((i) => i < 5), dense((i) => i < 5), dense((i) => i >= 5), dense((i) => i >= 5)];
    const indptr = [0];
    const indices = [];
    const data = [];
    genes.forEach((g) => {
      g.forEach((v, i) => v && (indices.push(i), data.push(v)));
      indptr.push(indices.length);
    });
    const m = { indptr: Int32Array.from(indptr), indices: Int32Array.from(indices), data: Float32Array.from(data) };
    const X = scaledExpression(m, [0, 1, 2, 3], nCells);
    const { scores } = pca(X, nCells, 4, 2);
    const labels = kmeans([scores[0], scores[1]], 2);
    expect(new Set(Array.from(labels.slice(0, 5))).size).toBe(1);
    expect(new Set(Array.from(labels.slice(5))).size).toBe(1);
    expect(labels[0]).not.toBe(labels[9]);
    const order = clusteredGeneOrder(X, nCells, 4);
    const pos = (j) => order.indexOf(j);
    expect(Math.abs(pos(0) - pos(1))).toBe(1);
    expect(Math.abs(pos(2) - pos(3))).toBe(1);
  });
});

describe("pcaAsync", () => {
  it("matches the synchronous pca", async () => {
    const { pca, pcaAsync } = require("./rnaStats");
    const n = 12;
    const g = 5;
    const X = Float32Array.from({ length: n * g }, (_, i) => Math.sin(i * 0.7) + (i % 3));
    const a = pca(X, n, g, 3);
    const b = await pcaAsync(X, n, g, 3);
    expect(b.values.map((v) => +v.toFixed(6))).toEqual(a.values.map((v) => +v.toFixed(6)));
    expect(Math.abs(Math.abs(b.scores[0][0]) - Math.abs(a.scores[0][0]))).toBeLessThan(1e-6);
  });
});
