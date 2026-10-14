import {
  regionClass,
  inGeneBody,
  siteAnnotations,
  catLegend,
  binSummary,
  binDetail,
  siteDetail,
  matchesAnnotFilter,
  toggleValue,
  toggleMin,
  hasAnnotFilter,
  serializeTracks,
  parseTracks,
  describeFilter,
  rampColor,
} from "./snvAnnot";

const snv = {
  variants: [
    { id: "chr1_1_A_C", consequence: "intron_variant", category: "truncal", driver: false, cellphyInput: true, cladeScore: 0.9, context: "A[C>A]A" },
    { id: "chr1_2_A_C", consequence: "intergenic_region", category: "private", driver: false, cellphyInput: false, cladeScore: 0.4 },
    { id: "chr1_3_A_C", consequence: "missense_variant", gene: "EGFR", protein: "p.L858R", category: "subclonal", driver: true, cellphyInput: true, cladeScore: null },
    { id: "chr1_4_A_C", consequence: "3_prime_UTR_variant", category: "private", driver: false, cellphyInput: true, cladeScore: 0.7 },
  ],
  // 3 cells x 4 sites
  status: [Int8Array.from([1, 0, 1, -1]), Int8Array.from([0, 0, 1, -1]), Int8Array.from([-1, 1, -1, -1])],
  depth: [Float32Array.from([4, 2, 6, NaN]), Float32Array.from([2, 2, 10, NaN]), Float32Array.from([NaN, 8, NaN, NaN])],
};
const sigs = { signature: ["SBS5", null, "SBS1", "SBS5"], prob: Float32Array.from([0.6, 0, 0.9, 0.5]) };

describe("regionClass", () => {
  it("classifies consequences", () => {
    expect(regionClass("missense_variant")).toBe("coding");
    expect(regionClass("missense_variant&splice_region_variant")).toBe("coding");
    expect(regionClass("splice_region_variant&intron_variant")).toBe("intron");
    expect(regionClass("splice_region_variant&non_coding_transcript_exon_variant")).toBe("ncrna");
    expect(regionClass("5_prime_UTR_premature_start_codon_gain_variant")).toBe("utr");
    expect(regionClass("upstream_gene_variant")).toBe("flank");
    expect(regionClass("intergenic_region")).toBe("intergenic");
    expect(regionClass("")).toBeNull();
    expect(inGeneBody("intron")).toBe(true);
    expect(inGeneBody("intergenic")).toBe(false);
  });
});

describe("siteAnnotations", () => {
  const annot = siteAnnotations(snv, { signatures: sigs });
  it("computes mean depth and alt fraction over called cells", () => {
    expect(annot.num.depth[0]).toBeCloseTo(3);
    expect(annot.num.depth[1]).toBeCloseTo(4);
    expect(Number.isNaN(annot.num.depth[3])).toBe(true);
    expect(annot.num.vaf[0]).toBeCloseTo(0.5);
    expect(annot.num.vaf[2]).toBeCloseTo(2 / 2);
    expect(Number.isNaN(annot.num.vaf[3])).toBe(true);
  });
  it("uses exported clade scores unless a tree score map is given", () => {
    expect(annot.num.phylo[0]).toBeCloseTo(0.9);
    expect(Number.isNaN(annot.num.phylo[2])).toBe(true);
    const own = siteAnnotations(snv, { phylo: new Map([[2, 0.55]]) });
    expect(own.num.phylo[2]).toBeCloseTo(0.55);
    expect(Number.isNaN(own.num.phylo[0])).toBe(true);
  });
  it("lists available tracks and hides absent ones", () => {
    expect(annot.available).toEqual(expect.arrayContaining(["category", "driver", "signature", "region", "depth", "vaf", "phylo", "cellphy"]));
    expect(annot.available).not.toContain("qc");
    expect(siteAnnotations(snv).available).not.toContain("signature");
    const withQc = siteAnnotations({ ...snv, variants: snv.variants.map((v, i) => ({ ...v, sumLogodds: i })) });
    expect(withQc.available).toContain("qc");
  });
  it("builds legends with counts, signatures by prevalence", () => {
    const sig = catLegend(annot, "signature");
    expect(sig.map((e) => [e.value, e.count])).toEqual([["SBS5", 2], ["SBS1", 1]]);
    expect(catLegend(annot, "region").map((e) => e.value)).toEqual(["coding", "utr", "intron", "intergenic"]);
  });
  it("describes one site with every annotation", () => {
    const rows = Object.fromEntries(siteDetail(annot, 2));
    expect(rows.Gene).toBe("EGFR p.L858R");
    expect(rows.Signature).toContain("SBS1");
    expect(rows.Region).toContain("gene body");
    expect(rows["Mean depth"]).toBe("8.0");
    expect(rows.OncoKB).toBe("driver");
    expect(Object.fromEntries(siteDetail(annot, 1)).Region).toContain("outside genes");
  });
});

describe("bins", () => {
  const annot = siteAnnotations(snv, { signatures: sigs });
  const order = [0, 1, 2, 3];
  it("summarises categories and flags driver / numeric means", () => {
    expect(binSummary(annot, "region", order, 0, 2).counts).toEqual({ intron: 1, intergenic: 1 });
    expect(binSummary(annot, "driver", order, 0, 4).top).toBe("driver");
    expect(binSummary(annot, "driver", order, 0, 2).top).toBe("other");
    expect(binSummary(annot, "depth", order, 0, 2).mean).toBeCloseTo(3.5);
    expect(binSummary(annot, "depth", order, 3, 4).valued).toBe(0);
  });
  it("detail rows for bins", () => {
    const rows = Object.fromEntries(binDetail(annot, order, 0, 3, ["region", "depth"]));
    expect(rows.Sites).toBe("3");
    expect(rows.Region).toContain("intron");
    expect(rows["Mean depth"]).toContain("mean");
  });
});

describe("annotation filter", () => {
  const annot = siteAnnotations(snv, { signatures: sigs });
  it("filters on classes and numeric bounds", () => {
    let f = toggleValue(null, "region", "intergenic");
    expect([0, 1, 2, 3].filter((c) => matchesAnnotFilter(annot, f, c))).toEqual([1]);
    f = toggleValue(f, "region", "intron");
    expect([0, 1, 2, 3].filter((c) => matchesAnnotFilter(annot, f, c))).toEqual([0, 1]);
    f = toggleValue(f, "region", "intron");
    f = toggleValue(f, "region", "intergenic");
    expect(f).toBeNull();
    const g = toggleMin(null, "depth", 4);
    expect([0, 1, 2, 3].filter((c) => matchesAnnotFilter(annot, g, c))).toEqual([1, 2]);
    expect(toggleMin(g, "depth", 4)).toBeNull();
    expect(hasAnnotFilter(g)).toBe(true);
    expect(hasAnnotFilter(null)).toBe(false);
    expect(matchesAnnotFilter(annot, toggleValue(null, "signature", "SBS5"), 0)).toBe(true);
    expect(matchesAnnotFilter(annot, toggleValue(null, "signature", "SBS5"), 1)).toBe(false);
  });
  it("describes filters", () => {
    expect(describeFilter(annot, "region", { values: ["intron"] })).toBe("Region: intron (gene body)");
    expect(describeFilter(annot, "depth", { min: 4 })).toContain(">= 4.00");
  });
});

describe("url round trip", () => {
  it("serialises and parses tracks and filters", () => {
    const filter = { region: { values: ["intron", "flank"] }, depth: { min: 12.5 } };
    const params = serializeTracks(["signature", "region"], filter);
    expect(params.sntracks).toBe("signature,region");
    const back = parseTracks(`?${new URLSearchParams(params).toString()}`);
    expect(back.tracks).toEqual(["signature", "region"]);
    expect(back.filter).toEqual(filter);
    expect(serializeTracks(["category", "driver"], null)).toEqual({});
    expect(parseTracks("?sntracks=bogus&snfilter=bogus:x")).toEqual({ tracks: null, filter: null });
  });
  it("ramp stays a css colour", () => {
    expect(rampColor(0)).toMatch(/^rgb\(/);
    expect(rampColor(NaN)).toMatch(/^rgb\(/);
  });
});
