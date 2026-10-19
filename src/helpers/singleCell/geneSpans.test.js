import { parseGeneSpans, genesInside, genesInsideText, GENE_SPANS_FILE } from "./geneSpans";

const doc = {
  format: "gos-gene-spans/1",
  source: "gencode.test.rds",
  genes: [
    { gene: "LANCL2", chrom: "7", start: 55400000, end: 55450000, coding: true },
    { gene: "EGFR", chrom: "7", start: 55019017, end: 55211628, strand: "+", type: "protein_coding", coding: true },
    { gene: "SEC61G", chrom: "7", start: 54950000, end: 54990000, coding: true },
    { gene: "EGFR-AS1", chrom: "7", start: 55100000, end: 55120000, type: "lncRNA", coding: false },
    { gene: "OTHER", chrom: "8", start: 55100000, end: 55200000, coding: true },
    { gene: "BAD", chrom: "7" },
  ],
};

describe("gene spans", () => {
  test("file name and schema check", () => {
    expect(GENE_SPANS_FILE).toBe("gene_spans.json");
    expect(parseGeneSpans(null)).toBeNull();
    expect(parseGeneSpans({ format: "other", genes: [] })).toBeNull();
    expect(parseGeneSpans(doc)).toHaveLength(5);
  });
  test("genes inside a footprint: drivers first, then genomic order, coding only", () => {
    const spans = parseGeneSpans(doc);
    const g = genesInside(spans, "chr7:54900000-55500000");
    expect(g.genes).toEqual(["EGFR", "SEC61G", "LANCL2"]);
    expect(g).toMatchObject({ total: 3, drivers: 1 });
    expect(genesInside(spans, "7:54900000-55500000", { driverFirst: false }).genes).toEqual(["SEC61G", "EGFR", "LANCL2"]);
    expect(genesInside(spans, "7:54900000-55500000", { codingOnly: false }).total).toBe(4);
  });
  test("max, intervals array, multi-interval, no overlap", () => {
    const spans = parseGeneSpans(doc);
    const r = genesInside(spans, [{ chromosome: "7", start: 54900000, end: 55500000 }, { chromosome: "8", start: 1, end: 1e9 }], { max: 2 });
    expect(r.genes).toEqual(["EGFR", "SEC61G"]);
    expect(r.total).toBe(4);
    expect(genesInsideText(r)).toBe("EGFR, SEC61G (+2 more)");
    expect(genesInside(spans, "1:1-100")).toEqual({ genes: [], total: 0, drivers: 0 });
    expect(genesInsideText(genesInside(spans, "1:1-100"))).toBe("none");
    expect(genesInside(null, "7:1-10").total).toBe(0);
    expect(genesInsideText(null)).toBeNull();
  });
});
