import { expressionModel, exprColor, exprDrawOrder, quantileSorted, rampColor, ZERO_STYLE } from "./exprColour";

describe("exprColour", () => {
  const vals = [0, 0, 0, 1, 2, 3, NaN];
  it("counts zeros and detection", () => {
    const m = expressionModel(vals);
    expect(m.nTotal).toBe(6);
    expect(m.nZero).toBe(3);
    expect(m.nDetected).toBe(3);
    expect(m.pctDetected).toBeCloseTo(50);
    expect(m.min).toBe(1);
    expect(m.max).toBe(3);
  });
  it("caps at the 99th percentile of non-zero values, robust to an outlier", () => {
    const v = [0, ...Array.from({ length: 99 }, (_, i) => 1 + i / 100), 100];
    const p99 = expressionModel(v);
    expect(p99.cap).toBeLessThan(5);
    expect(p99.capped).toBe(true);
    expect(expressionModel(v, { scale: "max" }).cap).toBe(100);
  });
  it("quantile interpolates", () => {
    expect(quantileSorted([1, 2, 3, 4], 0.5)).toBeCloseTo(2.5);
  });
  it("zero and missing get the zero grey, expressing cells do not", () => {
    const m = expressionModel(vals);
    expect(exprColor(0, m)).toBe(ZERO_STYLE.light.color);
    expect(exprColor(NaN, m, "dark")).toBe(ZERO_STYLE.dark.color);
    expect(exprColor(1, m)).not.toBe(ZERO_STYLE.light.color);
    expect(exprColor(99, m)).toBe(exprColor(m.cap, m));
  });
  it("all-zero gene is entirely grey", () => {
    const m = expressionModel([0, 0]);
    expect(m.cap).toBe(0);
    expect(exprColor(0, m)).toBe(ZERO_STYLE.light.color);
  });
  it("ramp ends differ", () => {
    expect(rampColor(0)).not.toBe(rampColor(1));
  });
  it("draws zeros first then ascending", () => {
    const items = [{ v: 3 }, { v: 0 }, { v: 1 }, { v: NaN }, { v: 2 }];
    expect(exprDrawOrder(items, (x) => x.v).map((x) => x.v)).toEqual([0, NaN, 1, 2, 3]);
  });
});

describe("themeKey", () => {
  it("treats non-light themes as dark", () => {
    const { themeKey } = require("./exprColour");
    expect(themeKey("light")).toBe("light");
    expect(themeKey("cyberpunk")).toBe("dark");
  });
});
