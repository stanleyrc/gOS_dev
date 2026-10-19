import { pinnedEvents, compressedLayout, describeEvent, domainContext, geneContext, junctionArcs, junctionGeometry, unionIntervals, zoomView } from "./spliceContext";
import { clusterEvents, clusterTranscripts } from "./spliceEvents";

// synthetic + strand gene: exons 100-199, 1000-1099, 5000-5099 (3 exons) and a second transcript with an extra exon
const model = {
  genes: {
    GENE: {
      chrom: "1",
      strand: "+",
      transcripts: [
        { id: "T1", canonical: true, exons: [[100, 199], [1000, 1099], [5000, 5099]] },
        { id: "T2", canonical: false, exons: [[100, 199], [3000, 3049], [5000, 5099]] },
      ],
    },
    MINUS: { chrom: "2", strand: "-", transcripts: [{ id: "M1", canonical: true, exons: [[100, 199], [1000, 1099], [5000, 5099]] }] },
  },
};
const cl = (gene, strand, junctions) => ({ id: "c", gene, chromosome: "1", strand, junctions });

describe("geneContext", () => {
  it("numbers exons along the strand and keeps other transcripts", () => {
    const ctx = geneContext(model, cl("GENE", "+", []));
    expect(ctx.nExons).toBe(3);
    expect(ctx.canonical.exons.map((e) => e.n)).toEqual([1, 2, 3]);
    expect(ctx.others).toHaveLength(1);
    expect(ctx.backbone).toHaveLength(4);
    expect([ctx.start, ctx.end]).toEqual([100, 5099]);
    expect(geneContext(model, cl("MINUS", "-", [])).canonical.exons.map((e) => e.n)).toEqual([3, 2, 1]);
  });
  it("is null without a model", () => {
    expect(geneContext(model, cl("NOPE", "+", []))).toBeNull();
    expect(geneContext(null, cl("GENE", "+", []))).toBeNull();
  });
});

describe("compressedLayout", () => {
  const ctx = geneContext(model, cl("GENE", "+", []));
  const lay = compressedLayout(ctx.backbone, 600);
  it("fits the width, keeps order and monotone x", () => {
    expect(lay.blocks[0].x0).toBeGreaterThanOrEqual(0);
    expect(lay.blocks[lay.blocks.length - 1].x1).toBeLessThanOrEqual(600);
    const xs = [100, 150, 199, 500, 1000, 1050, 3020, 5000, 5099].map(lay.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });
  it("interpolates inside an intron between the flanking exons", () => {
    const mid = lay.x(600);
    expect(mid).toBeGreaterThan(lay.blocks[0].x1);
    expect(mid).toBeLessThan(lay.blocks[1].x0);
  });
  it("gives tiny exons a minimum width", () => {
    expect(lay.blocks.every((b) => b.x1 - b.x0 >= 4)).toBe(true);
  });
  it("handles an empty backbone", () => {
    expect(compressedLayout([], 300).blocks).toEqual([]);
  });
});

describe("junction geometry and description", () => {
  const ctx = geneContext(model, cl("GENE", "+", []));
  it("flags an acceptor 44 bp into the intron (donor side canonical)", () => {
    // junction 200..? left end canonical (exon 1 ends 199); right end first exonic base 1000-44 = 956 -> junction end 955
    const g = junctionGeometry(ctx, { start: 200, end: 955 });
    expect(g.left.delta).toBe(0);
    expect(g.right.delta).toBe(-44);
    expect(g.right.where).toBe("intron");
    expect(g.lengthChange).toBe(44);
  });
  it("describes a novel acceptor with exon x of total, frameshift", () => {
    const cluster = cl("GENE", "+", [{ start: 200, end: 999, annotated: true, type: "annotated" }, { start: 200, end: 955, annotated: false, type: "novel_acceptor" }]);
    const ev = clusterEvents(cluster, clusterTranscripts(model, cluster));
    const d = describeEvent(ctx, cluster, ev[0]);
    expect(d.exonLabel).toBe("exon 2 of 3");
    expect(d.site).toMatch(/novel acceptor 44 bp into the intron/);
    expect(d.frame).toMatch(/frameshift/);
  });
  it("describes exon skipping and a cassette exon", () => {
    const cluster = cl("GENE", "+", [{ start: 200, end: 4999, annotated: false, type: "exon_skip" }, { start: 200, end: 999, annotated: true, type: "annotated" }, { start: 1100, end: 4999, annotated: true, type: "annotated" }]);
    const ev = clusterEvents(cluster, clusterTranscripts(model, cluster));
    const cas = ev.find((e) => e.type === "cassette");
    expect(cas.exonNumber).toBe(2);
    const d = describeEvent(ctx, cluster, cas);
    expect(d.exonLabel).toBe("exon 2 of 3");
    expect(d.eventType).toBe("cassette exon");
    const skip = describeEvent(ctx, cluster, null, 0);
    expect(skip.eventType).toBe("exon skipping");
    expect(skip.lengthChange).toBe(-100);
    expect(skip.frame).toMatch(/frameshift/);
  });
  it("works without a gene model", () => {
    const d = describeEvent(null, cl("X", "+", [{ start: 1, end: 5, type: "novel_donor", annotated: false }]), null);
    expect(d.exonLabel).toBeNull();
    expect(d.exonTotal).toBeNull();
    expect(d.eventType).toBe("novel donor");
  });
  it("says domains are not available", () => {
    expect(domainContext(model, "GENE").available).toBe(false);
    expect(domainContext({ genes: { G: { domains: [1] } } }, "G").available).toBe(true);
  });
});

describe("arcs and zoom", () => {
  const ctx = geneContext(model, cl("GENE", "+", []));
  const lay = compressedLayout(ctx.backbone, 600);
  it("arcs run left to right and flag the aberrant junction", () => {
    const arcs = junctionArcs(lay, cl("GENE", "+", [{ start: 200, end: 999, annotated: true, type: "annotated" }, { start: 200, end: 955, annotated: false, type: "novel_acceptor" }]));
    expect(arcs.every((a) => a.xb > a.xa)).toBe(true);
    expect(arcs.map((a) => a.aberrant)).toEqual([false, true]);
  });
  it("zoom keeps the cursor point and clamps", () => {
    const v = zoomView({ k: 1, tx: 0 }, 2, 300, 600);
    expect(v.k).toBe(2);
    expect(v.k * 300 + v.tx).toBeCloseTo(300);
    expect(zoomView({ k: 1, tx: 0 }, 0.5, 0, 600)).toEqual({ k: 1, tx: 0 });
    expect(zoomView({ k: 39, tx: 0 }, 5, 0, 600).k).toBe(40);
  });
  it("unionIntervals merges touching intervals", () => {
    expect(unionIntervals([{ start: 1, end: 5 }, { start: 6, end: 9 }, { start: 20, end: 30 }])).toEqual([{ start: 1, end: 9 }, { start: 20, end: 30 }]);
  });
});

describe("pinned events (EGFRvIII-like skip in a many-junction cluster)", () => {
  // 3-exon gene: junction 1 = skip of exon 2 (200..4999), junction 0 = a novel acceptor listed first, junction 2 = ref
  const cluster = {
    id: "clu",
    gene: "GENE",
    strand: "+",
    chromosome: "1",
    junctions: [
      { start: 200, end: 955, annotated: false, type: "novel_acceptor" },
      { start: 200, end: 4999, annotated: false, type: "exon_skip" },
      { start: 200, end: 999, annotated: true, type: "annotated" },
    ],
  };
  const cohort = { variants: [{ id: "VAR", gene: "GENE", description: "exon 1 to 3", alt_junction: { start: 200, end: 4999 }, ref_junction: { start: 200, end: 999 } }], findings: [] };
  const ctx = geneContext(model, cluster);
  it("pins the variant's junction first, against its reference junction", () => {
    const ev = pinnedEvents(cluster, cohort);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ variant: "VAR", focus: [1], junctions: { incl: [1], skip: [2] } });
  });
  it("describes it as the exon skip, not the first novel acceptor", () => {
    const d = describeEvent(ctx, cluster, pinnedEvents(cluster, cohort)[0]);
    expect(d.junction).toBe(1);
    expect(d.exonLabel).toBe("exon 2 of 3");
    expect(d.eventType).toBe("VAR (\u0394 exons 2)");
    expect(junctionGeometry(ctx, cluster.junctions[1]).skipped).toEqual([2]);
  });
  it("pins a finding's junction and ignores other genes / clusters", () => {
    const ev = pinnedEvents(cluster, { variants: [{ ...cohort.variants[0], gene: "OTHER" }], findings: [{ cluster_id: "clu", junction: { start: 200, end: 955 } }, { cluster_id: "x", junction: { start: 200, end: 4999 } }] });
    expect(ev.map((e) => e.focus[0])).toEqual([0]);
  });
});
