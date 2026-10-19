import { altFirstSort, buildIgvTracks, sortBrowserAltFirst } from "./igvTracks";

describe("altFirstSort", () => {
  it("sorts ascending by base so the alt (most common mismatch, most negative score) is first", () => {
    expect(altFirstSort("5", 112839000)).toEqual({ chr: "chr5", position: 112839000, option: "BASE", direction: "ASC" });
    expect(altFirstSort("chr5", 10).chr).toBe("chr5");
  });
  it("returns undefined without a usable position", () => {
    expect(altFirstSort("5", NaN)).toBeUndefined();
    expect(altFirstSort(null, 5)).toBeUndefined();
  });
});

describe("buildIgvTracks sort", () => {
  it("gives every DNA track its own sort object (igv.js mutates position)", () => {
    const tr = buildIgvTracks({ dnaCellIds: ["a", "b", "c"], pathFor: (f, n) => `${f}/${n}`, sortAt: { chromosome: "1", position: 100 } });
    expect(tr.map((t) => t.sort.position)).toEqual([100, 100, 100]);
    expect(new Set(tr.map((t) => t.sort)).size).toBe(3);
    expect(tr[0].sort.direction).toBe("ASC");
  });
  it("does not sort RNA tracks", () => {
    const tr = buildIgvTracks({ rnaTracks: [{ rna_id: "r1", bam: "x.bam", patientId: "P" }], pathFor: (f, n) => `${f}/${n}` });
    expect(tr[0].sort).toBeUndefined();
  });
});

describe("sortBrowserAltFirst", () => {
  it("re-sorts DNA tracks only", () => {
    const calls = [];
    const mk = (name) => ({ name, sort: (o) => calls.push([name, o]) });
    const browser = { findTracks: () => [mk("cell1"), mk("RNA · r1"), mk("cell2")] };
    expect(sortBrowserAltFirst(browser, "2", 50)).toBe(2);
    expect(calls.map((c) => c[0])).toEqual(["cell1", "cell2"]);
    expect(calls[0][1]).not.toBe(calls[1][1]);
  });
});

describe("buildIgvTracks labels", () => {
  it("shows the well label as the track name while the id and URLs keep the pair id", () => {
    const pathFor = (f, file) => `/d/${f}/${file}`;
    const [t] = buildIgvTracks({ dnaCellIds: ["XX1_10"], pathFor, labelFor: (id) => (id === "XX1_10" ? "XX1_MR_1_pl1_3a" : id) });
    expect(t.name).toBe("XX1_MR_1_pl1_3a");
    expect(t.id).toBe("XX1_10");
    expect(t.url).toBe("/d/XX1_10/reads.bam");
    expect(buildIgvTracks({ dnaCellIds: ["XX1_10"], pathFor })[0].name).toBe("XX1_10");
  });
});

describe("pooled driver reads", () => {
  const { siteHasCellReads, buildIgvTracks, POOLED_DRIVER_BAM } = require("./igvTracks");
  it("detects sites missing from the SNV matrix (chr naming insensitive)", () => {
    const variants = [{ id: "chr17_7674893_C_T" }];
    expect(siteHasCellReads(variants, "17", 7674893)).toBe(true);
    expect(siteHasCellReads(variants, "chr17", 7675088)).toBe(false);
  });
  it("builds RG-filtered pooled tracks", () => {
    const [t] = buildIgvTracks({ dnaCellIds: ["c1"], pooled: { patientId: "P", file: POOLED_DRIVER_BAM }, pathFor: (f, n) => `/d/${f}/${n}` });
    expect(t.url).toBe("/d/P/slices/drivers.dna.bam");
    expect(t.filter({ tags: () => ({ RG: "c1" }) })).toBe(true);
    expect(t.filter({ tags: () => ({ RG: "c2" }) })).toBe(false);
  });
});
