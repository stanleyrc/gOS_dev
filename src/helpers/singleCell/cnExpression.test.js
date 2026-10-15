import { binOf, boxStats, cnBins, cnExpressionStats, cnFor, locusCn, normalQuantile, normalUpper, scaleExpression, stouffer } from "./cnExpression";

const row = (segs) => ({
  binIndex: { gStart: Float64Array.from(segs.map((s) => s[0])), gEnd: Float64Array.from(segs.map((s) => s[1])) },
  values: Float32Array.from(segs.map((s) => s[2])),
});

describe("locusCn", () => {
  it("averages segment CN over the locus by overlap width", () => {
    const r = row([[0, 100, 2], [100, 150, 40], [150, 400, 100]]);
    expect(locusCn(r, 120, 170)).toBeCloseTo((30 * 40 + 20 * 100) / 50);
    expect(locusCn(r, 500, 600)).toBeNull();
  });
});

describe("cnBins / binOf", () => {
  it("bins 1-20 ... 181-200, 200+", () => {
    const bins = cnBins();
    expect(bins).toHaveLength(11);
    expect(bins[0].label).toBe("1–20");
    expect(bins[10].label).toBe("200+");
    expect(binOf(bins, 0)).toBe(0);
    expect(binOf(bins, 20)).toBe(0);
    expect(binOf(bins, 20.5)).toBe(1);
    expect(binOf(bins, 250)).toBe(10);
  });
});

describe("normal helpers", () => {
  it("inverts the upper tail", () => {
    expect(normalUpper(1.959964)).toBeCloseTo(0.025, 4);
    expect(normalQuantile(0.975)).toBeCloseTo(1.959964, 4);
    expect(normalQuantile(0.5)).toBeCloseTo(0, 6);
  });
});

describe("stouffer", () => {
  it("combines same-direction tests into a smaller p and n-weights rho", () => {
    const s = stouffer([{ rho: -0.3, p: 0.01, n: 100 }, { rho: -0.2, p: 0.05, n: 100 }]);
    expect(s.z).toBeLessThan(0);
    expect(s.p).toBeLessThan(0.01);
    expect(s.rho).toBeCloseTo(-0.25);
    expect(s.n).toBe(200);
  });
});

describe("cnExpressionStats", () => {
  it("gives per-patient, pooled and combined tests", () => {
    const recs = [];
    ["A", "B"].forEach((p) => {
      for (let i = 0; i < 20; i += 1) recs.push({ patient: p, cn: i, expr: { G: -i + (i % 3) * 0.1 } });
    });
    const s = cnExpressionStats(recs, ["G"], ["A", "B"]);
    expect(s.perPatient.A.G.rho).toBeLessThan(-0.9);
    expect(s.pooled.G.n).toBe(40);
    expect(s.combined.G.p).toBeLessThan(1e-6);
  });
});

describe("scaleExpression / boxStats", () => {
  it("min-max scales and summarises", () => {
    const s = scaleExpression([{ expr: { G: 1 } }, { expr: { G: 3 } }, { expr: { G: 2 } }], ["G"]);
    expect(s.map((r) => r.scaled.G)).toEqual([0, 1, 0.5]);
    const b = boxStats([1, 2, 3, 4, 100]);
    expect(b.median).toBe(3);
    expect(b.whiskerHi).toBe(4);
  });
});

describe("cnExpressionStats with per-gene CN (all-genes source)", () => {
  it("uses cnBy[gene] for that gene and r.cn for the rest", () => {
    const recs = Array.from({ length: 12 }, (_, i) => ({ patient: "P", cn: 12 - i, cnBy: { A: i + 1 }, expr: { A: i, B: i } }));
    expect(cnFor(recs[0], "A")).toBe(1);
    expect(cnFor(recs[0], "B")).toBe(12);
    const st = cnExpressionStats(recs, ["A", "B"], ["P"]);
    expect(st.pooled.A.rho).toBeCloseTo(1);
    expect(st.pooled.B.rho).toBeCloseTo(-1);
  });
  it("skips cells whose own-locus CN is missing", () => {
    const recs = Array.from({ length: 12 }, (_, i) => ({ patient: "P", cn: i, cnBy: { A: i < 2 ? NaN : i }, expr: { A: i } }));
    expect(cnExpressionStats(recs, ["A"], ["P"]).pooled.A.n).toBe(10);
  });
});
