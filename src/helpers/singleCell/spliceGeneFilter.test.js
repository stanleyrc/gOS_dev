import { DEFAULT_GENE_FILTER, exonContext, exonSuspect, geneFilterActive, geneFilterFromSearch, parseGeneList, passesGeneFilter, withGeneFilter } from "./spliceGeneFilter";
import { filterSpliceEvents, normalizeSpliceEvents } from "./spliceEventTable";
import { normalizeSpliceFindings } from "./rnaHeadlineFindings";

const item = (over = {}) => ({ gene: "PLXNA4", exonKnown: true, nExons: 32, intronOverlap: true, ...over });

describe("spliceGeneFilter", () => {
  it("classifies the exon context", () => {
    expect(exonContext(item())).toBe("multi_exon");
    expect(exonContext(item({ nExons: 1 }))).toBe("single_exon");
    expect(exonContext(item({ nExons: null }))).toBe("no_gene");
    expect(exonContext(item({ intronOverlap: false }))).toBe("no_intron");
    expect(exonContext({ exonKnown: false })).toBe("unknown");
    expect(exonSuspect(item({ nExons: 1 }))).toBe(true);
    expect(exonSuspect({ exonKnown: false })).toBe(false);
  });

  it("hides single-exon and out-of-intron calls by default, never unannotated files", () => {
    expect(passesGeneFilter(item())).toBe(true);
    expect(passesGeneFilter(item({ nExons: 1 }))).toBe(false);
    expect(passesGeneFilter(item({ intronOverlap: false }))).toBe(false);
    expect(passesGeneFilter(item({ nExons: 1 }), { ...DEFAULT_GENE_FILTER, multiExon: false })).toBe(true);
    expect(passesGeneFilter({ gene: "X", exonKnown: false })).toBe(true);
  });

  it("gene lists: GBM, cancer, custom", () => {
    expect(passesGeneFilter(item({ gene: "TP53" }), { list: "gbm" })).toBe(true);
    expect(passesGeneFilter(item({ gene: "PLXNA4" }), { list: "gbm" })).toBe(false);
    expect(passesGeneFilter(item({ gene: "PLXNA4", cancerGene: true }), { list: "cancer" })).toBe(true);
    expect(passesGeneFilter(item({ gene: "plxna4" }), { list: "custom", custom: ["PLXNA4", "RBFOX1"] })).toBe(true);
    expect(passesGeneFilter(item({ gene: "IGF2R" }), { list: "custom", custom: ["PLXNA4"] })).toBe(false);
    expect(parseGeneList("plxna4, RBFOX1;igf2r\nplxna4")).toEqual(["PLXNA4", "RBFOX1", "IGF2R"]);
  });

  it("round-trips through the URL (spx, spg) and omits defaults", () => {
    expect(geneFilterFromSearch("")).toEqual(DEFAULT_GENE_FILTER);
    expect(geneFilterFromSearch("?spx=0&spg=gbm")).toEqual({ multiExon: false, list: "gbm", custom: [] });
    expect(geneFilterFromSearch("?spg=egfr,pten")).toEqual({ multiExon: true, list: "custom", custom: ["EGFR", "PTEN"] });
    expect(withGeneFilter("?dataset=gbm-sc&tab=8", DEFAULT_GENE_FILTER)).toBe("?dataset=gbm-sc&tab=8");
    expect(withGeneFilter("?dataset=gbm-sc", { multiExon: false, list: "custom", custom: ["EGFR", "PTEN"] })).toBe("?dataset=gbm-sc&spx=0&spg=EGFR%2CPTEN");
    expect(withGeneFilter("?spx=0&spg=gbm", DEFAULT_GENE_FILTER)).toBe("");
    expect(geneFilterActive(DEFAULT_GENE_FILTER)).toBe(false);
    expect(geneFilterActive({ multiExon: false })).toBe(true);
  });

  it("filters events and normalises exon fields (older files stay visible)", () => {
    const raw = (id, gene, extra) => ({ id, cluster_id: `c_${id}`, gene, chromosome: "1", start: 10, end: 20, event_type: "novel_junction", recommended: true, summary: gene, ...extra });
    const events = normalizeSpliceEvents([raw("a", "PLXNA4", { n_exons: 32, intron_overlap: true }), raw("b", "SINGLE", { n_exons: 1, intron_overlap: false }), raw("c", "OLD", {})]);
    expect(events.map((e) => [e.exonKnown, e.nExons])).toEqual([[true, 32], [true, 1], [false, null]]);
    expect(filterSpliceEvents(events, { mode: "all", geneFilter: DEFAULT_GENE_FILTER }).map((e) => e.gene)).toEqual(["PLXNA4", "OLD"]);
    expect(filterSpliceEvents(events, { mode: "all", geneFilter: { ...DEFAULT_GENE_FILTER, multiExon: false } })).toHaveLength(3);
    const fs = normalizeSpliceFindings([{ kind: "patient_specific", text: "t", gene: "QKI", n_exons: 8, intron_overlap: false }]);
    expect(exonContext(fs[0])).toBe("no_intron");
  });
});
