// Synthetic rows only (no patient data).
import { clonalityBucket, exportedClonality, exportedClonalityText, subclonalFlag } from "./exportedClonality";
import { buildDriverEntries } from "./driverLayer";
import { cohortEntries } from "./cohortOncoprint";
import { buildPatientReport } from "./patientReport";
import { eventQuality } from "./eventQuality";
import { clonalityText } from "./subclonalDrivers";

const cells = Array.from({ length: 40 }, (_, i) => `c${i}`);
const tert = (extra = {}) => ({
  gene: "TERT", vartype: "Hotspot", type: "Promoter", Variant: "C228T (promoter, -124 C>T)", Tier: 1, seqnames: "5", start: "1295113", end: "1295113",
  Genome_Location: "5:1295113-1295113", Variant_g: "5:1295113-1295113 G>A", source: "site evidence (not in SNV calls)", rescued: true,
  cell_ids: cells.slice(0, 20).join(","), n_cells: 20, cells: "20/32", cell_fraction: 0.625, covered_tumour_cells: 32, tumour_cells: 40, low_coverage: false,
  hotspot_evidence: { verdict: { level: "supported" } }, ...extra,
});
const dropout = (status) => ({ clonality: status, clonality_method: "dropout-aware", clonality_stats: { status, observed_detection: 0.625, expected_detection: 0.58, n_covered: 32, p_detection: 0.8, p_clade_restriction: 0.6 } });

describe("exportedClonality", () => {
  it("reads only dropout-aware calls", () => {
    expect(exportedClonality(tert(dropout("clonal")))).toBe("clonal");
    expect(exportedClonality(tert({ clonality: "subclonal" }))).toBeNull(); // old fraction-rule label: not trusted
    expect(exportedClonality(null)).toBeNull();
  });
  it("buckets and flags", () => {
    expect(clonalityBucket(tert(dropout("indeterminate")), 0.6)).toBe("unassessed");
    expect(clonalityBucket(tert(), 0.6)).toBe("subclonal");
    expect(clonalityBucket(tert(), 0.05)).toBe("rare");
    expect(subclonalFlag(tert(dropout("clonal")), true)).toBe(false);
    expect(subclonalFlag(tert(), () => true)).toBe(true);
    expect(exportedClonalityText(tert(dropout("clonal")))).toMatch(/63% of 32 covered cells vs 58% expected/);
  });
});

describe("consumers prefer the exported call over cell_fraction", () => {
  it("driver layer", () => {
    const [clonal] = buildDriverEntries([tert(dropout("clonal"))], { tumorIds: cells });
    expect(clonal.fraction).toBeCloseTo(0.625);
    expect(clonal.subclonal).toBe(false);
    expect(clonal.clonality).toBe("clonal");
    const [legacy] = buildDriverEntries([tert()], { tumorIds: cells });
    expect(legacy.subclonal).toBe(true); // no export: fraction rule unchanged
    const [sub] = buildDriverEntries([tert(dropout("subclonal"))], { tumorIds: cells });
    expect(sub.subclonal).toBe(true);
  });
  it("cohort oncoprint", () => {
    expect(cohortEntries([tert(dropout("clonal"))])[0].subclonal).toBe(false);
    expect(cohortEntries([tert()])[0].subclonal).toBe(true);
  });
  it("patient report", () => {
    const r = buildPatientReport({ patient: "P", events: [tert(dropout("clonal"))], cells: cells.map((id) => ({ id, clone: "Clone 1" })) });
    expect(r.clonal.map((d) => d.gene)).toContain("TERT");
    expect(r.subclonal.map((d) => d.gene)).not.toContain("TERT");
    const r2 = buildPatientReport({ patient: "P", events: [tert(dropout("indeterminate"))], cells: cells.map((id) => ({ id, clone: "Clone 1" })) });
    expect([...r2.clonal, ...r2.subclonal].map((d) => d.gene)).not.toContain("TERT");
  });
  it("event quality and subclonal-drivers text", () => {
    expect(eventQuality(tert(dropout("clonal")), "promoter", { fraction: 0.625 }).clonality).toBe("clonal");
    expect(eventQuality(tert(), "promoter", { fraction: 0.625 }).clonality).toBe("subclonal");
    expect(clonalityText({ carrier_fraction: 0.6, clonality_test: { status: "clonal", observed_detection: 0.6, expected_detection: 0.55, n_covered: 30 } })).toMatch(/^clonal \(dropout-aware/);
    expect(clonalityText({ carrier_fraction: 0.6 })).toBe("60% of tumour cells · not on the tree");
  });
});
