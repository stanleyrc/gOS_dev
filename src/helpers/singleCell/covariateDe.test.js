import { cladeCompareSpecs, cladeTopRows, fmtDiff, leadFlag, shortClade, violinGroups, sharedPrograms, describeTest, geneSignature, qcNote, signatureOverlap, formatQ, headlineFindings, isRobust, looselyAdjusted, perPatientLfc, testCells, testRows, topProgram, volcanoRows } from "./covariateDe";

const gene = (over = {}) => ({ gene: "G1", avg_log2FC: 1, q_val: 0.01, p_val: 0.001, n_patients: 3, n_concordant: 3, per: { A: 1.2, B: 0.4, C: 0.9 }, ...over });
const test = (over = {}) => ({
  id: "driver:X amp", family: "driver", label: "X amp: carriers vs non-carriers", group_a: "X amp carriers", group_b: "non-carriers", k_patients: 3, combinable: true,
  patients: [{ patient: "A", n_a: 10, n_b: 20, adjust: "plate+cycling" }, { patient: "B", n_a: 5, n_b: 9, adjust: "cycling" }, { patient: "C", n_a: 7, n_b: 30, adjust: "plate+cycling" }],
  n_sig_q05: 12, n_robust: 4, robust_up: ["G1", "G2", "G3"], robust_down: ["G9"], top_up: ["G1"], top_down: ["G9"],
  volcano: { genes: ["G1", "G9"], lfc: [1, -2], p: [0.001, 0.0001], q: [0.01, 0.002] },
  genes: [gene(), gene({ gene: "G9", avg_log2FC: -2 })],
  enrichment: { up: [{ term: "HALLMARK_E2F_TARGETS", collection: "Hallmark", q: 0.01, p: 0.001 }], down: [{ term: "HALLMARK_X", q: 0.4 }] },
  ...over,
});
const data = {
  tests: [
    test({ id: "a", n_robust: 0, n_sig_q05: 3, label: "a" }),
    test({ id: "b", n_robust: 9, label: "b" }),
    test({ id: "cn:EGFR", family: "cn", n_robust: 30, label: "EGFR copy number", genes: [gene({ gene: "E1" }), gene({ gene: "E2" })] }),
    test({ id: "clade:one", family: "clade", combinable: false, k_patients: 1, n_robust: 0, n_sig_q05: 40, label: "one clade", patients: [{ patient: "A", n_a: 5, n_b: 6, adjust: "none" }] }),
  ],
};

describe("covariateDe", () => {
  it("isRobust needs >= 2 patients, full concordance, q and lfc", () => {
    expect(isRobust(gene())).toBe(true);
    expect(isRobust(gene({ n_patients: 1, n_concordant: 1 }))).toBe(false);
    expect(isRobust(gene({ n_concordant: 2 }))).toBe(false);
    expect(isRobust(gene({ q_val: 0.2 }))).toBe(false);
    expect(isRobust(gene({ avg_log2FC: -0.3 }))).toBe(false);
    expect(isRobust(null)).toBe(false);
  });

  it("sums cells and flags loosely adjusted patients", () => {
    expect(testCells(test())).toEqual({ a: 22, b: 59 });
    expect(looselyAdjusted(test())).toEqual(["B"]);
  });

  it("testRows filters by family and text and sorts by robust hits", () => {
    expect(testRows(data).map((r) => r.id)).toEqual(["cn:EGFR", "b", "clade:one", "a"]);
    expect(testRows(data, { family: "clade" }).map((r) => r.id)).toEqual(["clade:one"]);
    expect(testRows(data, { combinableOnly: true }).map((r) => r.id)).not.toContain("clade:one");
    expect(testRows(data, { query: "egfr" }).map((r) => r.id)).toEqual(["cn:EGFR"]);
    expect(testRows(null)).toEqual([]);
  });

  it("volcanoRows reads the compact arrays and falls back to the gene table", () => {
    const rows = volcanoRows(test());
    expect(rows[1]).toMatchObject({ gene: "G9", avg_log2FC: -2, p_val: 0.0001, q_val: 0.002 });
    const fallback = volcanoRows(test({ volcano: null }));
    expect(fallback).toHaveLength(2);
    expect(fallback[0].p_val).toBe(0.001);
    expect(volcanoRows(null)).toEqual([]);
  });

  it("perPatientLfc orders by magnitude", () => {
    expect(perPatientLfc(gene()).map((r) => r.patient)).toEqual(["A", "C", "B"]);
    expect(perPatientLfc(null)).toEqual([]);
  });

  it("topProgram takes the best term passing q", () => {
    expect(topProgram(test(), "up")).toMatchObject({ term: "HALLMARK_E2F_TARGETS", pretty: "e2f targets" });
    expect(topProgram(test(), "down")).toBeNull();
  });

  it("describeTest states counts, genes and programs", () => {
    const s = describeTest(test());
    expect(s).toContain("4 genes move the same way in all 3 patients");
    expect(s).toContain("higher in X amp carriers: G1, G2, G3");
    expect(s).toContain("up program: e2f targets (q 0.010)");
    expect(describeTest(data.tests[3])).toContain("in one patient");
  });

  it("headlineFindings keeps combinable tests with robust genes, dosage ranked lower", () => {
    const h = headlineFindings(data, { max: 5 });
    expect(h.map((x) => x.id)).toEqual(["b", "cn:EGFR"]);
    expect(h[1].control).toBe(true);
    expect(headlineFindings(data, { max: 1 })).toHaveLength(1);
    expect(headlineFindings(data, { minRobust: 20 }).map((x) => x.id)).toEqual(["cn:EGFR"]);
    expect(headlineFindings(null)).toEqual([]);
  });

  it("folds tests that call the same genes into one card and notes QC-looking leads", () => {
    const twin = test({ id: "driver:Y amp", label: "Y amp: carriers vs non-carriers", n_robust: 8 });
    const other = test({ id: "driver:Z amp", label: "Z amp: carriers vs non-carriers", n_robust: 7, genes: [gene({ gene: "Q1" }), gene({ gene: "Q2" })] });
    const h = headlineFindings({ tests: [test({ n_robust: 9 }), twin, other] }, { max: 5 });
    expect(h.map((x) => x.id)).toEqual(["driver:X amp", "driver:Z amp"]);
    expect(h[0].also).toEqual(["Y amp"]);
    expect(h[0].sig).toBeUndefined();
    expect(signatureOverlap(geneSignature(test()), geneSignature(twin))).toBe(1);
    expect(signatureOverlap(new Set(), new Set(["a"]))).toBe(0);
    expect(qcNote(test({ robust_up: ["MT-CO1", "MT-CO2", "MT-ND1", "FOS"], robust_down: [] }))).toMatch(/mitochondrial/);
    expect(qcNote(test())).toBe("");
  });

  it("sharedPrograms finds programs leading most driver tests and headlines show them once", () => {
    const mk = (id, genes) => test({ id, label: `${id}: carriers vs non-carriers`, genes, enrichment: { up: [{ term: "HALLMARK_MYC_TARGETS_V1", q: 0.001 }, { term: `P_${id}`, q: 0.001 }], down: [] } });
    const d = { tests: ["a", "b", "c", "d"].map((i) => mk(i, [gene({ gene: `X${i}` })])) };
    const sh = sharedPrograms(d);
    expect(sh).toHaveLength(1);
    expect(sh[0]).toMatchObject({ term: "HALLMARK_MYC_TARGETS_V1", direction: "up", n: 4, of: 4, pretty: "myc targets v1" });
    expect(sharedPrograms({ tests: d.tests.slice(0, 2) })).toEqual([]);
    const h = headlineFindings(d, { max: 3 });
    expect(h[0].id).toBe("shared");
    expect(h).toHaveLength(3);
    expect(h[1].text).not.toContain("myc targets");
    expect(h[1].text).toContain("up program: p a");
  });

  it("violinGroups builds A/B pairs per patient and lists what could not load", () => {
    const { groups, unavailable } = violinGroups([
      { patient: "P1", values: [0, 1, 2, 3, NaN], a: [0, 1], b: [2, 3, 4] },
      { patient: "P2", values: null, a: [0], b: [1], reason: "matrix missing" },
      { patient: "P3", values: [1], a: [0], b: null },
    ], { labelA: "carriers", labelB: "non-carriers" });
    expect(groups.map((g) => g.key)).toEqual(["P1 A", "P1 B"]);
    expect(groups[0].values).toEqual([0, 1]);
    expect(groups[1].values).toEqual([2, 3]);
    expect(groups[1]).toMatchObject({ cluster: "P1", label: "non-carriers" });
    expect(unavailable).toEqual([{ patient: "P2", reason: "matrix missing" }, { patient: "P3", reason: "expression not loaded" }]);
  });

  it("clade helpers", () => {
    expect(shortClade("MGH303_n209")).toBe("n209");
    expect(cladeCompareSpecs("MGH303_n209")).toEqual({ a: "clade:MGH303_n209", b: "sister:clade:MGH303_n209" });
    const rows = cladeTopRows({ patients: [{ patient: "A", n_a: 20, n_b: 30, adjust: "cycling", d_mt: 1.5, d_lib: -0.2 }], clade_info: [{ patient: "A", included: true, clade: "A_n1", burden_rel: 4, n_private_snv: 90, top_signature: "SBS8" }, { patient: "B", included: false, reason: "no SNV-based clade burden" }] });
    expect(rows[0]).toMatchObject({ clade: "A_n1", n_a: 20, n_b: 30, adjust: "cycling", d_mt: 1.5, top_signature: "SBS8" });
    expect(rows[1]).toMatchObject({ included: false, clade: null, n_a: null });
    expect(cladeTopRows(null)).toEqual([]);
    expect(leadFlag(["MT-CO1", "MT-CO2", "MT-ND1", "X"])).toBe("mito");
    expect(leadFlag(["RPL3", "RPS4", "RPL5"])).toBe("ribo");
    expect(leadFlag(["A", "B"])).toBe("");
    expect(fmtDiff(0.123)).toBe("+0.12");
    expect(fmtDiff(null)).toBe("–");
  });

  it("formatQ", () => {
    expect(formatQ(0.0004)).toBe("4e-4");
    expect(formatQ(NaN)).toBe("–");
  });
});
