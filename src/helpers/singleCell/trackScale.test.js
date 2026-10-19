import { quantile, robustMax, windowValues, intervalWindowValues, trackRanges, countAbove, parseYAxis, formatYAxis } from "./trackScale";

const windows = [[0, 100], [200, 300]];
const xs = [10, 20, 30, 210, 220, 230];
const ys = [73, 72, 74, 2, 2, 3];

describe("trackScale", () => {
  test("quantile and robust max ignore a single spike", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    const flat = Array.from({ length: 400 }, () => 2);
    expect(robustMax([...flat, 500], { q: 0.995 })).toBeLessThan(10);
    expect(robustMax([])).toBe(4);
  });
  test("windowValues splits points by window", () => {
    expect(windowValues(xs, ys, windows)).toEqual([[73, 72, 74], [2, 2, 3]]);
  });
  test("CN-73 window + CN-2 window: per-window gives ~4, shared ~85", () => {
    const v = windowValues(xs, ys, windows);
    const win = trackRanges(v, { mode: "window" });
    expect(win.ranges[1]).toEqual([0, 4]);
    expect(win.ranges[0][1]).toBeGreaterThan(80);
    const shared = trackRanges(v, { mode: "shared" });
    expect(shared.ranges[1]).toEqual(shared.ranges[0]);
    expect(shared.ranges[0][1]).toBeGreaterThan(80);
    expect(trackRanges(v, { mode: "track" }).ranges[1][1]).toBe(shared.ranges[1][1]);
  });
  test("custom fixes every window; counts above", () => {
    const v = windowValues(xs, ys, windows);
    expect(trackRanges(v, { mode: "custom", custom: 10 }).ranges).toEqual([[0, 10], [0, 10]]);
    expect(countAbove(ys, 10)).toBe(3);
  });
  test("interval values per window", () => {
    const iv = [{ startPlace: 0, endPlace: 50, y: 6 }, { startPlace: 210, endPlace: 250, y: 2 }, { startPlace: 120, endPlace: 150, y: 9 }];
    expect(intervalWindowValues(iv, windows)).toEqual([[6], [2]]);
  });
  test("url parameter round trip", () => {
    expect(parseYAxis("window")).toEqual({ mode: "window", custom: null });
    expect(parseYAxis("12")).toEqual({ mode: "custom", custom: 12 });
    expect(parseYAxis("zzz")).toBeNull();
    expect(parseYAxis("")).toBeNull();
    expect(formatYAxis({ mode: "custom", custom: 12 })).toBe("12");
    expect(formatYAxis({ mode: "track" })).toBe("track");
  });
});

describe("cellTrackRanges", () => {
  const { cellTrackRanges } = require("./trackScale");
  const intervals = [{ startPlace: 0, endPlace: 100, y: 73 }, { startPlace: 200, endPlace: 300, y: 2 }];
  test("shared / bad custom -> null; window ranges per window, both tracks aligned", () => {
    expect(cellTrackRanges({ intervals, windows, mode: "shared" })).toBeNull();
    expect(cellTrackRanges({ intervals, windows, mode: "custom", custom: 0 })).toBeNull();
    const r = cellTrackRanges({ intervals, covX: [210, 220], covY: [2, 3], hasFit: true, windows, mode: "window" });
    expect(r.total[1]).toEqual([0, 4]);
    expect(r.coverage).toBe(r.total);
    expect(r.total[0][1]).toBeGreaterThan(80);
  });
  test("custom counts bins above", () => {
    const r = cellTrackRanges({ intervals, covX: [10, 210], covY: [73, 2], hasFit: true, windows, mode: "custom", custom: 10 });
    expect(r.total).toEqual([[0, 10], [0, 10]]);
    expect(r.above).toBe(2);
  });
});
