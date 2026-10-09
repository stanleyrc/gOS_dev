import fixture from "./__fixtures__/rnaFusions.json";
import {
  canonicalGene,
  defaultRnaCells,
  dnaFusionGenes,
  filterFusions,
  fusionLoci,
  fusionStrip,
  isDnaFusionEvent,
  matchDnaEvent,
  matchRnaFusions,
  normalizeFusions,
  parseBreakpoint,
  rnaCellMaps,
} from "./rnaFusions";
import { buildIgvTracks, lociString, rnaTrackName } from "./igvTracks";

const data = normalizeFusions(fixture);
const [egfr, readThrough, met] = data.fusions;

describe("normalizeFusions", () => {
  it("fills labels, reads and breakpoints and sorts cells by reads", () => {
    expect(egfr.label).toBe("EGFR::SEPTIN14");
    expect(egfr.reads).toBe(11);
    expect(egfr.bp1).toEqual({ chromosome: "chr7", position: 55211628 });
    expect(egfr.cells.map((c) => c.rna_id)).toEqual(["r2", "r9", "r1"]);
    expect(readThrough.n_cells_dna).toBe(1);
  });
  it("rejects files without fusions", () => {
    expect(() => normalizeFusions({})).toThrow();
  });
  it("parses breakpoints with or without chr", () => {
    expect(parseBreakpoint("7:12")).toEqual({ chromosome: "7", position: 12 });
    expect(parseBreakpoint("junk")).toBeNull();
  });
});

describe("filterFusions", () => {
  it("applies min cells, confidence, read-through and query", () => {
    expect(filterFusions(data.fusions, { minCells: 2 }).map((f) => f.gene1)).toEqual(["EGFR", "PTPRZ1"]);
    expect(filterFusions(data.fusions, { confidence: "medium" }).length).toBe(2);
    expect(filterFusions(data.fusions, { hideReadThrough: true }).map((f) => f.gene1)).toEqual(["EGFR", "PTPRZ1"]);
    expect(filterFusions(data.fusions, { query: "met" }).map((f) => f.gene1)).toEqual(["PTPRZ1"]);
  });
});

describe("DNA <-> RNA fusion matching", () => {
  it("parses DNA fusion events", () => {
    expect(dnaFusionGenes({ gene: "EGFR::SEPT14", vartype: "fusion" })).toEqual(["EGFR", "SEPTIN14"]);
    expect(dnaFusionGenes({ gene: "EGFR", vartype: "AMP" })).toBeNull();
    expect(isDnaFusionEvent({ gene: "A::B", vartype: "outframe_fusion" })).toBe(true);
    expect(isDnaFusionEvent({ gene: "EGFR", vartype: "AMP" })).toBe(false);
    expect(canonicalGene("GENEB(1234)")).toBe("GENEB");
  });
  it("matches the same gene pair in either order and with renamed symbols", () => {
    expect(matchRnaFusions({ gene: "EGFR::SEPT14", vartype: "fusion" }, data.fusions)).toEqual([egfr]);
    expect(matchRnaFusions({ fusion_genes: "MET::PTPRZ1", gene: "MET::PTPRZ1", vartype: "fusion" }, data.fusions)).toEqual([met]);
    expect(matchRnaFusions({ gene: "GENEC::GENEA", vartype: "fusion" }, data.fusions)).toEqual([readThrough]);
    expect(matchRnaFusions({ gene: "TP53::MDM2", vartype: "fusion" }, data.fusions)).toEqual([]);
  });
  it("uses the back end's dna_match gene pair", () => {
    const f = { ...met, gene1: "X", gene2: "Y", dna_match: { kind: "breakpoint", event_gene: "AAA::BBB", distance: 10 } };
    expect(matchRnaFusions({ gene: "BBB::AAA", vartype: "fusion" }, [f])).toEqual([f]);
  });
  it("finds the DNA event of an RNA fusion", () => {
    const events = [{ gene: "CDK4", vartype: "AMP" }, { gene: "SEPT14::EGFR", vartype: "fusion", uid: "e2" }];
    expect(matchDnaEvent(egfr, events).uid).toBe("e2");
    expect(matchDnaEvent(met, events)).toBeNull();
  });
});

describe("cells and IGV", () => {
  it("maps rna ids to cells from every source", () => {
    const { cellOf, rnaOf } = rnaCellMaps(data.fusions, [{ rna_id: "r5", cell_id: "c5" }, { rna_id: "r6", cell_id: null }], { r7: "c7" });
    expect(cellOf.get("r5")).toBe("c5");
    expect(cellOf.get("r7")).toBe("c7");
    expect(cellOf.get("r2")).toBe("c3");
    expect(cellOf.has("r9")).toBe(false);
    expect(rnaOf.get("c3")).toBe("r2");
  });
  it("lays read support along the tree order", () => {
    const rnaOf = new Map([["c1", "r1"], ["c2", "r3"], ["c3", "r2"]]);
    const strip = fusionStrip(egfr, ["c3", "c2", "c1", "c9"], rnaOf);
    expect(Array.from(strip.values)).toEqual([6, 0, 2, -1]);
    expect(strip.rnaOnly).toEqual([3]);
    expect(strip.max).toBe(6);
    expect(strip.onTree).toBe(2);
  });
  it("picks default cells, preferring the shown DNA cells", () => {
    expect(defaultRnaCells(egfr, 2)).toEqual(["r2", "r9"]);
    expect(defaultRnaCells(egfr, 2, ["c1"])).toEqual(["r1", "r2"]);
  });
  it("builds DNA + RNA tracks and multi-locus strings", () => {
    const loci = fusionLoci(met);
    expect(lociString(loci, 100)).toBe("chr7:121899900-121900100 chr7:116699900-116700100");
    const tracks = buildIgvTracks({
      dnaCellIds: ["c1"],
      rnaTracks: [{ rna_id: "r1", bam: "rna/reads/r1.bam", patientId: "P1" }, { rna_id: "bad" }],
      pathFor: (folder, file) => `data/${folder}/${file}`,
      sortAt: loci[0],
    });
    expect(tracks).toHaveLength(2);
    expect(tracks[0]).toMatchObject({ name: "c1", url: "data/c1/reads.bam", indexURL: "data/c1/reads.bam.bai", type: "alignment" });
    expect(tracks[0].sort).toMatchObject({ chr: "chr7", position: 121900000 });
    expect(tracks[1]).toMatchObject({ id: rnaTrackName("r1"), name: rnaTrackName("r1"), url: "data/P1/rna/reads/r1.bam", indexURL: "data/P1/rna/reads/r1.bam.bai", groupBy: "tag:ZF", colorBy: "tag:ZF" });
  });
});

describe("real BWH70 fusions.json (no BAM slices yet)", () => {
  const real = require("./__fixtures__/rnaFusions.BWH70.json");
  const { geneDisplay, isNonProductive } = require("./rnaFusions");
  it("normalises 800 fusions quickly", () => {
    const t0 = Date.now();
    const out = normalizeFusions(real);
    expect(out.fusions.length).toBe(802);
    expect(Date.now() - t0).toBeLessThan(500);
    const mast = out.fusions.find((f) => f.gene1 === "MAST4");
    expect(mast.label).toBe("MAST4::MOCS2-DT");
    expect(typeof mast.known).toBe("boolean");
  });
  it("splits intergenic gene strings for display", () => {
    expect(geneDisplay("MOCS2-DT(168033),ENSG00000285831(2166)")).toEqual({ name: "MOCS2-DT", rest: ["ENSG00000285831(2166)"], full: "MOCS2-DT(168033),ENSG00000285831(2166)", intergenic: true });
    expect(isNonProductive({ type: "inversion/3'-3'" })).toBe(true);
    expect(isNonProductive({ type: "translocation" })).toBe(false);
  });
  it("finds the RNA support of the DNA fusion events", () => {
    const out = normalizeFusions(real);
    ["EGFR::LANCL2", "LANCL2::EGFR", "PDE10A::DYNLT1", "PRDM16::AGO3"].forEach((gene) => {
      expect(matchRnaFusions({ gene, vartype: "fusion" }, out.fusions).length).toBeGreaterThan(0);
    });
    expect(matchRnaFusions({ gene: "ARID1A::PPP1R8", vartype: "fusion" }, out.fusions)).toEqual([]);
  });
  it("keeps DNA-matched fusions below the cell threshold, hides read-through", () => {
    const out = normalizeFusions(real);
    const shown = filterFusions(out.fusions, { minCells: 2, hideReadThrough: true, keepDnaMatched: true });
    expect(shown.some((f) => f.dna_match)).toBe(true);
    expect(shown.some((f) => /read-?through/.test(f.type))).toBe(false);
    expect(shown.length).toBeLessThan(60);
    // cells without slices: no default IGV cells
    expect(defaultRnaCells(out.fusions[0], 6)).toEqual([]);
  });
});

describe("mergeLoci", () => {
  const { mergeLoci } = require("./igvTracks");
  it("appends RNA breakpoints not already near a DNA locus", () => {
    const dna = [{ chromosome: "7", position: 55019017 }, { chromosome: "7", position: 55365448 }];
    const rna = [{ chromosome: "chr7", position: 55019100 }, { chromosome: "chr7", position: 55400000 }];
    expect(mergeLoci(dna, rna)).toEqual([dna[0], dna[1], rna[1]]);
  });
});
