import { countFlagged, countTumorNormal, describeTree, median, quantile, quantileClass, summarizeQc, summarizeTmb } from "./patientSummary";

const patient = (name, trunc, sub, perCell = []) => ({ patient: name, noisy: false, patient_summary: { truncal: { tmb_corrected: trunc, n_sites: 100 }, subclonal: { tmb_corrected: sub } }, cells: perCell.map((n) => ({ n_subclonal_alt: n })) });
const doc = { patients: [patient("A", 0.5, 0.1), patient("B", 1, 1), patient("C", 2, 2), patient("D", 3, 3), patient("E", 4, 4)] };

describe("patientSummary", () => {
  test("median and quantile", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(quantile([0, 10], 0.5)).toBe(5);
  });
  test("quantileClass cuts at the quartiles and needs a cohort", () => {
    const cohort = [1, 2, 3, 4, 5];
    expect(quantileClass(1, cohort)).toBe(0);
    expect(quantileClass(3, cohort)).toBe(1);
    expect(quantileClass(5, cohort)).toBe(2);
    expect(quantileClass(5, [1, 2])).toBeNull();
    expect(quantileClass(null, cohort)).toBeNull();
  });
  test("summarizeTmb", () => {
    expect(summarizeTmb(doc, "E")).toMatchObject({ truncalPerMb: 4, truncalClass: 2, subclonalPerMb: 4, subclonalClass: 2, subclonalPerCell: null, nCohort: 5 });
    expect(summarizeTmb(doc, "A")).toMatchObject({ truncalClass: 0, subclonalClass: 0 });
    expect(summarizeTmb(doc, "C", { cells: [{ n_subclonal_alt: 1 }, { n_subclonal_alt: 9 }, { n_subclonal_alt: 5 }] }).subclonalPerCell).toBe(5);
    expect(summarizeTmb(doc, "Z")).toBeNull();
    expect(summarizeTmb(null, "A")).toBeNull();
  });
  test("tumor / normal counts", () => {
    const cells = [{ cell_id: "a", clone_id: "Clone 1" }, { cell_id: "b", clone_id: "Normal" }, { cell_id: "c", clone_id: "Clone 1" }];
    expect(countTumorNormal(cells)).toEqual({ total: 3, normal: 1, tumor: 2 });
    expect(countTumorNormal(cells, [{ cell_id: "c", normal: true }])).toEqual({ total: 3, normal: 2, tumor: 1 });
  });
  test("summarizeQc medians over tumor cells", () => {
    const rows = [{ normal: false, het_depth_med: 4, mapd: 0.1, n_het: 100 }, { normal: false, het_depth_med: 8, mapd: 0.3, n_het: 300 }, { normal: true, het_depth_med: 99, mapd: 9, n_het: 9 }];
    expect(summarizeQc(rows)).toEqual({ n: 2, hetDepth: 6, mapd: 0.2, hetSites: 200 });
    expect(summarizeQc([])).toBeNull();
  });
  test("describeTree", () => {
    expect(describeTree("file", { tumor_details: "old tree (x.nwk)" })).toMatchObject({ label: "older tree file", detail: "x.nwk" });
    expect(describeTree("file", {}).label).toBe("included tree");
    expect(describeTree("snv", {}).label).toMatch(/SNV/);
    expect(describeTree(null, {})).toBeNull();
  });
  test("countFlagged only counts cells with a QC call", () => {
    expect(countFlagged([{ "QC flag": "pass" }, { "QC flag": "doublet" }, { QC: "fail" }, {}])).toEqual({ flagged: 2, assessed: 3 });
  });
});
