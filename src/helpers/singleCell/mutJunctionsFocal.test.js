import {
  availableFilters,
  carrierRows,
  fmtRr,
  focalBlock,
  focalHeadline,
  focalPrimary,
  focalSeries,
  focalUnavailable,
  forestRows,
  logPos,
  pairPasses,
  pairsInBin,
  pairSnvIds,
  rateTop,
  strataRows,
} from "./mutJunctionsFocal";

// synthetic block, shaped like mut_junctions.json schemaVersion 2 `focal`
const side = (k, L) => ({ k, L, rate: L ? (k / L) * 1e6 : null, ci: [0, L ? ((k + 3) / L) * 1e6 : null] });
const bin = (label, lo, hi, kc, kt) => ({
  label,
  lo,
  hi,
  cis: side(kc, 10000),
  trans: side(kt, 10000),
  background: { rate: 5, exp_cis: 0.05, exp_trans: 0.05 },
  rr_cis_trans: { rr: kt ? kc / kt : null, ci: [0.5, kt ? 4 : null], p: 0.3 },
  rr_cis_bg: { rr: kc / 0.05, ci: [1, 50], p: 0.01 },
  rr_trans_bg: { rr: kt / 0.05, ci: [0, 30], p: 0.5 },
});
const block = {
  status: "ok",
  bins: [
    { label: "0-1 kb", lo: 0, hi: 1000 },
    { label: "1-2 kb", lo: 1000, hi: 2000 },
  ],
  results: {
    all: {
      all: { bins: [bin("0-1 kb", 0, 1000, 3, 1), bin("1-2 kb", 1000, 2000, 0, 2)], primary: bin("0-5 kb", 0, 5000, 3, 3), perm: { shift: { p_two_sided: 0.4 }, flip: { p_two_sided: 0.9 } } },
    },
  },
  strata: { all: { cls: { "DEL-like": { ...bin("x", 0, 5000, 2, 1), n_breakends: 4 } } } },
  carriers: { all: [{ label: "0-1 kb", cis: { n: 2, median: 0.8 }, trans: { n: 1, median: 0.1 }, random_junction: { n: 3, median: 0.2 } }] },
  pairs: [
    { snv: "chr1_100_C_T", dist: 50, side: "cis", apobec: true, qc: true, fit: 0.9, in_territory: true },
    { snv: "chr1_300_A_G", dist: 1500, side: "trans", apobec: false, qc: true, fit: 0.2, in_territory: true },
    { snv: "chr1_900_A_G", dist: 800, side: "trans", apobec: false, qc: false, fit: null, in_territory: false },
    { snv: "chr1_100_C_T", dist: 4000, side: "trans", apobec: true, qc: true, fit: 0.9, in_territory: true },
  ],
};

describe("mutJunctionsFocal", () => {
  test("block and availability", () => {
    expect(focalBlock({ focal: block })).toBe(block);
    expect(focalBlock({ focal: { status: "not available" } })).toBeNull();
    expect(focalUnavailable({ status: "ok" })).toMatch(/predates/);
    expect(focalUnavailable({ status: "ok", focal: { status: "not available", reason: "no territory" } })).toBe("no territory");
    expect(focalUnavailable({ status: "ok", focal: block })).toBeNull();
    expect(availableFilters(block).map((f) => f.value)).toEqual(["all"]);
  });

  test("series and primary", () => {
    const s = focalSeries(block);
    expect(s).toHaveLength(2);
    expect(s[0].cis.k).toBe(3);
    expect(s[0].cis.rate).toBeCloseTo(300);
    expect(s[0].cisTrans.rr).toBe(3);
    expect(s[1].cisTrans.rr).toBe(0);
    const p = focalPrimary(block);
    expect(p.perm.flip.p_two_sided).toBe(0.9);
    expect(focalPrimary(block, "qc")).toBeNull();
    expect(rateTop(s)).toBeCloseTo(405); // max rate 300/Mb x 1.35; CI tops excluded
  });

  test("formatting", () => {
    expect(fmtRr({ rr: 1.5, lo: 0.5, hi: 4 })).toBe("1.50 (0.50-4.00)");
    expect(fmtRr({ rr: null, lo: 0.5, hi: null })).toBe("inf (0.50-inf)");
    expect(fmtRr(null)).toBe("n/a");
    expect(focalHeadline(block)).toMatch(/3 SNVs on the cis side/);
    expect(focalHeadline(block, "qc")).toMatch(/Not available/);
  });

  test("pairs by bin, side, filter and subset", () => {
    expect(pairsInBin(block, { bin: "0-1 kb" }).map((p) => p.snv)).toEqual(["chr1_100_C_T"]);
    expect(pairsInBin(block, { bin: "0-1 kb", countedOnly: false })).toHaveLength(2);
    expect(pairsInBin(block, { bin: "0-5 kb", side: "trans" })).toHaveLength(2);
    expect(pairsInBin(block, { bin: "0-5 kb", filter: "qc_fit" })).toHaveLength(2);
    expect(pairsInBin(block, { bin: "0-5 kb", subset: "other" })).toHaveLength(1);
    expect(pairSnvIds(pairsInBin(block, { bin: "0-5 kb" }))).toEqual(["chr1_100_C_T", "chr1_300_A_G"]);
    expect(pairPasses({ qc: true, fit: 0.4, apobec: true }, "qc_fit")).toBe(false);
  });

  test("forest, strata, carriers, log axis", () => {
    const cohort = { forest: { all: { all: [{ patient: "P1", n_breakends: 4, cis: side(2, 1000), trans: side(1, 1000), rr_cis_trans: { rr: 2, ci: [0.1, 40] } }] } }, results: block.results };
    const f = forestRows(cohort);
    expect(f.map((r) => r.id)).toEqual(["P1", "Pooled (MH)"]);
    expect(f[1].pooled).toBe(true);
    expect(strataRows(block)[0]).toMatchObject({ stratum: "Junction class", group: "DEL-like", nBreakends: 4 });
    expect(carrierRows(block)[0].random.median).toBe(0.2);
    expect(logPos(1, { min: 0.1, max: 10, x0: 0, x1: 100 }).x).toBeCloseTo(50);
    expect(logPos(100, { min: 0.1, max: 10, x0: 0, x1: 100 })).toEqual({ x: 100, clipped: true });
    expect(logPos(0, { x0: 5, x1: 100 })).toEqual({ x: 5, clipped: true });
  });
});
