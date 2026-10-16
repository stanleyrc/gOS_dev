import {
  clonalityText,
  cladeSignatureRows,
  contrastRows,
  driverGeneRows,
  fmtP,
  headlineGenes,
  passesCladeFilter,
  pathwayMatrix,
  recurrenceRows,
  shiftSummary,
  shiftText,
} from "./subclonalDrivers";

// synthetic fixture (no patient data)
const doc = {
  patients: [
    { patient: "PA", available: true, signature_contrasts: [{ contrast: "subclonal vs truncal", n_a: 100, n_b: 200, rows: [{ signature: "SBS1", frac_a: 0.1, frac_b: 0.3, diff: -0.2, lo: -0.3, hi: -0.1, p: 0.001, q: 0.002 }] }] },
    { patient: "PB", available: true, signature_contrasts: [] },
    { patient: "PC", available: false, reason: "no SNV map" },
  ],
  hits: [
    { patient: "PA", gene: "GENE1", site: "chr1:10:A>T", class: "trunc", carrier_fraction: 0.2, status: "subclonal", tree: { category: "private" } },
    { patient: "PA", gene: "GENE1", site: "chr1:20:C>T", class: "splice", carrier_fraction: 0.1, status: "subclonal", tree: { category: "private" } },
    { patient: "PB", gene: "GENE1", site: "chr1:30:G>A", class: "trunc", carrier_fraction: 0.9, status: "clonal", tree: { category: "truncal" }, note: { text: "junction nearby", locus: "chr1:40" } },
    { patient: "PB", gene: "GENE2", site: "chr2:5:G>A", class: "missense", carrier_fraction: 0.3, status: "subclonal", tree: null },
  ],
  driver_genes: [
    { gene: "GENE2", patients: ["PB"], patients_subclonal: ["PB"], n_hits: 1, n_hits_subclonal: 1, recurrence_trunc: null },
    { gene: "GENE1", patients: ["PA", "PB"], patients_subclonal: ["PA"], n_hits: 3, n_hits_subclonal: 2, recurrence_trunc: { q_patients: 0.01, p_patients: 1e-5 } },
  ],
  recurrence: [
    {
      set: "trunc",
      n_genes_tested: 100,
      rows: [
        { gene: "GENE1", patients: 2, hits: 3, expected_hits: 0.02, p_patients: 1e-5, q_patients: 0.01, q_patients_no_bwh69: 0.5, per_patient: [{ patient: "PA" }, { patient: "PB" }] },
        { gene: "GENE3", patients: 1, hits: 1, expected_hits: 0.01, p_patients: 0.01, q_patients: 1, per_patient: [{ patient: "PA" }] },
      ],
    },
  ],
  pathways: [{ pathway: "NHEJ", genes: ["GENE1"], patients: { PA: { available: true, subclonal: ["GENE1 trunc"], clonal: [], other_truncating: [] }, PB: { available: true, subclonal: [], clonal: ["GENE1 x"], other_truncating: [] }, PC: { available: false } } }],
  clade_signatures: {
    PA: {
      signatures: ["SBS1", "SBS13"],
      added: ["SBS13"],
      truncal: { n_sites: 300, fractions: [{ signature: "SBS1", frac: 0.3, lo: 0.25, hi: 0.35 }] },
      clades: [
        { clade: "PA_n1", parent: null, n_cells: 10, is_trunk: true, fitted: true, fractions: [{ signature: "SBS1", frac: 0.3 }] },
        { clade: "PA_n3", parent: "PA_n1", n_cells: 3, fitted: false, reason: "n sites 10 < 50" },
        { clade: "PA_n2", parent: "PA_n1", n_cells: 6, fitted: true, fractions: [{ signature: "SBS13", frac: 0.2, lo: 0.1, hi: 0.3 }], vs: [{ vs: "truncal", signature: "SBS13", diff: 0.2, q: 0.01 }] },
      ],
    },
  },
  signature_shifts: [
    { patient: "PA", clade: "PA_n2", vs: "truncal", signature: "SBS13", diff: 0.2, q: 0.01 },
    { patient: "PB", clade: "PB_n5", vs: "PB_n4", signature: "SBS1", diff: -0.1, q: 0.05 },
    { patient: "PA", clade: "PA_n2", vs: "truncal", signature: "SBS1", diff: -0.15, q: 0.02 },
  ],
};

test("fmtP", () => {
  expect(fmtP(1)).toBe("1");
  expect(fmtP(0.0123)).toBe("0.012");
  expect(fmtP(1.5e-6)).toBe("1.5e−6");
  expect(fmtP(null)).toBe("n/a");
});

test("clonalityText reads fraction and node", () => {
  expect(clonalityText(doc.hits[0])).toBe("20% of tumour cells · private node");
  expect(clonalityText(doc.hits[3])).toBe("30% of tumour cells · not on the tree");
});

test("driverGeneRows ranks by patients with subclonal hits and attaches hits / notes", () => {
  const rows = driverGeneRows(doc);
  expect(rows.map((r) => r.gene)).toEqual(["GENE1", "GENE2"]);
  expect(rows[0].hits).toHaveLength(3);
  expect(rows[0].notes).toEqual([{ patient: "PB", site: "chr1:30:G>A", text: "junction nearby", locus: "chr1:40" }]);
  expect(rows[0].q).toBe(0.01);
});

test("recurrenceRows and headlineGenes", () => {
  expect(recurrenceRows(doc, "trunc").nTested).toBe(100);
  expect(recurrenceRows(doc, "trunc", { minPatients: 2 }).rows.map((r) => r.gene)).toEqual(["GENE1"]);
  expect(recurrenceRows(doc, "nonsyn").rows).toEqual([]);
  const h = headlineGenes(doc);
  expect(h).toHaveLength(1);
  expect(h[0]).toMatchObject({ gene: "GENE1", patients: ["PA", "PB"], significant: true });
  // nothing significant: falls back to genes in >= 2 patients, flagged not significant
  const h2 = headlineGenes(doc, { qMax: 0.001 });
  expect(h2[0].significant).toBe(false);
});

test("headlineGenes demotes genes whose q is lost after read-QC", () => {
  const d = { recurrence: [{ set: "trunc", n_genes_tested: 10, rows: [
    { gene: "BAD", patients: 3, hits: 5, q_patients: 0.001, q_patients_read_qc_pass: 1, per_patient: [] },
    { gene: "OK", patients: 2, hits: 2, q_patients: 0.02, q_patients_read_qc_pass: 0.03, per_patient: [] },
  ] }] };
  const h = headlineGenes(d);
  expect(h.map((x) => x.gene)).toEqual(["OK", "BAD"]);
  expect(h[0].significant).toBe(true);
  expect(h[1]).toMatchObject({ qcFailed: true, significant: false });
});

test("pathwayMatrix", () => {
  const m = pathwayMatrix(doc);
  expect(m.patients).toEqual(["PA", "PB", "PC"]);
  expect(m.rows[0].nSubclonal).toBe(1);
  expect(m.rows[0].nAny).toBe(2);
  expect(m.rows[0].cells[2].available).toBe(false);
});

test("cladeSignatureRows: tree order, larger child first, unfitted kept with reason", () => {
  const r = cladeSignatureRows(doc, "PA");
  expect(r.rows.map((x) => [x.clade, x.depth])).toEqual([
    ["PA_n1", 0],
    ["PA_n2", 1],
    ["PA_n3", 1],
  ]);
  expect(r.rows[2].fitted).toBe(false);
  expect(r.rows[1].tests.SBS13).toHaveLength(1);
  expect(r.rows[1].flagged).toHaveLength(2);
  expect(r.truncal.SBS1.frac).toBe(0.3);
  expect(cladeSignatureRows(doc, "PZ").rows).toEqual([]);
});

test("shift text and summary", () => {
  expect(shiftText(doc.signature_shifts[0])).toBe("SBS13 +20 pts vs truncal (q 0.010)");
  expect(shiftText(doc.signature_shifts[1])).toBe("SBS1 -10 pts vs n4 (q 0.050)");
  const s = shiftSummary(doc);
  expect(s[0]).toMatchObject({ signature: "SBS1", up: false, n: 2, patients: ["PA", "PB"] });
});

test("contrastRows", () => {
  expect(contrastRows(doc)).toEqual([expect.objectContaining({ patient: "PA", signature: "SBS1", diff: -0.2 })]);
});

test("Clade F1 filter exempts SNVs", () => {
  expect(passesCladeFilter({ vartype: "SNV", type: "Trunc" }, 0.2, 0.5)).toBe(true);
  expect(passesCladeFilter({ vartype: "SNV", type: "Trunc" }, 0.2, 0.5, { includeSnv: true })).toBe(false);
  expect(passesCladeFilter({ vartype: "SNV", type: "Trunc" }, 0.7, 0.5, { includeSnv: true })).toBe(true);
  expect(passesCladeFilter({ vartype: "AMP", type: "SCNA" }, 0.2, 0.5)).toBe(false);
  expect(passesCladeFilter({ vartype: "AMP" }, 0.7, 0.5)).toBe(true);
  expect(passesCladeFilter({ vartype: "fusion" }, NaN, 0.5)).toBe(true);
});
