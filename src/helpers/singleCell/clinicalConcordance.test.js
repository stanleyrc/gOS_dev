import { alterationLabel, buildGrid, cnPoints, eventForCell, gridStatus, metaStrip, patientClinical, summarize, tmbRows, vafPoints } from "./clinicalConcordance";

// synthetic fixtures only
const recovery = {
  patients: {
    ZZ1: {
      clinical_status: "ok",
      assays: [{ assay: "oncopanel", status: "ok" }],
      tmb: { clinical: 5, sc_truncal: 1, sc_subclonal: 2, sc_cell_median: 2.5 },
      snv: [
        { gene: "TP53", protein: "p.R1H", tier: 2, status: "recovered", clinical_vaf: 0.4, sc_vaf: 0.5, sc_carriers: 90, sc_covered: 100 },
        { gene: "APC", cdna: "c.-65G>C", tier: 4, status: "not_recovered", clinical_vaf: 0.5, sc_vaf: 0, germline_like: false },
        { gene: "TERT", status: "not_assessable", clinical_vaf: null },
      ],
      cnv: [
        { genes: ["EGFR"], type: "Amplification", clinical_copies: 40, median_cn: 20, mean_cn: 22, max_cn: 60, frac_cells: 0.9, status: "recovered" },
        { genes: ["A", "B", "C", "D"], location: "7 Chromosomal level", type: "Gain", frac_cells: 0.5, status: "partial" },
        { genes: ["A", "B", "C", "D"], location: "7 Chromosomal level", type: "Gain", frac_cells: 0.9, status: "recovered" },
      ],
      sv: [{ kind: "Fusion", left: { feature: "AAA", exon: 4 }, right: { feature: "BBB", exon: 2 }, status: "not_recovered" }],
      tert_promoter: [{ site: "C228T", status: "concordant_negative" }],
      missed: [{ gene: "X" }],
    },
    ZZ2: { clinical_status: "failed", assays: [{ assay: "oncopanel", status: "failed" }], snv: [], cnv: [], sv: [], tert_promoter: [], tmb: {} },
  },
};

describe("clinical concordance", () => {
  it("maps statuses onto the grid categories", () => {
    expect(["recovered", "concordant_negative", "partial", "discordant_negative", "not_recovered", "not_assessable", "not_covered"].map(gridStatus)).toEqual([
      "recovered", "recovered", "partial", "not_recovered", "not_recovered", "not_covered", "not_covered",
    ]);
  });
  it("labels alterations", () => {
    expect(alterationLabel("snv", { gene: "TP53", protein: "p.R1H" })).toBe("TP53 p.R1H");
    expect(alterationLabel("cnv", { genes: ["EGFR"], type: "Amplification" })).toBe("EGFR amp");
    expect(alterationLabel("cnv", { genes: ["A", "B", "C", "D"], location: "9p Arm level", type: "Loss" })).toBe("9p loss");
    expect(alterationLabel("sv", { kind: "Fusion", left: { feature: "AAA exon 3" }, right: { feature: "BBB" } })).toBe("AAA::BBB fusion");
  });
  it("builds the grid, merging duplicate labels and flagging patients without clinical data", () => {
    const g = buildGrid(recovery);
    expect(g.patients.map((p) => [p.id, p.clinicalOk, p.note])).toEqual([["ZZ1", true, null], ["ZZ2", false, "assay failed"]]);
    const chr7 = g.rows.find((r) => r.label === "7 gain");
    expect(chr7.cells.ZZ1.status).toBe("recovered");
    expect(g.rows.filter((r) => r.label === "7 gain")).toHaveLength(1);
    expect(g.rows[0].kind).toBe("snv");
    expect(buildGrid(recovery, { kinds: ["cnv"] }).rows.every((r) => r.kind === "cnv")).toBe(true);
    expect(buildGrid(recovery, { hideInvestigational: true }).rows.some((r) => r.label.startsWith("APC"))).toBe(false);
  });
  it("summarizes real counts per kind", () => {
    const s = summarize(recovery);
    expect(s.snv).toMatchObject({ recovered: 1, not_recovered: 1, not_covered: 1, total: 3, assessable: 2, recoveredShare: 0.5 });
    expect(s.cnv.recovered).toBe(2);
    expect(s.tert.recovered).toBe(1);
  });
  it("collects scatter and TMB points only where both values exist", () => {
    expect(vafPoints(recovery).map((p) => [p.label, p.x, p.y])).toEqual([["TP53 p.R1H", 0.4, 0.5], ["APC c.-65G>C", 0.5, 0]]);
    expect(cnPoints(recovery)).toHaveLength(1);
    expect(cnPoints(recovery)[0]).toMatchObject({ x: 40, y: 20, yMax: 60 });
    expect(tmbRows(recovery)).toEqual([{ patient: "ZZ1", clinical: 5, truncal: 1, clonal: 3, cellMedian: 2.5, note: null }]);
  });
  it("annotation strip shows real values, N/A and missing fields, never the obsolete count", () => {
    const assays = { clinical_meta: { source: "meta.txt", patients: {
      ZZ1: { sex: "Female", age: 70, location: "Left", mgmt: null, truncal_mutations_mapped: 2244, truncal_tree_sites: 2048, old_truncal_mutations: 4407 },
      ZZ2: { sex: "Male", age: 50, location: "Right", mgmt: "Methylated", truncal_mutations_mapped: null, truncal_mutations_mapped_note: "not available (no mapping for current tree)" } } } };
    const f = Object.fromEntries(metaStrip(assays, "ZZ1").map((x) => [x.key, x]));
    expect(f.sex.value).toBe("Female");
    expect(f.mgmt.value).toBeNull();
    expect(f.mgmt.why).toContain("N/A in source");
    expect(f.truncal.value).toBe("2,244");
    expect(f.truncal.sub).toBe("2,048 tree sites");
    expect(f.recurrence.why).toContain("not in any data file");
    expect(JSON.stringify(metaStrip(assays, "ZZ1"))).not.toContain("4407");
    expect(Object.fromEntries(metaStrip(assays, "ZZ2").map((x) => [x.key, x])).truncal.why).toContain("no mapping");
    expect(metaStrip(null, "ZZ1").every((x) => x.value === null)).toBe(true);
  });
  it("patient strip counts and absent patients", () => {
    const p = patientClinical({ patients: { ZZ1: { assays: [{ assay: "oncopanel", status: "ok", tmb_per_mb: 5 }] } } }, recovery, "ZZ1");
    expect(p).toMatchObject({ available: true, assessable: 7, missed: 1 });
    expect(p.counts).toEqual({ recovered: 4, partial: 1, not_recovered: 2, not_covered: 1, total: 8 });
    expect(patientClinical(null, null, "Q").available).toBe(false);
  });
  it("finds the event to open", () => {
    const events = [{ gene: "TP53", type: "Missense", Variant: "p.R1H", vartype: "SNV" }, { gene: "EGFR", type: "SCNA", vartype: "AMP" }, { gene: "EGFR", type: "SCNA", vartype: "HOMDEL" }, { gene: "X::Y", type: "Fusion", fusion_genes: "AAA::BBB" }];
    expect(eventForCell(events, { gene: "TP53", protein: "p.R1H" }, "snv")).toBe(events[0]);
    expect(eventForCell(events, { genes: ["EGFR"], type: "Amplification" }, "cnv")).toBe(events[1]);
    expect(eventForCell(events, { genes: ["EGFR"], type: "Loss" }, "cnv")).toBe(events[2]);
    expect(eventForCell(events, { left: { feature: "AAA exon 1" }, right: { feature: "BBB" } }, "sv")).toBe(events[3]);
    expect(eventForCell(events, { gene: "NOPE" }, "snv")).toBeNull();
  });
});
