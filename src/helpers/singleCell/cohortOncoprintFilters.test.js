import { cohortEntries, DEFAULT_ONCOPRINT } from "./cohortOncoprint";
import {
  DEFAULT_OC_FILTERS,
  annotateEntries,
  clearFilter,
  countsLine,
  entryRole,
  failedFilters,
  filterChips,
  filterOncoprint,
  filteredAddedGenes,
  parseGeneList,
  parseOcState,
  serializeOcState,
} from "./cohortOncoprintFilters";

const ev = (o) => ({ seqnames: "7", start: "100", end: "200", Genome_Location: "7:100-200", n_cells: "10", cells: "10/20", cell_fraction: "0.5", cell_ids: "", ...o });
const A = [
  ev({ gene: "EGFR", vartype: "AMP", type: "SCNA", Tier: 1, role: "Oncogene", cell_fraction: "0.98", n_cells: "20", cells: "20/20" }),
  ev({ gene: "TP53", vartype: "SNV", type: "Missense", Variant: "p.R175H", Tier: 1, role: "Tumor Suppressor", Genome_Location: "17:7-7", cell_fraction: "0.4" }),
  ev({ gene: "PRKDC", vartype: "SNV", type: "Nonsense", Variant: "p.K2970*", Tier: 2, role: "Tumor Suppressor", Genome_Location: "8:7-7", cell_fraction: "0.1", n_cells: "2", cells: "2/20" }),
  ev({ gene: "A::B", fusion_genes: "A::B", vartype: "fusion", type: "Fusion", Tier: 1, role: "Oncogene", Genome_Location: "1:1-2", cell_fraction: "0.2", n_cells: "4", cells: "4/20", upstream_only: true }),
];
const B = [
  ev({ gene: "PRKDC", vartype: "SNV", type: "Splice", Tier: 2, role: "Tumor Suppressor", Genome_Location: "8:9-9", cell_fraction: "0.13", n_cells: "5", cells: "5/40" }),
  ev({ gene: "TP53", vartype: "SNV", type: "Missense", Tier: 1, role: "Tumor Suppressor", Genome_Location: "17:9-9", cell_fraction: "0.7" }),
  ev({ gene: "", vartype: "DM", type: "Complex SV", Genome_Location: "12:1-9", cell_fraction: "0.6", n_cells: "12" }),
];
const byP = () => ({ A: cohortEntries(A), B: cohortEntries(B), C: cohortEntries([ev({ gene: "EGFR", vartype: "AMP", type: "SCNA", Tier: 1, role: "Oncogene", cell_fraction: "0.2" })]) });
const sel = { ...DEFAULT_ONCOPRINT, preset: "all" };
const genes = (r) => r.grid.rows.map((x) => x.gene).sort();

describe("entry filters", () => {
  it("default hides events with fewer than 3 carrier cells and counts them", () => {
    const r = filterOncoprint(byP(), sel);
    expect(r.hidden.events).toBe(1);
    expect(r.hidden.byFilter.cells).toBe(1);
    expect(r.grid.rows.find((x) => x.gene === "PRKDC").nPatients).toBe(1); // only B's splice
  });
  it("role, clonality, consequence, tier", () => {
    const e = byP().A;
    expect(entryRole(e.find((d) => d.genes[0] === "EGFR"))).toBe("oncogene");
    expect(entryRole(e.find((d) => d.cls === "fusion"))).toBe("fusion");
    expect(genes(filterOncoprint(byP(), sel, { roles: ["tsg"], minCells: 1 }))).toEqual(["PRKDC", "TP53"]);
    expect(genes(filterOncoprint(byP(), sel, { clonality: "clonal", minCells: 1 }))).toEqual(["EGFR"]);
    expect(genes(filterOncoprint(byP(), sel, { consequences: ["splice"], minCells: 1 }))).toEqual(["PRKDC"]);
    expect(genes(filterOncoprint(byP(), sel, { maxTier: 1, minCells: 1 }))).not.toContain("PRKDC");
  });
  it("gene lists (NHEJ), custom list and search", () => {
    expect(genes(filterOncoprint(byP(), sel, { lists: ["nhej"], minCells: 1 }))).toEqual(["PRKDC"]);
    expect(genes(filterOncoprint(byP(), sel, { custom: parseGeneList("egfr, tp53"), minCells: 1 }))).toEqual(["EGFR", "TP53"]);
    expect(genes(filterOncoprint(byP(), sel, { search: "kdc", minCells: 1 }))).toEqual(["PRKDC"]);
    expect(parseGeneList("a b,c;a")).toEqual(["A", "B", "C"]);
  });
  it("fraction range and upstream-only fusions", () => {
    const hi = genes(filterOncoprint(byP(), sel, { minFrac: 0.5, minCells: 1 }));
    expect(hi).toEqual(expect.arrayContaining(["EGFR", "TP53"]));
    expect(hi).not.toContain("PRKDC");
    const r = filterOncoprint(byP(), sel, { noUpstream: true, minCells: 1 });
    expect(genes(r)).not.toContain("A::B");
  });
  it("Clade F1 range uses the annotated fit; entries without a score stay", () => {
    const tree = { leaves: ["c1", "c2", "c3", "c4"], nodes: [] };
    const e = annotateEntries(cohortEntries(A), { tree });
    expect(e.every((d) => Number.isNaN(d.fit) || typeof d.fit === "number")).toBe(true);
    const fake = { ...e[0], fit: 0.3 };
    expect(failedFilters(fake, { minF1: 0.5 })).toContain("f1");
    expect(failedFilters({ ...fake, fit: NaN }, { minF1: 0.5 })).not.toContain("f1");
    expect(failedFilters({ ...fake, fit: 0.95 }, { maxF1: 0.9 })).toContain("f1");
  });
  it("site-QC verdict and fusion support", () => {
    const snv = { ...cohortEntries(A)[1], verdict: "artefact" };
    expect(failedFilters(snv, { verdicts: ["supported", "weak"] })).toContain("verdict");
    expect(failedFilters({ ...snv, verdict: "supported" }, { verdicts: ["supported"] })).not.toContain("verdict");
    expect(failedFilters({ ...snv, verdict: null }, { verdicts: ["supported"] })).not.toContain("verdict"); // no evidence loaded: kept
    const fu = cohortEntries(A).find((d) => d.cls === "fusion");
    expect(failedFilters(fu, { fusionSupport: "rna" })).toContain("fusion");
    expect(failedFilters({ ...fu, rnaCells: [1] }, { fusionSupport: "both" })).not.toContain("fusion");
  });
});

describe("row and patient filters", () => {
  it("min patients per row (recurrence) and max rows", () => {
    const r = filterOncoprint(byP(), sel, { minPatients: 2, minCells: 1 });
    expect(genes(r)).toEqual(["EGFR", "PRKDC", "TP53"]);
    expect(r.hidden.byFilter.patientsPerRow).toBeGreaterThan(0);
    expect(filterOncoprint(byP(), sel, { maxRows: 1, minCells: 1 }).grid.rows).toHaveLength(1);
  });
  it("patient subset and hide empty patients", () => {
    const r = filterOncoprint(byP(), sel, { patients: ["A", "C"], minCells: 1 });
    expect(r.grid.patients).toEqual(["A", "C"]);
    const e = filterOncoprint(byP(), sel, { lists: ["nhej"], hideEmpty: true, minCells: 1 });
    expect(e.grid.patients).toEqual(["A", "B"]);
    expect(e.hidden.patients).toBe(1);
  });
});

describe("chips, counts, URL state", () => {
  it("chips only for non-default filters, with per-filter counts, and Reset per chip", () => {
    expect(filterChips(DEFAULT_OC_FILTERS)).toEqual([]);
    const f = { ...DEFAULT_OC_FILTERS, minPatients: 2, clonality: "subclonal", lists: ["nhej"] };
    const r = filterOncoprint(byP(), sel, f);
    const chips = filterChips(f, r.hidden);
    expect(chips.map((c) => c.key)).toEqual(["lists", "clonality", "minPatients"]);
    expect(chips[0].tip).toMatch(/hides \d+ events/);
    expect(clearFilter(f, "lists").lists).toEqual([]);
    expect(countsLine(r.grid, r.hidden)).toMatch(/^\d+ rows × \d+ patients/);
  });
  it("explains added genes hidden by the filters", () => {
    expect(filteredAddedGenes(byP(), ["PRKDC"], { ...DEFAULT_OC_FILTERS, clonality: "clonal" })[0].reason).toMatch(/hidden by the Filters \(clonality/);
    expect(filteredAddedGenes(byP(), ["EGFR"], DEFAULT_OC_FILTERS)).toEqual([]);
  });
  it("round-trips through the URL parameter, default state gives no parameter", () => {
    expect(serializeOcState(DEFAULT_OC_FILTERS, DEFAULT_OC_FILTERS)).toBeNull();
    const f = { ...DEFAULT_OC_FILTERS, minPatients: 2, maxTier: "2d", lists: ["nhej", "hr"], verdicts: ["weak"] };
    expect(parseOcState(serializeOcState(f, DEFAULT_OC_FILTERS), DEFAULT_OC_FILTERS)).toEqual(f);
    expect(parseOcState("{bad", DEFAULT_OC_FILTERS)).toEqual(DEFAULT_OC_FILTERS);
    expect(parseOcState(JSON.stringify({ minPatients: "x" }), DEFAULT_OC_FILTERS).minPatients).toBe(1);
  });
});
