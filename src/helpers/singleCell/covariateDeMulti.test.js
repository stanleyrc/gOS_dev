import { COVARIATE_SORTS, covariateCounts, dotPlotAggregate, formatGenesParam, moduleTest, orderByEffect, parseGenesParam, passesCovariateFilters, rankSumZ, reconcileSelection, scaledPerPatient, selectedGeneRows, statsTsv, testCladeF1, testEvent, toggleGene, topGenes, zScoreAt } from "./covariateDeMulti";

const g = (gene, lfc, q = 0.01, per = { P1: lfc, P2: lfc }) => ({ gene, avg_log2FC: lfc, q_val: q, p_val: q / 10, z: lfc * 3, fisher_q: q, n_patients: 2, n_concordant: 2, per });
const test = (over = {}) => ({
  id: "driver:EGFR amp", family: "driver", gene: "EGFR", patients: [{ patient: "P1", n_a: 10, n_b: 30 }, { patient: "P2", n_a: 4, n_b: 20 }],
  genes: [g("A", 2), g("B", 1), g("C", -1.5), g("D", -0.2, 0.5), g("E", 3, 0.2)],
  volcano: { genes: ["A", "V1"], lfc: [2, -0.8], p: [0.001, 0.01], q: [0.01, 0.2] }, ...over,
});

describe("selection", () => {
  it("parses and formats covgenes", () => {
    expect(parseGenesParam("EGFR, SOX2;egfr  MYC,,")).toEqual(["EGFR", "SOX2", "MYC"]);
    expect(parseGenesParam(null)).toEqual([]);
    expect(formatGenesParam(["A", "B"])).toBe("A,B");
  });
  it("toggles case-insensitively", () => {
    expect(toggleGene(["A"], "B")).toEqual(["A", "B"]);
    expect(toggleGene(["A", "B"], "a")).toEqual(["B"]);
  });
  it("keeps only genes the new test has", () => {
    expect(reconcileSelection(["a", "V1", "ZZZ", "C"], test())).toEqual(["A", "V1", "C"]);
    expect(reconcileSelection(["A"], null)).toEqual([]);
  });
  it("adds top N up / down / by significance with the q cut", () => {
    const t = test();
    expect(topGenes(t, 2, "up")).toEqual(["A", "B"]);
    expect(topGenes(t, 5, "down")).toEqual(["C"]);
    expect(topGenes(t, 3, "sig")).toEqual(["A", "B", "C"]);
  });
});

describe("gene stats", () => {
  it("joins table and volcano rows and flags missing genes", () => {
    const rows = selectedGeneRows(test(), ["A", "V1", "NOPE"]);
    expect(rows[0]).toMatchObject({ gene: "A", lfc: 2, direction: "higher", source: "table", n_concordant: 2 });
    expect(rows[1]).toMatchObject({ gene: "V1", lfc: -0.8, direction: "lower", source: "volcano", per: null });
    expect(rows[2]).toMatchObject({ source: "none", lfc: null });
    expect(orderByEffect(rows).map((r) => r.gene)).toEqual(["A", "V1", "NOPE"]);
  });
  it("writes a TSV with per-patient columns and NA for missing", () => {
    const t = test();
    const tsv = statsTsv(t, selectedGeneRows(t, ["A", "V1"])).trim().split("\n");
    expect(tsv[0].split("\t").slice(-2)).toEqual(["log2FC_P1", "log2FC_P2"]);
    expect(tsv[1].split("\t")[1]).toBe("A");
    expect(tsv[2].split("\t").slice(-2)).toEqual(["NA", "NA"]);
  });
});

describe("module score and dot plot", () => {
  const per = [
    { patient: "P1", a: [0, 1, 2, 3], b: [4, 5, 6, 7], genes: { X: [5, 6, 7, 8, 0, 0, 0, 0], Y: [3, 4, 5, 6, 0, 1, 0, 0] } },
    { patient: "P2", a: [0, 1, 2], b: [3, 4, 5], genes: { X: [4, 5, 6, 0, 0, 1], Y: [2, 3, 4, 0, 0, 0] } },
  ];
  it("z-scores per patient over the test cells", () => {
    const z = zScoreAt([1, 2, 3, 4], [0, 1, 2, 3]);
    expect([...z.values()].reduce((s, x) => s + x, 0)).toBeCloseTo(0);
    expect([...zScoreAt([2, 2, 2], [0, 1, 2]).values()]).toEqual([0, 0, 0]);
  });
  it("module score is the mean z of the genes and is higher in A", () => {
    const sc = scaledPerPatient(per);
    expect(sc[0].module.a.length).toBe(4);
    expect(Math.min(...sc[0].module.a)).toBeGreaterThan(Math.max(...sc[0].module.b));
    const m = moduleTest(sc);
    expect(m.nPatients).toBe(2);
    expect(m.nConcordant).toBe(2);
    expect(m.z).toBeGreaterThan(2);
    expect(m.p).toBeLessThan(0.05);
  });
  it("skips patients with fewer than minCells and returns null when none is left", () => {
    expect(moduleTest(scaledPerPatient(per), { minCells: 4 }).nPatients).toBe(1);
    expect(moduleTest(scaledPerPatient(per), { minCells: 9 })).toBeNull();
  });
  it("rank-sum z has the right sign and handles ties", () => {
    expect(rankSumZ([5, 6, 7], [1, 2, 3])).toBeGreaterThan(0);
    expect(rankSumZ([1, 2, 3], [5, 6, 7])).toBeLessThan(0);
    expect(rankSumZ([1, 1], [1, 1])).toBe(0);
    expect(rankSumZ([], [1])).toBeNull();
  });
  it("aggregates pooled and per-patient dot-plot cells", () => {
    const sc = scaledPerPatient(per);
    const pooled = dotPlotAggregate(sc, ["X", "Y"]);
    expect(pooled.columns.map((c) => c.key)).toEqual(["A", "B"]);
    const xa = pooled.cells.find((c) => c.gene === "X" && c.col === "A");
    const xb = pooled.cells.find((c) => c.gene === "X" && c.col === "B");
    expect(xa.n).toBe(7);
    expect(xa.pct).toBe(1);
    expect(xb.pct).toBeCloseTo(1 / 7);
    expect(xa.mean).toBeGreaterThan(xb.mean);
    const split = dotPlotAggregate(sc, ["X"], { split: true });
    expect(split.columns.map((c) => c.key)).toEqual(["P1 A", "P1 B", "P2 A", "P2 B"]);
    expect(split.cells.find((c) => c.col === "P2 B").n).toBe(3);
  });
});

describe("covariate filters", () => {
  it("counts carriers and others", () => {
    expect(covariateCounts(test())).toEqual({ a: 14, b: 50, k: 2, minA: 4, minB: 20 });
  });
  it("min carriers and min per group", () => {
    expect(passesCovariateFilters(test(), null, { minCarriers: 14 })).toBe(true);
    expect(passesCovariateFilters(test(), null, { minCarriers: 15 })).toBe(false);
    expect(passesCovariateFilters(test(), null, { minGroup: 15 })).toBe(false);
    expect(passesCovariateFilters(test(), null, { minGroup: 14 })).toBe(true);
  });
  it("maps driver tests to events", () => {
    expect(testEvent(test())).toEqual({ gene: "EGFR", cls: "amp" });
    expect(testEvent(test({ id: "driver:TP53 snv", gene: "TP53" })).cls).toEqual(["trunc", "splice", "missense"]);
    expect(testEvent(test({ id: "driver:DM (any)", gene: null }))).toBeNull();
    expect(testEvent(test({ family: "cn" }))).toBeNull();
  });
  it("clade F1 filter: all patients vs at least k, and tests without F1", () => {
    const f1 = (vals) => ({ perPatient: vals.map((f, i) => ({ patient: `P${i}`, f1: f })), summary: null });
    const on = (min, mode = "all", k = 1) => ({ f1: { on: true, min, mode, k } });
    expect(passesCovariateFilters(test(), f1([0.9, 0.8]), on(0.8))).toBe(true);
    expect(passesCovariateFilters(test(), f1([0.9, 0.4]), on(0.8))).toBe(false);
    expect(passesCovariateFilters(test(), f1([0.9, 0.4]), on(0.8, "atleast", 1))).toBe(true);
    expect(passesCovariateFilters(test(), f1([0.9, 0.4]), on(0.8, "atleast", 2))).toBe(false);
    expect(passesCovariateFilters(test(), null, on(0.5))).toBe(false);
    expect(passesCovariateFilters(test(), f1([]), on(0.5))).toBe(false);
    expect(passesCovariateFilters(test(), null, { f1: { on: false } })).toBe(true);
  });
  it("testCladeF1 reads each tested patient's tree; null without an event", () => {
    expect(testCladeF1(test({ family: "cn" }), {})).toBeNull();
    const r = testCladeF1(test(), {});
    expect(r.perPatient).toEqual([]);
    expect(r.summary).toBeNull();
  });
  it("sort keys", () => {
    expect(COVARIATE_SORTS.carriers.value(test())).toBe(14);
    expect(COVARIATE_SORTS.f1.value(test(), { summary: { median: 0.7 } })).toBe(0.7);
    expect(COVARIATE_SORTS.f1.value(test(), null)).toBe(-1);
  });
});
