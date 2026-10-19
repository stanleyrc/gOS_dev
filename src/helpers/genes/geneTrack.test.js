import {
  parseGeneMode, modelsPath, geneClass, normalizeModels, transcriptSegments, transcriptIntrons, exonInfo,
  unionIntervals, collapseGene, orderTranscripts, arrowGenesInWindow, chromosomesInWindow,
} from "./geneModels";
import {
  trackView, densityBins, packRows, placeLabels, visibleSpan, layoutCollapsed, layoutIsoforms, trackHeight, chevronPositions,
} from "./trackLayout";

// synthetic models: a plus-strand coding gene with two isoforms and a minus-strand lncRNA
const json = {
  chromosome: "7",
  genes: [
    { id: "G1", name: "AAA", type: "protein_coding", strand: "+", start: 100, end: 1000,
      transcripts: [
        { id: "T2", name: "AAA-202", type: "nonsense_mediated_decay", canonical: 0, cds: null, exons: [[900, 1000], [100, 200]] },
        { id: "T1", name: "AAA-201", type: "protein_coding", canonical: 1, basis: "MANE_Select", cds: [150, 950], exons: [[100, 200], [500, 600], [900, 1000]] },
      ] },
    { id: "G2", name: "BBB", type: "lncRNA", strand: "-", start: 5000, end: 6000,
      transcripts: [{ id: "T3", name: "BBB-201", type: "lncRNA", canonical: 1, cds: null, exons: [[5000, 5100], [5800, 6000]] }] },
  ],
};
const genes = normalizeModels(json, 1001);
const tx1 = genes[0].transcripts.find((t) => t.id === "T1");

describe("gene models", () => {
  it("parses the URL mode with a collapsed default", () => {
    expect(parseGeneMode("EXPANDED")).toBe("expanded");
    expect(parseGeneMode("squished")).toBe("squished");
    expect(parseGeneMode("bogus")).toBe("collapsed");
    expect(parseGeneMode(null)).toBe("collapsed");
    expect(modelsPath("chr7")).toBe("genes/hg38_models/chr7.json");
    expect(modelsPath("X")).toBe("genes/hg38_models/chrX.json");
  });

  it("classes gene types", () => {
    expect(geneClass("protein_coding")).toBe("coding");
    expect(geneClass("lncRNA")).toBe("noncoding");
    expect(geneClass("processed_pseudogene")).toBe("pseudo");
    expect(geneClass("IG_V_gene")).toBe("coding");
  });

  it("normalizes to place offsets with sorted exons", () => {
    expect(genes[0].offset).toBe(1000);
    expect(genes[0].chromosome).toBe("7");
    const t2 = genes[0].transcripts.find((t) => t.id === "T2");
    expect(t2.exons).toEqual([[100, 200], [900, 1000]]);
    expect([t2.txStart, t2.txEnd]).toEqual([100, 1000]);
    expect(tx1.canonical).toBe(true);
    expect(tx1.basis).toBe("MANE_Select");
  });

  it("splits exons into CDS and UTR", () => {
    expect(transcriptSegments(tx1)).toEqual([
      { start: 100, end: 149, kind: "utr", exon: 0 },
      { start: 150, end: 200, kind: "cds", exon: 0 },
      { start: 500, end: 600, kind: "cds", exon: 1 },
      { start: 900, end: 950, kind: "cds", exon: 2 },
      { start: 951, end: 1000, kind: "utr", exon: 2 },
    ]);
    expect(transcriptSegments(genes[1].transcripts[0]).every((s) => s.kind === "utr")).toBe(true);
    expect(transcriptIntrons(tx1)).toEqual([{ start: 201, end: 499 }, { start: 601, end: 899 }]);
  });

  it("numbers exons in transcription order with frames", () => {
    const plus = exonInfo(tx1, "+");
    expect(plus.map((e) => e.number)).toEqual([1, 2, 3]);
    expect(plus.map((e) => e.coding)).toEqual([51, 101, 51]);
    expect(plus.map((e) => e.frame)).toEqual([0, 0, 2]); // 51 % 3 = 0; (51 + 101) % 3 = 2
    const minus = exonInfo(tx1, "-");
    expect(minus.map((e) => e.number)).toEqual([3, 2, 1]);
    expect(minus[2].frame).toBe(0);
    expect(minus[1].frame).toBe(0); // 51 % 3
    expect(minus[0].frame).toBe(2); // 152 % 3
    expect(exonInfo(genes[1].transcripts[0], "-").map((e) => e.frame)).toEqual([null, null]);
    expect(plus[1].size).toBe(101);
  });

  it("collapses isoforms into a union model", () => {
    expect(unionIntervals([[5, 9], [1, 3], [4, 4], [20, 30]])).toEqual([[1, 9], [20, 30]]);
    const c = collapseGene(genes[0]);
    expect(c.span).toEqual([100, 1000]);
    expect(c.segments.filter((s) => s.kind === "cds").map((s) => [s.start, s.end])).toEqual([[150, 200], [500, 600], [900, 950]]);
    expect(c.segments.filter((s) => s.kind === "utr").map((s) => [s.start, s.end])).toEqual([[100, 149], [951, 1000]]);
  });

  it("orders canonical first", () => {
    expect(orderTranscripts(genes[0]).map((t) => t.id)).toEqual(["T1", "T2"]);
  });

  it("filters arrow genes and chromosomes by window", () => {
    const store = { geneTypes: ["gene", "CDS", "gene"], geneTitles: ["A", "A", "B"], genesStartPoint: [10, 12, 100], genesEndPoint: [20, 14, 120], genesStrand: ["+", "+", "-"] };
    expect(arrowGenesInWindow(store, 0, 50).map((g) => g.name)).toEqual(["A"]);
    expect(arrowGenesInWindow(store, 0, 500).length).toBe(2);
    const bins = { 1: { startPlace: 1, endPlace: 100 }, 2: { startPlace: 101, endPlace: 200 } };
    expect(chromosomesInWindow(bins, 90, 110).map((c) => c.chromosome)).toEqual(["1", "2"]);
    expect(chromosomesInWindow(bins, 150, 160).map((c) => c.chromosome)).toEqual(["2"]);
  });
});

describe("track layout", () => {
  const measure = (s) => s.length * 6;
  const x = (p) => (p - 1000) / 10; // 10 bp per px from place 1000

  it("chooses the data source by window size", () => {
    expect(trackView(0, 1e6, 3e9)).toBe("models");
    expect(trackView(0, 20e6, 3e9)).toBe("models");
    expect(trackView(0, 21e6, 3e9)).toBe("arrow");
    expect(trackView(0, 159e6, 3.1e9)).toBe("arrow");
    expect(trackView(0, 1e9, 3e9)).toBe("density");
  });

  it("bins genes by midpoint", () => {
    const d = densityBins([{ start: 0, end: 10 }, { start: 40, end: 60 }, { start: 90, end: 100 }, { start: 200, end: 300 }], 0, 100, 4);
    expect(d.counts).toEqual([1, 0, 1, 1]);
    expect(d.max).toBe(1);
    expect(d.binSize).toBe(25);
  });

  it("packs rows greedily and caps them", () => {
    expect(packRows([{ x0: 0, x1: 10 }, { x0: 5, x1: 15 }, { x0: 20, x1: 30 }, { x0: 6, x1: 9 }], { gap: 2 })).toEqual([0, 1, 0, 2]);
    expect(packRows([{ x0: 0, x1: 10 }, { x0: 5, x1: 15 }], { maxRows: 1 })).toEqual([0, -1]);
  });

  it("never overlaps labels and favours priority genes", () => {
    const kept = placeLabels([
      { key: "a", x: 50, w: 40 },
      { key: "egfr", x: 60, w: 30, priority: 1 },
      { key: "c", x: 200, w: 20 },
      { key: "edge", x: 2, w: 20 },
    ], 300);
    expect(kept.has("egfr")).toBe(true);
    expect(kept.has("a")).toBe(false);
    expect(kept.has("c")).toBe(true);
    expect(kept.get("edge").x0).toBe(0); // clamped inside the panel
    const spans = [...kept.values()].sort((p, q) => p.x0 - q.x0);
    for (let k = 1; k < spans.length; k += 1) expect(spans[k].x0).toBeGreaterThanOrEqual(spans[k - 1].x1);
  });

  it("clips visible spans", () => {
    expect(visibleSpan(x, 900, 1100, 50)).toEqual([0, 10]);
    expect(visibleSpan(x, 2000, 3000, 50)).toBeNull();
  });

  it("lays out collapsed genes with labels that fit", () => {
    const { items, rows } = layoutCollapsed(genes, x, 800, measure, { priority: new Set(["BBB"]) });
    expect(items.map((d) => d.gene.name)).toEqual(["BBB", "AAA"]);
    expect(items.every((d) => d.label)).toBe(true);
    expect(rows).toBe(1);
    expect(items[1].model.segments.length).toBe(5);
  });

  it("labels crowded genes in one row without overlaps", () => {
    const g = (id, start, end) => ({ id, name: id, offset: 0, start, end, strand: "+", transcripts: [] });
    const xs = (p) => p; // 1 bp per px
    const crowded = [g("AAAA", 0, 10), g("BBBB", 12, 20), g("CCCC", 100, 110), g("DDDD", 5, 8)];
    const { items, rows } = layoutCollapsed(crowded, xs, 300, measure, { maxRows: 1 });
    expect(rows).toBe(1);
    const labs = items.filter((d) => d.label).map((d) => d.label).sort((a, b) => a.x0 - b.x0);
    for (let k = 1; k < labs.length; k += 1) expect(labs[k].x0).toBeGreaterThanOrEqual(labs[k - 1].x1);
    expect(items.find((d) => d.gene.id === "CCCC").label).not.toBeNull();
    expect(items.length).toBe(4);
  });

  it("lays out isoforms canonical first, labels left of the model", () => {
    const wide = (p) => (p - 1000) / 2 + 100;
    const exp = layoutIsoforms(genes, wide, 4000, measure, { mode: "expanded" });
    const aaa = exp.items.filter((d) => d.gene.name === "AAA");
    expect(aaa.map((d) => d.tx.id)).toEqual(["T1", "T2"]);
    expect(aaa[0].row).toBeLessThan(aaa[1].row);
    expect(aaa[0].label.x1).toBeLessThanOrEqual(aaa[0].span[0]);
    const sq = layoutIsoforms(genes, wide, 4000, measure, { mode: "squished" });
    expect(sq.items.length).toBe(3);
    expect(sq.geneLabels.size).toBe(2);
    expect(sq.hidden).toBe(0);
  });

  it("sizes the track per mode with caps", () => {
    expect(trackHeight("collapsed", 2).visible).toBe(13 + 60 + 8);
    expect(trackHeight("expanded", 100).visible).toBe(420);
    expect(trackHeight("expanded", 100).content).toBe(1808);
    expect(trackHeight("squished", 3).visible).toBe(16 + 18 + 8);
  });

  it("spaces strand chevrons along introns", () => {
    expect(chevronPositions(0, 8)).toEqual([]);
    const c = chevronPositions(0, 100, 18, 5);
    expect(c.length).toBe(5);
    expect(c[0]).toBeGreaterThanOrEqual(5);
    expect(c[c.length - 1]).toBeLessThanOrEqual(95);
  });
});
