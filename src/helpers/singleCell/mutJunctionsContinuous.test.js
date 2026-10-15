import {
  backgroundRate,
  binnedSeries,
  candidateRows,
  continuousData,
  cosmicReference,
  interMutationDistances,
  poissonCi,
  profileSums,
  rateRatio,
  refitNear,
  selectPairs,
  signatureEnrichment,
  smoothRate,
  spectra,
  symlog,
  tileCounts,
  windowSummary,
} from "./mutJunctionsContinuous";
import { SBS96 } from "./signatures";

// synthetic: 10 tiles of 100 bp per side, 1000 callable bases per tile, CN 4 on cis and 2 on trans
const n = 10;
const profile = {
  step: 100,
  max: 1000,
  cis_L: new Array(n).fill(100),
  trans_L: new Array(n).fill(100),
  cis_Lcn: new Array(n).fill(200),
  trans_Lcn: new Array(n).fill(100),
  cis_L_by_cn: { 4: new Array(n).fill(100) },
  trans_L_by_cn: { 2: new Array(n).fill(100) },
};
const classes = { 2: { k: 20, L: 1e6, Lcn: 1e6, rate: 20 }, 4: { k: 40, L: 1e6, Lcn: 2e6, rate: 40 } };
const bg = { all: { k: 60, L: 2e6, Lcn: 3e6, spectrum: { "A[C>T]G": 30, "T[C>A]T": 30 }, sig_post: { SBS1: 30, SBS5: 30 }, classes: { all: classes, apobec: classes, other: classes } } };
const pair = (snv, side, dist, extra = {}) => ({ snv, chrom: "chr1", pos: 1000 + (side === "cis" ? -dist : dist), side, dist, in_territory: true, qc: true, fit: 0.9, apobec: false, context: "A[C>T]G", sig: "SBS1", sig_post: { SBS1: 1 }, ...extra });
const block = {
  status: "ok",
  results: {},
  profile,
  background_detail: bg,
  pairs: [pair("a", "cis", 50), pair("b", "cis", 150), pair("c", "cis", 450), pair("d", "trans", 250, { sig: "SBS5", sig_post: { SBS5: 1 }, context: "T[C>A]T" }), pair("e", "cis", 700, { in_territory: false })],
  cosmic: { channels: SBS96, profiles: { SBS1: SBS96.map((c) => (c === "A[C>T]G" ? 1 : 0)), SBS5: SBS96.map(() => 1 / 96) } },
};

describe("mutJunctionsContinuous", () => {
  const cd = continuousData(block, "P1");

  test("data and pair selection", () => {
    expect(Object.keys(cd.patients)).toEqual(["P1"]);
    expect(cd.pairs[0].patient).toBe("P1");
    expect(selectPairs(cd.pairs)).toHaveLength(4);
    expect(selectPairs(cd.pairs, { excludeNear: true })).toEqual([]); // every counted pair is < 500 bp
    expect(selectPairs(cd.pairs, { excludePatients: ["P1"] })).toHaveLength(0);
    expect(continuousData({ status: "ok", results: {}, profile: { cis_L: [] } })).toBeNull();
  });

  test("profile sums, CN-matched expectation and windows", () => {
    const prof = profileSums(cd, { patients: ["P1"] });
    expect(prof.cis.E[0]).toBeCloseTo(100 * 40e-6);
    expect(prof.trans.E[0]).toBeCloseTo(100 * 20e-6);
    expect(prof.cis.Ecn[0]).toBeCloseTo(200 * 20e-6); // per-copy 60 / 3e6
    expect(profileSums(cd, { patients: ["P1"], excludeNear: true }).cis.L.slice(0, 6)).toEqual([0, 0, 0, 0, 0, 100]);
    const counts = tileCounts(selectPairs(cd.pairs), 100, n);
    expect(counts.cis.slice(0, 5)).toEqual([1, 1, 0, 0, 1]);
    const w = windowSummary(prof, counts, 500);
    expect(w.cis.k).toBe(3);
    expect(w.rr.rr).toBeCloseTo(3);
    expect(w.rrCn.rr).toBeCloseTo(1.5); // cis has twice the copies
    const bins = binnedSeries(prof, counts, { size: 500, maxD: 1000 });
    expect(bins).toHaveLength(2);
    expect(bins[0].cis.rate).toBeCloseTo(6); // 3 SNVs / 500 bases = 6 per kb
    expect(bins[0].cis.cn.rate).toBeCloseTo(3);
    const sm = smoothRate(prof, counts, { bandwidth: 100, maxD: 1000 });
    expect(sm.x).toHaveLength(10);
    expect(sm.cis[0]).toBeGreaterThan(sm.cis[9] ?? 0);
    expect(backgroundRate(cd, { patients: ["P1"] }).raw.rate).toBeCloseTo(0.03);
  });

  test("statistics helpers", () => {
    const [lo, hi] = poissonCi(10);
    expect(lo).toBeCloseTo(4.8, 0);
    expect(hi).toBeCloseTo(18.4, 0);
    expect(rateRatio(0, 10, 0, 10).rr).toBeNull();
    expect(rateRatio(4, 10, 2, 10).rr).toBeCloseTo(2);
    expect(symlog(-900)).toBeCloseTo(-1);
  });

  test("signature split, spectra, refit and inter-mutation distance", () => {
    const sel = selectPairs(cd.pairs);
    const sp = spectra(cd, sel, { patients: ["P1"] });
    expect(sp.cis.n).toBe(3);
    expect(sp.background.n).toBe(60);
    const en = signatureEnrichment(cd, sel.filter((p) => p.side === "cis"), { patients: ["P1"] });
    const s1 = en.find((e) => e.signature === "SBS1");
    expect(s1.observed).toBe(3);
    expect(s1.expected).toBeCloseTo(1.5);
    expect(s1.ratio).toBeCloseTo(2);
    expect(candidateRows(en).find((c) => c.signature === "SBS18").inFit).toBe(false);
    const ref = cosmicReference(block.cosmic);
    expect(ref.names).toEqual(["SBS1", "SBS5"]);
    expect(refitNear(ref, sel).status).toBe("na");
    const big = Array.from({ length: 25 }, (_, i) => pair(`s${i}`, "cis", 10 * i));
    const fit = refitNear(ref, big.map((p) => ({ ...p, patient: "P1" })));
    expect(fit.status).toBe("ok");
    expect(fit.activities[0].signature).toBe("SBS1");
    const imd = interMutationDistances(sel);
    expect(imd.n).toBe(4);
    expect(imd.rows[0].imd).toBe(100);
    expect(imd.under1kb).toBe(4);
  });
});
