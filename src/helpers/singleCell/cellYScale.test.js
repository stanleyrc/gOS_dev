import { cellCnRange, coverageInView, coverageToCn, effectiveRange, formatYMax, graphMaxInView, parseYMax, quantile } from "./cellYScale";

describe("coverageToCn", () => {
  it("leaves foregroundabs (already CN) untouched, even with a slope and intercept", () => {
    expect(coverageToCn([1, 2, 3], 5, 7, true)).toEqual([1, 2, 3]);
  });
  it("converts raw counts with the cell fit, and refuses without one", () => {
    expect(coverageToCn([10, 20], 0.1, 0.5, false)).toEqual([1.5, 2.5]);
    expect(coverageToCn([10], undefined, 0, false)).toBeNull();
  });
});

describe("quantile", () => {
  it("interpolates and ignores non-finite values", () => {
    expect(quantile([1, 2, 3, 4, NaN], 0.5)).toBe(2.5);
    expect(quantile([], 0.5)).toBeNull();
  });
});

describe("view filters", () => {
  const intervals = [
    { startPlace: 0, endPlace: 100, y: 2 },
    { startPlace: 100, endPlace: 200, y: 40 },
    { startPlace: 300, endPlace: 400, y: 9 },
  ];
  it("takes the graph maximum over intervals overlapping the view", () => {
    expect(graphMaxInView(intervals, [[0, 50]])).toBe(2);
    expect(graphMaxInView(intervals, [[150, 350]])).toBe(40);
    expect(graphMaxInView(intervals, null)).toBe(40);
    expect(graphMaxInView([], null)).toBeNull();
  });
  it("keeps coverage bins inside the view", () => {
    expect(coverageInView([1, 150, 350], [2, 3, 4], [[100, 200]])).toEqual([3]);
  });
});

describe("cellCnRange", () => {
  const flat = Array.from({ length: 1000 }, (_, i) => 2 + (i % 5) * 0.1);
  it("flat cell: 0 to just above the coverage tail", () => {
    const [lo, hi] = cellCnRange({ graphMax: 2, coverage: flat });
    expect(lo).toBe(0);
    expect(hi).toBeGreaterThan(2.4);
    expect(hi).toBeLessThan(3.2);
  });
  it("amplified cell: follows the graph maximum", () => {
    expect(cellCnRange({ graphMax: 100, coverage: flat })[1]).toBeCloseTo(110);
  });
  it("one outlier bin does not set the top", () => {
    const cov = [...flat, 500];
    expect(cellCnRange({ graphMax: 2, coverage: cov })[1]).toBeLessThan(4);
  });
  it("coverage alone, floor for tiny values, and null with no data", () => {
    expect(cellCnRange({ coverage: [0.2, 0.3] })[1]).toBe(2);
    expect(cellCnRange({})).toBeNull();
  });
});

describe("manual override", () => {
  it("wins over auto when positive", () => {
    expect(effectiveRange([0, 4], 12)).toEqual([0, 12]);
    expect(effectiveRange([0, 4], 0)).toEqual([0, 4]);
    expect(effectiveRange([0, 4], undefined)).toEqual([0, 4]);
  });
  it("round-trips through the URL form", () => {
    const s = formatYMax({ "MGH303_a:1": 12.5, b: 3, bad: -1 });
    expect(s).toBe("MGH303_a:1:12.5,b:3");
    expect(parseYMax(s)).toEqual({ "MGH303_a:1": 12.5, b: 3 });
    expect(parseYMax("x:abc,:3")).toEqual({});
  });
});
