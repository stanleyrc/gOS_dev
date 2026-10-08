import { chiSquareUpper, compareGroups, correlationP, fisherExact, kruskalWallis, mannWhitney, studentTwoSidedP } from "./tests";

describe("significance tests", () => {
  it("special functions match reference values", () => {
    expect(chiSquareUpper(3.841, 1)).toBeCloseTo(0.05, 3);
    expect(chiSquareUpper(5.991, 2)).toBeCloseTo(0.05, 3);
    expect(studentTwoSidedP(2.228, 10)).toBeCloseTo(0.05, 3);
    expect(studentTwoSidedP(0, 10)).toBeCloseTo(1, 6);
  });

  it("Mann–Whitney separates shifted groups and not identical ones", () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8];
    const b = [6, 7, 8, 9, 10, 11, 12, 13];
    expect(mannWhitney(a, b).p).toBeLessThan(0.01);
    expect(mannWhitney(a, a).p).toBeCloseTo(1, 1);
  });

  it("Kruskal–Wallis and compareGroups", () => {
    const g = [[1, 2, 3, 4, 5], [1.5, 2.5, 3.5, 4.5, 5.5], [20, 21, 22, 23, 24]];
    const kw = kruskalWallis(g);
    expect(kw.df).toBe(2);
    expect(kw.p).toBeLessThan(0.01);
    const cmp = compareGroups(g.map((values, k) => ({ key: `g${k}`, values })));
    expect(cmp.test).toBe("kruskal-wallis");
    expect(cmp.pairs).toHaveLength(3);
    expect(cmp.pairs.find((p) => p.a === "g0" && p.b === "g1").q).toBeGreaterThan(0.05);
  });

  it("correlation and Fisher p-values", () => {
    expect(correlationP(0.9, 30)).toBeLessThan(1e-6);
    expect(correlationP(0.05, 30)).toBeGreaterThan(0.5);
    // classic tea-tasting style table
    expect(fisherExact(8, 2, 1, 5).p).toBeCloseTo(0.035, 2);
    expect(fisherExact(5, 5, 5, 5).p).toBeCloseTo(1, 6);
  });
});
