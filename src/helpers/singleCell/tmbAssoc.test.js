import { VERDICTS, cladePoints, robustnessVerdict, covariateNames, forestRows, fmtP, geneTable, moduleSummary, scatterPoints } from "./tmbAssoc";

// synthetic fixture only
const doc = {
  patients: { P1: { noisy: false }, P2: { noisy: true } },
  numeric: [
    { family: "numeric", covariate: "A", measure: "total", adjust: "qc", per_patient: { P1: { r: 0.2, p: 0.1, n: 30, z: 1 }, P2: { r: -0.1, p: 0.5, n: 20, z: -0.4 } }, combined: { z: 0.5, p: 0.6, n_patients: 2, n_concordant: 1 }, combined_no_noisy: { z: 1, p: 0.3, n_patients: 1, n_concordant: 1 } },
    { family: "numeric", covariate: "B", measure: "total", adjust: "qc", per_patient: { P1: { r: 0.5, p: 0.001, n: 30, z: 3 } }, combined: { z: 3, p: 0.001, n_patients: 1, n_concordant: 1 }, combined_no_noisy: { z: 3, p: 0.001, n_patients: 1, n_concordant: 1 } },
    { family: "numeric", covariate: "Module: MTORC1 signalling (Hallmark)", measure: "private", adjust: "qc_region", per_patient: { P1: { r: -0.2, p: 0.2, n: 30, z: -1 } }, combined: { z: -1, p: 0.3 }, combined_no_noisy: null },
  ],
  cells: { P1: { cell: ["c1", "c2", "c3"], total: [1, 2, 3], A: [0.1, 0.2, null], state: ["AC", "AC", "MES"] }, P2: { cell: ["d1"], total: [4], A: [0.5], state: ["AC"] } },
  genes: { "total|qc_clone_region": { up: [{ gene: "G1", z: 3, z_no_noisy: 2 }, { gene: "G2", z: 2, z_no_noisy: -1 }], down: [] } },
};

describe("tmbAssoc helpers", () => {
  it("sorts forest rows by |z| and drops noisy dots when excluded", () => {
    const rows = forestRows(doc, "total", "qc");
    expect(rows.map((r) => r.covariate)).toEqual(["B", "A"]);
    expect(rows[1].dots).toHaveLength(2);
    const nn = forestRows(doc, "total", "qc", true);
    expect(nn.find((r) => r.covariate === "A").dots).toHaveLength(1);
    expect(nn.find((r) => r.covariate === "A").comb.z).toBe(1);
  });
  it("builds scatter points from finite values only", () => {
    expect(scatterPoints(doc, "A", "total")).toHaveLength(3);
    expect(scatterPoints(doc, "A", "total", true)).toHaveLength(2);
    expect(scatterPoints(doc, "missing", "total")).toEqual([]);
  });
  it("filters genes whose sign flips without the noisy patient", () => {
    expect(geneTable(doc, "total", "qc_clone_region", "up").rows).toHaveLength(2);
    expect(geneTable(doc, "total", "qc_clone_region", "up", true).rows.map((r) => r.gene)).toEqual(["G1"]);
    expect(geneTable(doc, "private", "x", "up")).toBeNull();
  });
  it("summarises the module covariate by direction", () => {
    const s = moduleSummary(doc);
    expect(s).toHaveLength(1);
    expect(s[0].perPatient[0].dir).toBe("down");
  });
  it("lists covariate names and formats p", () => {
    expect(covariateNames(doc)).toHaveLength(3);
    expect(fmtP(0.0004)).toBe("4.0e-4");
    expect(fmtP(null)).toBe("n/a");
    expect(forestRows(null, "total", "qc")).toEqual([]);
  });

  describe("robustnessVerdict (synthetic rows)", () => {
    const base = { clade: { r: 0.4, p: 0.001, q: 0.01 }, per_copy: { clade: { r: 0.3, p: 0.01 } }, permutation: { p: 0.01 }, overlap_free_applicable: true, overlap_free: { clade: { r: 0.3, p: 0.02 } } };
    it("survives all when every check passes", () => expect(robustnessVerdict(base)).toBe(VERDICTS.all));
    it("labels a lineage-level association when only the permutation fails (not a gate)", () => {
      expect(robustnessVerdict({ ...base, permutation: { p: 0.4 } })).toBe(VERDICTS.lineage);
      expect(robustnessVerdict({ ...base, permutation: null })).toBe(VERDICTS.lineage);
    });
    it("fails correction first, then DNA content, then overlap", () => {
      expect(robustnessVerdict({ ...base, clade: { r: 0.4, p: 0.01, q: 0.2 } })).toBe(VERDICTS.corrected);
      expect(robustnessVerdict({ ...base, clade: null })).toBe(VERDICTS.corrected);
      expect(robustnessVerdict({ ...base, per_copy: { clade: { r: -0.1, p: 0.01 } } })).toBe(VERDICTS.dna);
      expect(robustnessVerdict({ ...base, per_copy: { clade: { r: 0.3, p: 0.3 } } })).toBe(VERDICTS.dna);
      expect(robustnessVerdict({ ...base, overlap_free: { clade: { r: 0.3, p: 0.3 } } })).toBe(VERDICTS.overlap);
      expect(robustnessVerdict({ ...base, overlap_free_applicable: false, overlap_free: null })).toBe(VERDICTS.all);
    });
  });

  it("returns one point per clade and honours the noisy switch", () => {
    const d = { patients: { P1: { noisy: false }, P2: { noisy: true } }, clade_level_covariates: { rows: [{ covariate: "A", measure: "subclonal", per_patient: { P1: { points: [[1, 2], [3, 4]] }, P2: { points: [[5, 6]] } } }] } };
    expect(cladePoints(d, "A", "subclonal")).toHaveLength(3);
    expect(cladePoints(d, "A", "subclonal", true)).toEqual([{ patient: "P1", y: 1, x: 2 }, { patient: "P1", y: 3, x: 4 }]);
    expect(cladePoints(d, "B", "subclonal")).toEqual([]);
  });
});
