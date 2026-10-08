import { SBS96, cosine, fitSignatures, nnls, parseCosmic, sbs96Counts } from "./signatures";

describe("SBS96 channels", () => {
  it("has 96 channels in COSMIC order", () => {
    expect(SBS96).toHaveLength(96);
    expect(SBS96[0]).toBe("A[C>A]A");
    expect(SBS96[95]).toBe("T[T>G]T");
  });
  it("counts contexts and skips unknown ones", () => {
    const { counts, used } = sbs96Counts(["A[C>A]A", "A[C>A]A", "T[T>G]T", null, "bad"]);
    expect(used).toBe(3);
    expect(counts[0]).toBe(2);
    expect(counts[95]).toBe(1);
  });
});

describe("nnls", () => {
  it("recovers non-negative weights of a known mixture", () => {
    const a = Float64Array.from({ length: 96 }, (_, i) => (i % 3 === 0 ? 1 : 0));
    const b = Float64Array.from({ length: 96 }, (_, i) => (i % 3 === 1 ? 1 : 0));
    const c = Float64Array.from({ length: 96 }, (_, i) => (i % 2 === 0 ? 1 : 0));
    const target = Float64Array.from({ length: 96 }, (_, i) => 3 * a[i] + 2 * b[i]);
    const x = nnls([a, b, c], target);
    expect(x[0]).toBeCloseTo(3, 6);
    expect(x[1]).toBeCloseTo(2, 6);
    expect(x[2]).toBeCloseTo(0, 6);
  });
  it("never returns negative weights", () => {
    const a = Float64Array.from({ length: 96 }, (_, i) => i + 1);
    const b = Float64Array.from({ length: 96 }, (_, i) => 96 - i);
    const target = Float64Array.from({ length: 96 }, (_, i) => i + 1 - 0.5 * (96 - i));
    const x = nnls([a, b], target);
    expect(Math.min(...x)).toBeGreaterThanOrEqual(0);
  });
});

describe("fitSignatures", () => {
  const header = ["Type", "SBSA", "SBSB", "SBSC"].join("\t");
  const rows = SBS96.map((ch, i) => {
    const a = i < 32 ? 1 / 32 : 0;
    const b = i >= 32 && i < 64 ? 1 / 32 : 0;
    const c = 1 / 96;
    return [ch, a, b, c].join("\t");
  });
  const reference = parseCosmic([header, ...rows].join("\n"));
  it("parses the reference", () => {
    expect(reference.names).toEqual(["SBSA", "SBSB", "SBSC"]);
    expect(reference.columns[0][0]).toBeCloseTo(1 / 32);
  });
  it("assigns a pure profile to its signature with a near-perfect cosine", () => {
    const counts = Float64Array.from(reference.columns[1], (v) => v * 200);
    const fit = fitSignatures(counts, reference);
    expect(fit.activities[0].signature).toBe("SBSB");
    expect(fit.activities[0].activity).toBeCloseTo(200, 3);
    expect(fit.cosine).toBeGreaterThan(0.999);
    expect(cosine(fit.reconstruction, counts)).toBeGreaterThan(0.999);
  });
  it("returns nothing for no mutations", () => {
    expect(fitSignatures(new Float64Array(96), reference).activities).toHaveLength(0);
  });
});

describe("decomposed catalogs", () => {
  it("splits each channel's counts across the fitted signatures", () => {
    const { decomposeFit, SBS96: CH } = require("./signatures");
    const a = new Float64Array(96).fill(0);
    const b = new Float64Array(96).fill(0);
    a[0] = 1;
    b[0] = 0.5;
    b[1] = 0.5;
    const reference = { names: ["A", "B"], columns: [a, b] };
    const counts = CH.map((_, i) => (i === 0 ? 30 : i === 1 ? 10 : 0));
    const out = decomposeFit(counts, reference, [{ signature: "A", activity: 20 }, { signature: "B", activity: 20 }]);
    expect(out[0].decomposed[0]).toBeCloseTo(20);
    expect(out[1].decomposed[0]).toBeCloseTo(10);
    expect(out[1].decomposed[1]).toBeCloseTo(10);
    expect(out[0].cosine).toBeCloseTo(1);
  });
});

describe("bootstrapShares", () => {
  it("brackets the point estimate", () => {
    const { bootstrapShares, SBS96: CH } = require("./signatures");
    const a = new Float64Array(96).fill(0);
    const b = new Float64Array(96).fill(0);
    a[0] = 1;
    b[1] = 1;
    const reference = { names: ["A", "B"], columns: [a, b] };
    const contexts = [...Array(70).fill(CH[0]), ...Array(30).fill(CH[1])];
    const ci = bootstrapShares(contexts, reference, ["A", "B"], 50);
    expect(ci.A.lo).toBeLessThanOrEqual(0.7);
    expect(ci.A.hi).toBeGreaterThanOrEqual(0.7);
    expect(ci.B.hi).toBeLessThan(0.5);
  });
});
