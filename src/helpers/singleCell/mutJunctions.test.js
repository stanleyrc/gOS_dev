import { adjacentRows, cooccurrenceFor, testsFor, binSeries, clusterLocus, cohortRows, cooccurrenceText, fmtDist, fmtOr, headline, kataegisRows, siteCarriers, unavailableReason } from "./mutJunctions";

// synthetic fixtures only
const frac = (k, n) => ({ k, n, frac: n ? k / n : null, ci: [0.1, 0.5] });
const data = {
  status: "ok",
  snv_source: { apobec_signature_in_fit: false, signatures_in_joint_fit: ["SBS5", "SBS1"] },
  tests: {
    near_bp: 100000,
    tcw: { near: frac(3, 10), far: frac(20, 100), fisher: { or: 1.7, ci: [0.4, 6.1], p: 0.3 }, perm: { shift: { p_one_sided: 0.04 } }, chrom_stratified: { or_: 2.5, ci: [1.1, 5.5], p: 0.03 } },
    sbs: {},
  },
  tests_1mb: {
    near_bp: 1000000,
    tcw: { near: frac(9, 40), far: frac(20, 100), fisher: { or: 1.2, ci: [0.5, 2.9], p: 0.6 }, perm: { callable: { p_one_sided: 0.3 } } },
    sbs: {},
  },
  bins: [
    { label: "<=1 kb", n: 2, tcw: frac(1, 2), sbs: frac(0, 2), background: { ...frac(10, 100), n: 100 }, tcw_obs_over_bg: 5, tcw_binom_p: 0.02 },
    { label: ">1 Mb", n: 50, tcw: frac(5, 50), sbs: frac(0, 50), background: frac(8, 80) },
  ],
  adjacent_snvs: [
    { id: "a", tcw: true, sbs: false, dist: 500, f1: 0.2 },
    { id: "b", tcw: true, sbs: false, dist: 90000, f1: 0.9 },
    { id: "c", tcw: false, sbs: true, dist: 10, f1: 0.5 },
    { id: "d", tcw: true, sbs: false, dist: 2e5, f1: 1 },
  ],
  kataegis: { strict: { min_n: 6, max_gap: 1000, n_clusters: 2, null_mean: 0.1, p: 0.01, clusters: [{ chrom: "chr3", start: 100, end: 900, nearest_junction_dist: 5000 }, { chrom: "chr1", start: 5, end: 50, nearest_junction_dist: 20 }] } },
  cooccurrence_1mb: { f1_near_tcw: { n: 9, median: 0.15 }, f1_near_other: { n: 20, median: 0.2 }, f1_far_tcw_random_junction: { n: 9, median: 0.1 } },
  cooccurrence: { f1_near_tcw: { n: 4, median: 0.4 }, f1_near_other: { n: 8, median: 0.3 }, f1_far_tcw_random_junction: { n: 9, median: 0.1 }, mannwhitney_near_tcw_vs_near_other: { p: 0.5 }, "frac_near_tcw_f1_ge_0.5": { k: 1, n: 4 }, "frac_far_tcw_f1_ge_0.5": { k: 0, n: 9 } },
};

describe("mutJunctions helpers", () => {
  it("reports unavailable patients with a reason", () => {
    expect(unavailableReason(null)).toMatch(/not been exported/);
    expect(unavailableReason({ status: "not available", reason: "no junctions" })).toBe("no junctions");
    expect(unavailableReason(data)).toBeNull();
    expect(headline({ status: "not available", reason: "no junctions" })).toBe("Not available (no junctions).");
  });
  it("builds the bin series with the background", () => {
    const s = binSeries(data, "tcw");
    expect(s[0]).toMatchObject({ label: "<=1 kb", k: 1, n: 2, bgFrac: 0.1, obsOverBg: 5 });
    expect(binSeries(data, "sbs")[0].bgFrac).toBeNull();
  });
  it("states plainly when no APOBEC signature is in the fit", () => {
    expect(headline(data, "sbs")).toMatch(/No SBS2 or SBS13/);
    expect(headline(data, "tcw", 1e5)).toMatch(/OR 1.70/);
    expect(headline(data, "tcw", 1e5)).toMatch(/junction-shift permutation p=0.04/);
    expect(headline(data, "tcw", 1e5)).toMatch(/Within 100 kb/);
    expect(headline(data, "tcw", 1e5)).toMatch(/chromosome-stratified OR 2.50 \(1.10-5.50\), p=0.03/);
    expect(headline(data, "tcw", 1e6)).toMatch(/Within 1 Mb of a junction 22.5% of 40/);
    expect(testsFor(data, 1e6).near_bp).toBe(1000000);
    expect(cooccurrenceFor(data, 1e6).f1_near_tcw.median).toBe(0.15);
  });
  it("filters and sorts adjacent SNVs", () => {
    expect(adjacentRows(data, { def: "tcw" }).map((r) => r.id)).toEqual(["a", "b"]);
    expect(adjacentRows(data, { def: "tcw", sort: "f1" }).map((r) => r.id)).toEqual(["b", "a"]);
    expect(adjacentRows(data, { def: "sbs" }).map((r) => r.id)).toEqual(["c"]);
    expect(adjacentRows(data, { def: "tcw", maxDist: 1000 }).map((r) => r.id)).toEqual(["a"]);
  });
  it("finds carriers in a redux SNV matrix", () => {
    const snv = { variants: [{ id: "x" }, { id: "y" }], cells: ["c1", "c2", "c3"], status: [[1, 0], [0, 1], [1, 1]] };
    expect(siteCarriers(snv, "x")).toEqual(["c1", "c3"]);
    expect(siteCarriers(snv, "zz")).toEqual([]);
  });
  it("sorts kataegis clusters by junction distance and makes a locus", () => {
    const k = kataegisRows(data, "strict");
    expect(k.clusters[0].chrom).toBe("chr1");
    expect(k.params).toMatchObject({ minN: 6, n: 2 });
    expect(kataegisRows(data, "relaxed").clusters).toEqual([]);
    expect(clusterLocus({ chrom: "chr3", start: 1000, end: 2000 }, 100)).toEqual({ chromosome: "3", position: 1500, start: 900, end: 2100 });
  });
  it("summarises co-occurrence", () => {
    expect(cooccurrenceText(data, 1e5)).toMatch(/median 0.40 \(n=4\)/);
    expect(cooccurrenceText(data, 1e6)).toMatch(/median 0.15 \(n=9\)/);
    expect(cooccurrenceText({})).toMatch(/Not available/);
  });
  it("formats", () => {
    expect(fmtDist(500)).toBe("500 bp");
    expect(fmtDist(25000)).toBe("25 kb");
    expect(fmtOr({ or: 12.3, ci: [3, 40] })).toBe("12 (3.00-40)");
  });
  it("builds cohort rows with unavailable patients and meta rows", () => {
    const cohort = {
      patients: { P1: { n_sites: 10, n_junctions: 3, near_100000: { n_near: 4, tcw: { near: frac(1, 4), far: frac(2, 6), fisher: { or: 1 }, perm: { uniform: { p_one_sided: 0.2 } } }, sbs: {} }, near_1000000: { n_near: 9, tcw: { near: frac(2, 9), far: frac(2, 6), fisher: { or: 0.5 }, perm: null }, sbs: {} }, kataegis_strict: 0 } },
      notAvailable: { P2: "no junction in >=2 tumour cells" },
      meta: { 100000: { tcw: { n_patients: 1, fixed: { or_: 1.2, ci: [0.8, 1.9], p: 0.3 }, mantel_haenszel: { or_: 1.1, ci: [0.7, 1.8], p: 0.5 } } } },
    };
    const r = cohortRows(cohort, "tcw", 1e5);
    expect(r.patients.map((p) => p.id)).toEqual(["P1", "P2"]);
    expect(r.patients[1]).toMatchObject({ available: false, reason: "no junction in >=2 tumour cells" });
    expect(r.patients[0].perm.p_one_sided).toBe(0.2);
    expect(r.meta.map((m) => m.key)).toEqual(["fixed", "mh"]);
    expect(cohortRows(cohort, "tcw", 1e6).patients[0].nNear).toBe(9);
  });
});
