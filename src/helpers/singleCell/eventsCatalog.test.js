import { buildPatientRows, catalogLinkQuery, catalogToCsv, countOmittedNoncoding, countsByType, emptyCatalogFilters, filterCatalogRows, missingSources, siteKeyOfEvent, siteKeyOfVariantId, sortCatalogRows } from "./eventsCatalog";

const ev = (o) => ({ gene: "", Tier: 3, n_cells: 5, cell_fraction: 0.5, seqnames: "7", start: "100", end: "900", ...o });
const files = {
  events: [
    ev({ gene: "EGFR", type: "SCNA", vartype: "AMP", Tier: 1, n_cells: 80, cell_fraction: 0.8 }),
    ev({ gene: "PTEN", type: "SCNA", vartype: "HOMDEL", Tier: 1, n_cells: 40, cell_fraction: 0.4, seqnames: "10" }),
    ev({ gene: "TP53", type: "Missense", vartype: "SNV", Variant: "p.R1H", Variant_g: "17:7000-7000 C>T", Tier: 2, n_cells: 10, cell_fraction: 0.1 }),
    ev({ gene: "XX", type: "SCNA", vartype: "", Tier: null }),
    ev({ gene: "A::B", fusion_genes: "A::B", type: "Fusion", vartype: "fusion", Variant: "In-Frame", Tier: 3 }),
  ],
  variants: [
    { id: "chr17_7000_C_T", gene: "TP53", consequence: "missense_variant", protein: "p.R1H", driver: true, category: "subclonal", alt_cells: 10, alt_in_clade: 5, ref_in_clade: 1, alt_outside_clade: 5, ref_outside_clade: 90, node: 3, clade_cells: 6 },
    { id: "chr2_500_A_G", gene: "GENE2", consequence: "missense_variant", protein: "p.A2G", driver: false, category: "truncal", alt_cells: 60, alt_in_clade: 60, ref_in_clade: 0, alt_outside_clade: 0, ref_outside_clade: 40 },
    { id: "chr3_9_A_G", gene: "ENSG0001", consequence: "intron_variant", driver: false, category: "private", alt_cells: 1, alt_in_clade: 1, ref_in_clade: 0, alt_outside_clade: 0, ref_outside_clade: 99 },
    { id: "chr4_9_A_G", gene: "G4", consequence: "missense_variant", driver: false, category: "private", alt_cells: 0 },
  ],
  rnaFusions: [{ gene1: "FOO(12)", gene2: "BAR", breakpoint1: "chr1:5", breakpoint2: "chr1:99", type: "deletion", n_cells: 3, cell_fraction: 0.03, tier: 2, confidence: "high" }],
  walks: { n_cells: 100, walks: [{ id: "1", label: "EGFR 1", genes: ["EGFR"], driver_genes: "EGFR", ncells: 81, circular: true, span: 1.5e6, coordinates: "7:1-2;7:5-6;7:9-10", median_cn: 53 }] },
};

describe("eventsCatalog", () => {
  const rows = buildPatientRows("P1", files);
  it("builds one row per event of every exported type and dedupes SNV sites", () => {
    const c = Object.fromEntries(countsByType(rows).map((t) => [t.key, t.count]));
    expect(c).toMatchObject({ amp: 1, homdel: 1, cnother: 1, snv: 2, fusion: 1, rnafusion: 1, ecdna: 1 });
    expect(rows.filter((r) => r.type === "snv").map((r) => r.gene).sort()).toEqual(["GENE2", "TP53"]);
  });
  it("keeps non-coding sites out unless asked, and counts them", () => {
    expect(countOmittedNoncoding(files)).toBe(1);
    expect(buildPatientRows("P1", files, { includeNoncoding: true }).filter((r) => r.type === "snv")).toHaveLength(3);
  });
  it("computes carrier fraction and clonality of a matrix site", () => {
    const r = rows.find((x) => x.gene === "GENE2");
    expect(r).toMatchObject({ nCells: 60, clonality: "clonal", locus: "chr2:500" });
    expect(r.fraction).toBeCloseTo(0.6, 5);
    expect(rows.find((x) => x.type === "ecdna")).toMatchObject({ nCells: 81, fraction: 0.81, driver: true });
  });
  it("matches site keys of events and variants", () => {
    expect(siteKeyOfEvent(files.events[2])).toBe(siteKeyOfVariantId("chr17_7000_C_T"));
  });
  it("filters by text, type, min cells and driver-only", () => {
    expect(filterCatalogRows(rows, { ...emptyCatalogFilters(), query: "egfr" })).toHaveLength(2);
    expect(filterCatalogRows(rows, { ...emptyCatalogFilters(), query: "p1 chr10" }).map((r) => r.gene)).toEqual(["PTEN"]);
    expect(filterCatalogRows(rows, { ...emptyCatalogFilters(), types: ["snv"], minCells: 20 }).map((r) => r.gene)).toEqual(["GENE2"]);
    expect(filterCatalogRows(rows, { ...emptyCatalogFilters(), driverOnly: true }).every((r) => r.driver)).toBe(true);
  });
  it("sorts with missing values last and stable ties", () => {
    expect(sortCatalogRows(rows, "nCells", "desc")[0].nCells).toBe(81);
    expect(sortCatalogRows(rows, "tier", "asc").slice(-1)[0].tier).toBe(null);
  });
  it("writes CSV with quoting and a link query", () => {
    const csv = catalogToCsv([{ ...rows[0], detail: 'a,"b"' }]);
    expect(csv.split("\n")[0]).toBe("patient,type,gene,locus,detail,n_cells,cell_fraction,clonality,driver_tier,driver,clade,source_file");
    expect(csv).toContain('"a,""b"""');
    expect(catalogLinkQuery(rows[0])).toBe("dataset=gbm-sc&report=P1&tab=7&heatmap=cn&location=EGFR");
    expect(catalogLinkQuery(rows.find((r) => r.type === "ecdna"))).toContain("tab=14&walk=EGFR+1");
  });
  it("reports missing source files", () => {
    expect(missingSources({ events: [] }).map((m) => m.reason)).toEqual(["SNV matrix (snv_variants.json) not available", "rna/fusions.json not available", "walks.json not available"]);
  });
});
