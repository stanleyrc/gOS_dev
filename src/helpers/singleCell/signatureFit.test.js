import fs from "fs";
import path from "path";
import { SBS96, parseCosmic } from "./signatures";
import { evaluateBackendSet, evaluateFit, fitClass, fitStats, reconstructionOf, residuals, toSbs96 } from "./signatureFit";
import bwh70 from "./__fixtures__/signatures.BWH70.json";

const cosmic = parseCosmic(fs.readFileSync(path.join(__dirname, "../../../public/COSMIC_v3.4_SBS_GRCh38.txt"), "utf8"));

describe("fitClass", () => {
  it("uses the bulk tab's cosine thresholds", () => {
    expect(fitClass(0.97)).toBe("success");
    expect(fitClass(0.95)).toBe("success");
    expect(fitClass(0.9)).toBe("warning");
    expect(fitClass(0.84)).toBe("error");
    expect(fitClass(null)).toBe("default");
  });
});

describe("toSbs96", () => {
  it("reorders values from the exporter's channel order", () => {
    // R writes 5' base fastest (A[C>A]A, C[C>A]A, ...); SBS96 has 3' fastest
    const out = toSbs96(bwh70.sets[0].counts, bwh70.channels);
    bwh70.channels.forEach((ch, i) => expect(out[SBS96.indexOf(ch)]).toBe(bwh70.sets[0].counts[i]));
    expect(out.reduce((s, v) => s + v, 0)).toBe(bwh70.sets[0].n);
  });
  it("keeps SBS96 order without channels", () => {
    expect(Array.from(toSbs96([1, 2, 3]).slice(0, 4))).toEqual([1, 2, 3, 0]);
  });
});

describe("fitStats", () => {
  it("reproduces SigProfilerAssignment's statistics from the exported catalogs", () => {
    bwh70.sets.forEach((set) => {
      const s = fitStats(toSbs96(set.counts, bwh70.channels), toSbs96(set.reconstruction, bwh70.channels));
      expect(s.total).toBe(set.n);
      expect(s.cosine).toBeCloseTo(set.stats.cosine, 2);
      expect(s.l1Pct).toBeCloseTo(set.stats.l1_pct, 0);
      expect(s.l2Pct).toBeCloseTo(set.stats.l2_pct, 0);
      expect(s.kl).toBeCloseTo(set.stats.kl, 2);
      expect(s.correlation).toBeCloseTo(set.stats.correlation, 2);
    });
  });
  it("is a perfect fit when observed equals fitted", () => {
    const v = Float64Array.from({ length: 96 }, (_, i) => (i % 5) + 1);
    const s = fitStats(v, v);
    expect(s.cosine).toBeCloseTo(1, 10);
    expect(s.l1).toBe(0);
    expect(s.kl).toBeCloseTo(0, 10);
    expect(s.correlation).toBeCloseTo(1, 10);
  });
});

describe("reconstructionOf", () => {
  it("matches the exporter's reconstruction from the same COSMIC v3.4 GRCh38 signatures", () => {
    const set = bwh70.sets[0];
    const mine = reconstructionOf(cosmic, set.activities);
    const theirs = toSbs96(set.reconstruction, bwh70.channels);
    for (let i = 0; i < 96; i += 1) expect(Math.abs(mine[i] - theirs[i])).toBeLessThan(0.05);
  });
  it("skips signatures missing from the reference", () => {
    expect(reconstructionOf(cosmic, [{ signature: "SBSnope", activity: 10 }]).every((v) => v === 0)).toBe(true);
  });
});

describe("residuals", () => {
  it("sorts channels by absolute residual", () => {
    const obs = new Float64Array(96);
    const fit = new Float64Array(96);
    obs[3] = 10;
    fit[7] = 4;
    const r = residuals(obs, fit);
    expect(r[0]).toMatchObject({ channel: SBS96[3], residual: 10 });
    expect(r[1]).toMatchObject({ channel: SBS96[7], residual: -4 });
  });
});

describe("evaluateBackendSet", () => {
  it("uses the exported catalog, reconstruction and SigProfiler stats", () => {
    const e = evaluateBackendSet(bwh70.sets[1], { channels: bwh70.channels, reference: cosmic });
    expect(e.countsSource).toBe("export");
    expect(e.statsSource).toBe("sigprofiler");
    expect(e.stats.cosine).toBe(bwh70.sets[1].stats.cosine);
    expect(e.total).toBe(bwh70.sets[1].n);
    expect(e.decomposition.map((d) => d.signature)).toEqual(bwh70.sets[1].activities.map((a) => a.signature));
    // decomposed catalogs partition the observed catalog
    const parts = new Float64Array(96);
    e.decomposition.forEach((d) => d.decomposed.forEach((v, i) => (parts[i] += v)));
    const covered = SBS96.map((_, i) => i).filter((i) => e.reconstruction[i] > 0);
    expect(covered.length).toBeGreaterThan(80);
    expect(Math.max(...covered.map((i) => Math.abs(parts[i] - e.counts[i])))).toBeLessThan(1e-6);
    expect(e.decomposition.reduce((s, d) => s + d.share, 0)).toBeCloseTo(1, 6);
    e.decomposition.forEach((d) => expect(d.cosine).toBeGreaterThan(0));
  });
  it("falls back to the browser profile and COSMIC for older signatures.json", () => {
    const set = bwh70.sets[0];
    const old = { name: set.name, n: set.n, activities: set.activities };
    const profileCounts = toSbs96(set.counts, bwh70.channels);
    const e = evaluateBackendSet(old, { profileCounts, reference: cosmic });
    expect(e.countsSource).toBe("browser");
    expect(e.statsSource).toBe("browser");
    expect(e.nMismatch).toBe(false);
    expect(e.stats.cosine).toBeCloseTo(set.stats.cosine, 2);
    expect(evaluateBackendSet({ ...old, n: set.n + 5 }, { profileCounts, reference: cosmic }).nMismatch).toBe(true);
  });
  it("returns null without activities or a catalog", () => {
    expect(evaluateBackendSet({ name: "x", n: 0, activities: [] }, { reference: cosmic })).toBeNull();
    expect(evaluateBackendSet({ name: "x", n: 5, activities: [{ signature: "SBS1", activity: 5 }] }, { reference: cosmic })).toBeNull();
  });
});

describe("evaluateFit", () => {
  it("rebuilds the reconstruction from the reference when none is given", () => {
    const sbs1 = cosmic.columns[cosmic.names.indexOf("SBS1")];
    const counts = Float64Array.from(sbs1, (p) => p * 100);
    const e = evaluateFit({ counts, activities: [{ signature: "SBS1", activity: 100 }], reference: cosmic });
    expect(e.stats.cosine).toBeCloseTo(1, 6);
    expect(e.decomposition[0].cosine).toBeCloseTo(1, 6);
  });
});
