import { alterationClass, clinicalOncoprint, designCounts, oncoStatus, recoveryCounts, stateComposition, truncalSubclonal, withHeaders } from "./clinicalFigure";

const rec = {
  patients: {
    P1: { clinical_status: "ok", tumour_cells: 10, normal_cells: 2, assays: [{ assay: "oncopanel" }],
      snv: [{ gene: "TP53", protein: "p.R1H", status: "recovered" }, { gene: "XYZ", protein: "p.A1B", status: "not_recovered", germline_like: true }],
      cnv: [{ genes: ["EGFR"], type: "Amplification", status: "recovered" }, { genes: [], location: "7 Chromosomal level", type: "Gain", status: "partial" }],
      sv: [{ kind: "Fusion", left: { feature: "A x" }, right: { feature: "B y" }, status: "not_assessable" }] },
    P2: { clinical_status: "failed", tumour_cells: 5, normal_cells: 0, snv: [], cnv: [] },
    P3: { clinical_status: "ok", snv: [{ gene: "TP53", protein: "p.X", status: "partial" }], cnv: [] },
  },
};

test("classes and status", () => {
  expect(alterationClass("cnv", { type: "Amplification" })).toBe("amp");
  expect(alterationClass("cnv", { type: "Two copy loss" })).toBe("homdel");
  expect(oncoStatus("snv", { status: "recovered", germline_like: true })).toBe("germline_like");
});

test("oncoprint groups and sorts by recurrence", () => {
  const g = clinicalOncoprint(rec);
  expect(g.rows[0].gene).toBe("TP53");
  expect(g.rows[0].group).toBe("Tumour suppressors");
  expect(g.rows[0].nPatients).toBe(2);
  expect(g.rows.find((r) => r.group === "Chromosome / arm level")).toBeTruthy();
  expect(g.patients.find((p) => p.id === "P2").clinicalOk).toBe(false);
  expect(withHeaders(g.rows)[0]).toEqual({ header: "Tumour suppressors", n: 1 });
  expect(clinicalOncoprint(rec, { hideGermlineLike: true }).rows.find((r) => r.gene === "XYZ")).toBeUndefined();
});

test("recovery counts", () => {
  const c = recoveryCounts(rec);
  expect(c.byPatient.find((p) => p.id === "P1").total).toBe(5);
  expect(c.byPatient.find((p) => p.id === "P1").counts.germline_like).toBe(1);
  expect(c.byClass.find((x) => x.cls === "snv").total).toBe(3);
});

test("design counts with and without RNA", () => {
  const d = designCounts({ recovery: rec, rnaCells: [{ patient: "P1", Region: "R1", Cell_Type: "Malignant" }, { patient: "P1", Region: "R2", Cell_Type: "T" }] });
  expect(d.dnaTumour).toBe(15);
  expect(d.regions.total).toBe(2);
  expect(d.rna.malignant).toBe(1);
  const n = designCounts({ recovery: rec, rnaCells: null });
  expect(n.rna).toBeNull();
  expect(n.rnaWhy).toMatch(/not available/);
});

test("truncal/subclonal and state composition", () => {
  const t = truncalSubclonal({ patients: [{ patient: "A", patient_summary: { truncal: { n_sites: 5 }, subclonal: { n_sites: 9 } } }, { patient: "B", patient_summary: {} }] });
  expect(t).toHaveLength(1);
  const s = stateComposition([{ patient: "A", state: "MES", Cell_Type: "Malignant" }, { patient: "A", state: "AC", Cell_Type: "Malignant" }, { patient: "A", state: null, Cell_Type: "Malignant" }, { patient: "A", state: "MES", Cell_Type: "T" }]);
  expect(s[0].n).toBe(2);
  expect(s[0].frac.MES).toBe(0.5);
});
