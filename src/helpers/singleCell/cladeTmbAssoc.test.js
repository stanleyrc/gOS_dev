import { associationTable, normalTwoSided, partialSpearman, ranks, scatterPoints, selectRows, stouffer, withMeasure } from "./cladeTmbAssoc";

// synthetic fixture only: two patients, root -> a -> a1/a2, root -> b, plus a singleton branch
const mk = (patient, id, parent, n_cells, all, extra = {}) => ({
  patient, id, kind: extra.kind || "clade", parent, n_cells, terminal: !!extra.terminal, is_trunk: !!extra.is_trunk, clone: "C1",
  callable_mb: 1000, power: 1, snv: { all, conf: Math.floor(all / 2), multi: all, confmulti: Math.floor(all / 2) }, cov: { n_cells, branch_length: 0.5, ...(extra.cov || {}) },
});
const patientRows = (p, scale) => [
  mk(p, "root", null, 50, 1000, { is_trunk: true }),
  mk(p, "a", "root", 20, 100),
  mk(p, "a1", "a", 8, 10 * scale, { terminal: true, cov: { x: 1 } }),
  mk(p, "a2", "a", 7, 20 * scale, { terminal: true, cov: { x: 2 } }),
  mk(p, "b1", "root", 9, 30 * scale, { terminal: true, cov: { x: 3 } }),
  mk(p, "b2", "root", 6, 40 * scale, { terminal: true, cov: { x: 4 } }),
  mk(p, "b3", "root", 5, 55 * scale, { terminal: true, cov: { x: 5 } }),
  mk(p, "b4", "root", 11, 61 * scale, { terminal: true, cov: { x: 6 } }),
  mk(p, "cell1", "a1", 1, 3, { kind: "singleton", terminal: false, cov: { x: 9 } }),
];
const data = {
  patients: { P1: {}, P2: {} },
  covariates: [{ key: "x", label: "X", group: "g", unit: "u" }],
  clades: [...patientRows("P1", 1), ...patientRows("P2", 2)],
};

describe("cladeTmbAssoc", () => {
  test("ranks average ties", () => expect(ranks([3, 1, 3, 2])).toEqual([3.5, 1, 3.5, 2]));
  test("normal two-sided tail", () => {
    expect(normalTwoSided(1.959964)).toBeCloseTo(0.05, 4);
    expect(normalTwoSided(0)).toBeCloseTo(1, 6);
  });
  test("branch and cumulative TMB, SNV set switches the count", () => {
    const rows = withMeasure(data.clades, { variantSet: "all", measure: "branch" });
    expect(rows.find((r) => r.id === "a1" && r.patient === "P1").y).toBeCloseTo(0.01, 9);
    const cum = withMeasure(data.clades, { variantSet: "all", measure: "cumulative" });
    // a1 = own 10 + a 100 + root 1000 SNVs per 1000 Mb
    expect(cum.find((r) => r.id === "a1" && r.patient === "P1").y).toBeCloseTo(1.11, 9);
    expect(cum.find((r) => r.id === "cell1" && r.patient === "P1").y).toBeCloseTo(1.113, 9);
    const conf = withMeasure(data.clades, { variantSet: "conf", measure: "branch" });
    expect(conf.find((r) => r.id === "a" && r.patient === "P1").y).toBeCloseTo(0.05, 9);
    const rate = withMeasure(data.clades, { measure: "rate" });
    expect(rate.find((r) => r.id === "a1" && r.patient === "P1").y).toBeCloseTo(0.02, 9);
  });
  test("selectRows: singleton toggle, min size, terminal only, trunk excluded", () => {
    const rows = withMeasure(data.clades);
    const ids = (o) => selectRows(rows, o).filter((r) => r.patient === "P1").map((r) => r.id);
    expect(ids({ minCells: 1, dropSingletons: false })).toContain("cell1");
    expect(ids({ minCells: 1, dropSingletons: true })).not.toContain("cell1");
    expect(ids({ minCells: 8, dropSingletons: true })).toEqual(["a", "a1", "b1", "b4"]);
    expect(ids({ minCells: 5, terminalOnly: true })).toEqual(["a1", "a2", "b1", "b2", "b3", "b4"]);
    expect(ids({ minCells: 1 })).not.toContain("root");
  });
  test("partial Spearman: monotone relation gives r = 1 and a small permutation p", () => {
    const t = partialSpearman([1, 2, 3, 4, 5, 6], [2, 4, 6, 8, 10, 12], [5, 7, 6, 9, 8, 10]);
    expect(t.r).toBeGreaterThan(0.5);
    const u = partialSpearman([1, 2, 3, 4, 5, 6], [2, 4, 6, 8, 10, 12], [1, 1, 1, 1, 1, 1]);
    expect(u.r).toBeCloseTo(1, 9);
    expect(u.p_perm).toBeLessThan(0.01);
  });
  test("size adjustment removes a relation driven by clade size", () => {
    const size = [5, 6, 7, 8, 9, 10, 11, 12];
    const t = partialSpearman(size, size.map((s) => s * 2), size);
    expect(t).toBeNull(); // fully explained by size: degenerate residuals
  });
  test("returns null for n < 5 or constant vectors", () => {
    expect(partialSpearman([1, 2, 3], [1, 2, 3], [1, 2, 3])).toBeNull();
    expect(partialSpearman([1, 1, 1, 1, 1, 1], [1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6])).toBeNull();
  });
  test("stouffer weights by sqrt(n) and counts concordant patients", () => {
    const s = stouffer([{ z: 2, n: 4, r: 0.5 }, { z: 1, n: 9, r: 0.3 }, { z: -0.5, n: 4, r: -0.2 }]);
    expect(s.n_patients).toBe(3);
    expect(s.n_concordant).toBe(2);
    expect(s.z).toBeCloseTo((2 * 2 + 3 * 1 + 2 * -0.5) / Math.sqrt(4 + 9 + 4), 9);
    expect(stouffer([])).toBeNull();
  });
  test("associationTable: terminal clades, both patients, sorted, pooled", () => {
    const t = associationTable(data, { terminalOnly: true, dropSingletons: true, minCells: 5 });
    expect(t).toHaveLength(1);
    expect(Object.keys(t[0].per_patient)).toEqual(["P1", "P2"]);
    expect(t[0].per_patient.P1.n).toBe(6);
    expect(t[0].combined.n_patients).toBe(2);
    expect(t[0].combined.mean_r).toBeGreaterThan(0.5);
  });
  test("scatterPoints keeps non-terminal clades and honours the singleton toggle", () => {
    const withS = scatterPoints(data, "x", { minCells: 1, dropSingletons: false });
    const without = scatterPoints(data, "x", { minCells: 1, dropSingletons: true });
    expect(withS.length - without.length).toBe(2);
    expect(without.every((p) => p.kind === "clade")).toBe(true);
  });
});
