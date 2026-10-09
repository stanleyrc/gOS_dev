import {
  byNotability,
  clusterNotability,
  findingIgvView,
  findingSliceCount,
  fusionHeadlines,
  fusionText,
  isNotable,
  normalizeSpliceFindings,
  pageOf,
  rnaFindingCounts,
  rnaHeadlineItems,
  severityOf,
} from "./rnaHeadlineFindings";
import { cohortClusterRows, normalizeSplicing } from "./splicing";

const raw = [
  {
    id: "patient_specific:clu_17_7670716_7673534_-:MGH285",
    kind: "patient_specific",
    patient: "MGH285",
    gene: "TP53",
    cluster_id: "clu_17_7670716_7673534_-",
    score: 14.1,
    severity: "high",
    flags: [],
    text: "TP53: 58 of 59 reads (11 cells) use an unannotated acceptor 44 bp into the intron next to exon 10 (exon extended), frameshift; 0% in the 6 other patients with coverage",
    junction: { chromosome: "17", start: 7670760, end: 7673534, type: "novel_acceptor" },
    cells: ["c1", "c2", "c3"],
    loci: [{ chromosome: "17", position: 7670759 }, { chromosome: "17", position: 7673535 }],
  },
  {
    kind: "patient_specific",
    patient: "MGH305",
    gene: "NOTCH2NLB",
    cluster_id: "clu_1",
    score: 1.2,
    flags: ["paralog/repeat family"],
    text: "NOTCH2NLB: ...",
    cells: "c9",
    loci: [{ chromosome: "chr1", position: 10 }],
  },
  { kind: "clone_differential", patient: "MGH285", gene: "STX8", cluster_id: "clu_2", clone: 12, score: 3.5, text: "STX8: clone 12 ...", cells: [], loci: [] },
  { kind: "bogus", text: "x" },
  { kind: "known_variant", text: "" },
];

describe("splicing findings", () => {
  it("normalizes, sorts by score and derives missing severities", () => {
    const f = normalizeSpliceFindings(raw);
    expect(f.map((x) => x.gene)).toEqual(["TP53", "STX8", "NOTCH2NLB"]);
    expect(f[0].clusterId).toBe("clu_17_7670716_7673534_-");
    expect(f[1].severity).toBe("moderate");
    expect(f[1].clone).toBe("12");
    expect(f[2].severity).toBe("artefact");
    expect(f[2].cells).toEqual(["c9"]);
    expect(f[2].loci[0].chromosome).toBe("1");
    expect(f[2].id).toBe("patient_specific:clu_1:MGH305");
    expect(normalizeSpliceFindings(undefined)).toEqual([]);
    expect(severityOf(6)).toBe("high");
    expect(severityOf(2)).toBe("low");
    expect(severityOf(9, true)).toBe("artefact");
    expect(f.filter(isNotable).map((x) => x.gene)).toEqual(["TP53", "STX8"]);
  });
  it("is part of normalizeSplicing (and empty for older files)", () => {
    expect(normalizeSplicing({ variants: [], clusters: [], findings: raw }).findings).toHaveLength(3);
    expect(normalizeSplicing({ variants: [], clusters: [] }).findings).toEqual([]);
  });
  it("builds an IGV view from the finding cells with slices", () => {
    const [tp53] = normalizeSpliceFindings(raw);
    const reads = { c1: "rna/splice_reads/c1.bam", c3: "rna/splice_reads/c3.bam" };
    expect(findingSliceCount(tp53, reads)).toBe(2);
    const v = findingIgvView(tp53, reads, "MGH285");
    expect(v.rnaTracks.map((r) => r.rna_id)).toEqual(["c1", "c3"]);
    expect(v.rnaTracks[0].patientId).toBe("MGH285");
    expect(v.loci).toHaveLength(2);
    expect(v.chromosome).toBe("17");
    expect(findingIgvView(tp53, {}, "MGH285")).toBeNull();
  });
});

const fusions = [
  { label: "VOPP1::GLI1", gene1: "VOPP1", gene2: "GLI1", tier: 2, n_cells: 7, tier_reasons: ["cancer gene GLI1 (oncogene)", "in 3% of RNA cells"] },
  { label: "VOPP1::GLI1", gene1: "VOPP1", gene2: "GLI1", tier: 2, n_cells: 4, tier_reasons: [] },
  { label: "A::B", gene1: "A", gene2: "B", tier: 3, n_cells: 50 },
  { label: "EGFR::SEPT14", gene1: "EGFR", gene2: "SEPT14", tier: 1, n_cells: 2, tier_reasons: ["known"] },
];

describe("fusion headlines", () => {
  it("groups tier 1-2 fusions by pair, best tier first", () => {
    const h = fusionHeadlines(fusions);
    expect(h.map((x) => x.label)).toEqual(["EGFR::SEPT14", "VOPP1::GLI1"]);
    expect(h[1].nBreakpoints).toBe(2);
    expect(h[1].nCells).toBe(7);
    expect(fusionText(h[1], 276)).toBe("VOPP1::GLI1: tier 2 fusion in 7 cells (3% of RNA cells), 2 breakpoints — cancer gene GLI1 (oncogene)");
  });
  it("counts findings for the sub-tab label and orders the headline items", () => {
    const splicing = normalizeSpliceFindings(raw);
    expect(rnaFindingCounts({ splicing, fusions })).toEqual({ splicing: 2, fusions: 2, total: 4 });
    const items = rnaHeadlineItems({ splicing, fusions, nCellsRna: 276, max: 3 });
    expect(items.map((x) => x.gene)).toEqual(["TP53", "EGFR::SEPT14", "STX8"]);
    expect(items[1].severity).toBe("high");
    expect(rnaHeadlineItems({})).toEqual([]);
  });
});

describe("cluster notability", () => {
  const rows = [
    { id: "a", dpsi: 0.9, q: 1e-6, types: ["annotated"], cluster: {} },
    { id: "b", dpsi: 0.2, q: NaN, types: ["annotated", "novel_acceptor"], cluster: { finding_score: 2 } },
    { id: "c", dpsi: 0.9, q: 1e-6, types: ["annotated", "novel"], cluster: { artefact: true } },
    { id: "d", dpsi: NaN, q: NaN, types: [], cluster: {} },
  ];
  it("puts findings first, then the stand-in score", () => {
    expect([...rows].sort(byNotability).map((r) => r.id)).toEqual(["b", "a", "c", "d"]);
    expect(clusterNotability(rows[0]).score).toBeCloseTo(2.7);
    expect(clusterNotability(rows[2]).score).toBeCloseTo(0.81);
    expect(clusterNotability(rows[1])).toEqual({ hasFinding: true, score: 2 });
  });
  it("finds the table page of a row", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `x${i}` }));
    expect(pageOf(many, "x0", 8)).toBe(1);
    expect(pageOf(many, "x8", 8)).toBe(2);
    expect(pageOf(many, "x19", 8)).toBe(3);
    expect(pageOf(many, "nope", 8)).toBe(1);
  });
});

describe("cohort ranking", () => {
  it("orders by the back-end rank before q (p ties)", () => {
    const cohort = {
      patients: ["P1"],
      clusters: [
        { id: "x", q: 0, max_dpsi: 1, rank: 2, junctions: [], usage: {} },
        { id: "y", q: 0, max_dpsi: 0.5, rank: 1, junctions: [], usage: {} },
        { id: "z", q: 0, max_dpsi: 0.98, junctions: [], usage: {} },
      ],
    };
    expect(cohortClusterRows(cohort).map((r) => r.id)).toEqual(["y", "x", "z"]);
  });
});
