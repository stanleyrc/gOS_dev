import {
  BURDEN_COUNT,
  BURDEN_PERCENT,
  attributedCount,
  barLengths,
  burdenLabel,
  burdenMode,
  burdenRows,
  contrastCounts,
  fmtBurden,
  fmtCount,
  setBurden,
} from "./signatureBurden";

// synthetic fixtures only
const jointFile = {
  sets: [
    { name: "truncal", n: 1000, activities: [{ signature: "SBSA", activity: 450, fraction: 0.5, lo: 0.4, hi: 0.6 }, { signature: "SBSB", activity: 400, fraction: 0.5, lo: 0.4, hi: 0.6 }] },
    { name: "private", activities: [{ signature: "SBSA", activity: 10, fraction: 1 }] },
  ],
};

describe("signatureBurden", () => {
  it("defaults to the count scale", () => {
    expect(burdenMode({})).toBe(BURDEN_COUNT);
    expect(burdenMode(undefined)).toBe(BURDEN_COUNT);
    expect(burdenMode({ sigScale: "percent" })).toBe(BURDEN_PERCENT);
  });

  it("count = fraction x SNVs, null when a total is missing", () => {
    expect(attributedCount(0.25, 400)).toBe(100);
    expect(attributedCount(0.25, null)).toBeNull();
    expect(attributedCount("NA", 10)).toBeNull();
    expect(attributedCount(null, 10)).toBeNull();
  });

  it("uses the exported fraction (not the raw NNLS activity) with the set total", () => {
    const b = setBurden(jointFile, "truncal");
    expect(b.n).toBe(1000);
    expect(b.rows.map((r) => r.count)).toEqual([500, 500]);
    expect(b.rows[0].countLo).toBeCloseTo(400);
    expect(b.rows[0].countHi).toBeCloseTo(600);
  });

  it("shows n/a, never an invented total, when the set has no SNV count", () => {
    const b = setBurden(jointFile, "private");
    expect(b.rows[0].count).toBeNull();
    expect(fmtBurden(b.rows[0].count, b.rows[0].fraction)).toBe("n/a (100%)");
    expect(setBurden(jointFile, "missing")).toBeNull();
  });

  it("derives fractions from legacy activities", () => {
    const rows = burdenRows([{ signature: "X", activity: 30 }, { signature: "Y", activity: 70 }], 100);
    expect(rows[0]).toMatchObject({ signature: "Y", fraction: 0.7, count: 70 });
    expect(rows[1]).toMatchObject({ signature: "X", count: 30 });
  });

  it("formats counts and labels", () => {
    expect(fmtCount(1234.4)).toBe("1,234");
    expect(fmtCount(null)).toBe("n/a");
    expect(burdenLabel(120, 0.31)).toBe("120 · 31%");
    expect(burdenLabel(120, 0.31, BURDEN_PERCENT)).toBe("31% · 120");
  });

  it("scales bar lengths by set size in count mode only", () => {
    expect(barLengths([{ n: 100 }, { n: 50 }, {}], 200)).toEqual([200, 100, 200]);
    expect(barLengths([{ n: 100 }, { n: 50 }], 200, BURDEN_PERCENT)).toEqual([200, 200]);
  });

  it("converts contrast fractions to counts", () => {
    expect(contrastCounts({ frac_a: 0.1, frac_b: 0.3 }, 200, 100)).toEqual({ countA: 20, countB: 30 });
    expect(contrastCounts({ frac_a: 0.1, frac_b: 0.3 }, undefined, 100).countA).toBeNull();
  });
});
