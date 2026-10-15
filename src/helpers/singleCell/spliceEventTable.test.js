import {
  bestLink,
  cloneText,
  eventCounts,
  filterSpliceEvents,
  linkCarrierDnaCells,
  linkText,
  normalizeSpliceEvents,
  psiText,
  recurrenceText,
  snvLinkIgvView,
  sortSpliceEvents,
  spliceReadsView,
  usageText,
} from "./spliceEventTable";

const raw = (over = {}) => ({
  id: "ev:clu_17_7673838_7674180_-:7673841-7674180",
  cluster_id: "clu_17_7673838_7674180_-",
  gene: "TP53",
  chromosome: "17",
  strand: "-",
  start: 7673841,
  end: 7674180,
  type: "novel_acceptor",
  event_type: "alt_3",
  annotated: false,
  summary: "Novel acceptor 3 bp into intron 7 of TP53; used by 64% of reads in 68 of 112 cells; in frame",
  reads: 1561,
  cluster_reads: 2448,
  psi: 0.638,
  psi_lo: 0.58,
  psi_hi: 0.7,
  cells_using: 68,
  cells_covering: 112,
  clone: { clone: "2", n_cells: 60, psi: 0.71, psi_rest: 0.08, p: 1e-4, q: 0.003 },
  frame: "in_frame",
  cancer_gene: true,
  n_patients: 1,
  other_patients: [],
  flags: [],
  recommended: true,
  reasons: ["novel in cancer gene"],
  finding_score: 8.6,
  cells: ["r1", "r2"],
  snv_links: [
    { variant_id: "chr17_7673839_G_A", variant_index: 5, chromosome: "17", position: 7673839, ref: "G", alt: "A", site: "acceptor", offset: 2, distance: 2, region: "canonical", canonical: true,
      n_carriers: 6, n_noncarriers: 20, psi_carriers: 0.8, psi_noncarriers: 0.1, delta_psi: 0.7, p: 0.003, q: 0.02, carriers: ["r1", "r9"] },
    { variant_id: "chr17_7673900_C_T", variant_index: 9, chromosome: "17", position: 7673900, ref: "C", alt: "T", site: "acceptor", offset: 60, distance: 60, region: "near", n_carriers: 3, n_noncarriers: 20, p: 0.5, q: 0.9, carriers: [] },
  ],
  ...over,
});

describe("spliceEventTable", () => {
  test("normalises events and drops incomplete rows", () => {
    const ev = normalizeSpliceEvents([raw(), { id: "x" }, null]);
    expect(ev).toHaveLength(1);
    expect(ev[0].clusterId).toBe("clu_17_7673838_7674180_-");
    expect(ev[0].snvLinks[0].canonical).toBe(true);
    expect(normalizeSpliceEvents(undefined)).toEqual([]);
  });

  test("plain-language units", () => {
    const [e] = normalizeSpliceEvents([raw()]);
    expect(usageText(e)).toBe("68 of 112 cells (61%)");
    expect(psiText(e)).toBe("64% (58–70%)");
    expect(cloneText(e)).toBe("clone 2: 71% vs 8% elsewhere (q 0.0030)");
    expect(recurrenceText(e)).toBe("this patient only");
    expect(recurrenceText({ nPatients: 3, otherPatients: ["A", "B"] })).toBe("3 patients (+ A, B)");
  });

  test("Recommended vs All, search, type and linked filters", () => {
    const ev = normalizeSpliceEvents([raw(), raw({ id: "ev:b", cluster_id: "b", gene: "ABC", recommended: false, event_type: "exon_skip", snv_links: [] })]);
    expect(filterSpliceEvents(ev)).toHaveLength(1);
    expect(filterSpliceEvents(ev, { mode: "all" })).toHaveLength(2);
    expect(filterSpliceEvents(ev, { mode: "all", query: "abc" })).toHaveLength(1);
    expect(filterSpliceEvents(ev, { mode: "all", eventType: "exon_skip" })[0].gene).toBe("ABC");
    expect(filterSpliceEvents(ev, { mode: "all", linkedOnly: true })).toHaveLength(1);
    expect(eventCounts(ev)).toEqual({ all: 2, recommended: 1, linked: 1 });
  });

  test("intron retention events are kept without a sashimi cluster", () => {
    const ev = normalizeSpliceEvents([raw({ id: "ev:ir:1", cluster_id: null, event_type: "intron_retention", type: "intron_retention" }), raw({ id: "ev:x", cluster_id: null })]);
    expect(ev).toHaveLength(1);
    expect(ev[0].eventType).toBe("intron_retention");
    expect(ev[0].clusterId).toBeNull();
  });

  test("sorts findings first, then clone-enriched, then reads", () => {
    const ev = normalizeSpliceEvents([
      raw({ id: "ev:a", finding_score: 0, clone: null, reads: 50 }),
      raw({ id: "ev:b", finding_score: 0, clone: null, reads: 500 }),
      raw({ id: "ev:c", finding_score: 7 }),
    ]);
    expect(sortSpliceEvents(ev).map((e) => e.id)).toEqual(["ev:c", "ev:b", "ev:a"]);
  });

  test("best link prefers the lowest q and builds an IGV view for carriers", () => {
    const [e] = normalizeSpliceEvents([raw()]);
    const l = bestLink(e);
    expect(l.variantId).toBe("chr17_7673839_G_A");
    expect(linkText(l)).toMatch(/2 bp into the intron at the acceptor \(canonical splice site/);
    expect(linkText(l)).toMatch(/PSI 80% vs 10% \(p 0.0030, q 0.020\)/);
    const view = snvLinkIgvView(e, l, { cellMap: { r1: "dna1", r9: null }, spliceReads: { r1: "rna/splice_reads/r1.bam" }, patientId: "MGH303" });
    expect(view.rnaTracks).toHaveLength(1);
    expect(view.cellIds).toEqual(["dna1"]);
    expect(view.position).toBe(7673839);
    expect(snvLinkIgvView(e, e.snvLinks[1], {})).toBeNull();
    expect(linkCarrierDnaCells(l, { r1: "dna1", r9: "dna9" })).toEqual(["dna1", "dna9"]);
  });

  describe("spliceReadsView", () => {
    const rc = (id, role, k, n) => ({ id, role, k, n });
    const ev = (readCells) => normalizeSpliceEvents([raw({ loci: [{ chromosome: "17", position: 7673840 }, { chromosome: "17", position: 7674181 }], read_cells: readCells })])[0];
    const slices = { u1: "rna/splice_reads/u1.bam", u2: "rna/splice_reads/u2.bam", u3: "rna/splice_reads/u3.bam", c1: "rna/splice_reads/c1.bam", c2: "rna/splice_reads/c2.bam" };

    it("is unavailable without read cells or slices", () => {
      expect(spliceReadsView(ev([]), { spliceReads: slices })).toMatchObject({ available: false, reason: "no-slice" });
      expect(spliceReadsView(ev([rc("zz", "using", 5, 9)]), { spliceReads: slices })).toMatchObject({ available: false, reason: "no-slice" });
      expect(spliceReadsView(normalizeSpliceEvents([raw()])[0], { spliceReads: slices })).toMatchObject({ available: false });
    });

    it("shows the most supporting cells first, then the control, capped", () => {
      const e = ev([rc("u2", "using", 30, 40), rc("u1", "using", 90, 100), rc("u3", "using", 5, 50), rc("c2", "control", 0, 20), rc("c1", "control", 0, 80)]);
      const r = spliceReadsView(e, { spliceReads: slices, patientId: "P1", nUsing: 2, nControl: 1 });
      expect(r.available).toBe(true);
      expect(r.shown.map((x) => x.id)).toEqual(["u1", "u2", "c1"]);
      expect(r).toMatchObject({ totalUsing: 3, totalControl: 2, nUsing: 2, nControl: 1 });
      expect(r.view.rnaTracks.map((t) => t.rna_id)).toEqual(["u1", "u2", "c1"]);
      expect(r.view.rnaTracks[0]).toMatchObject({ bam: "rna/splice_reads/u1.bam", patientId: "P1" });
      expect(r.view.rnaTracks[2].label).toMatch(/^comparator: c1 \(event 0 \/ canonical 80/);
      expect(r.view.loci).toHaveLength(2);
    });

    it("drops cells without a slice and tolerates controls only", () => {
      const e = ev([rc("nope", "using", 50, 60), rc("c1", "control", 0, 10)]);
      const r = spliceReadsView(e, { spliceReads: slices });
      expect(r.shown.map((x) => x.id)).toEqual(["c1"]);
      expect(r.totalUsing).toBe(0);
    });
  });
});
