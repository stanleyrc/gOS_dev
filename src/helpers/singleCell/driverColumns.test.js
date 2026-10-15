import { discreteColumnLookup } from "./matrix";
import {
  clampColPx,
  columnEdge,
  columnSpan,
  driverLayoutFromSearch,
  driverLayoutToSearch,
  driverView,
  panRange,
  zoomRange,
} from "./driverColumns";

describe("driver column geometry", () => {
  test.each([
    [40, 990, 1],
    [40, 990, 2],
    [7, 333, 1.5],
    [237, 1000, 2],
    [3, 100, 1],
    [5, 1400, 2],
  ])("edges match the canvas lookup (n=%i, width=%i, pr=%f)", (n, width, pr) => {
    const dev = Math.floor(width * pr);
    const cols = discreteColumnLookup(n, dev);
    for (let x = 0; x < dev; x += 1) {
      const c = cols[x];
      expect(columnEdge(c, n, dev)).toBeLessThanOrEqual(x);
      expect(columnEdge(c + 1, n, dev)).toBeGreaterThan(x);
    }
    expect(columnEdge(n, n, dev)).toBe(dev);
  });

  test("labels are centred on their column at any ratio, within half a device pixel", () => {
    [1, 2].forEach((pr) => {
      const n = 40;
      const width = 977;
      const cols = discreteColumnLookup(n, Math.floor(width * pr));
      for (let c = 0; c < n; c += 1) {
        const xs = [];
        cols.forEach((v, x) => v === c && xs.push(x));
        const middle = (xs[0] + xs[xs.length - 1] + 1) / 2 / pr;
        expect(Math.abs(columnSpan(c, n, width, pr).centre - middle)).toBeLessThanOrEqual(0.5 / pr + 1e-9);
      }
    });
  });

  test("column spans tile the block", () => {
    const n = 11;
    let prev = 0;
    for (let i = 0; i < n; i += 1) {
      const s = columnSpan(i, n, 503, 2);
      expect(s.left).toBe(prev);
      prev = s.right;
    }
    expect(prev).toBe(503);
  });
});

describe("driver view, zoom and pan", () => {
  test("auto fit is compact for few drivers and fills the room for many", () => {
    expect(driverView({ n: 10, maxWidth: 1000 }).width).toBe(280);
    expect(driverView({ n: 100, maxWidth: 1000 }).width).toBe(1000);
  });
  test("zoomed auto fit fills the room; a fixed width is n * px, clipped to what fits", () => {
    expect(driverView({ n: 100, range: [10, 20], maxWidth: 800 })).toMatchObject({ start: 10, end: 20, width: 800, colWidth: 80 });
    expect(driverView({ n: 20, colPx: 12, maxWidth: 1000 })).toMatchObject({ count: 20, width: 240 });
    expect(driverView({ n: 100, colPx: 20, maxWidth: 500 })).toMatchObject({ start: 0, end: 25, width: 500, clipped: true });
  });
  test("zoom keeps the anchor column fixed and never shows fewer than 3 columns", () => {
    expect(zoomRange(null, 100, 0.5, 0.5)).toEqual([25, 75]);
    expect(zoomRange([25, 75], 100, 0.5, 2)).toBeNull();
    expect(zoomRange(null, 100, 0, 0.001)).toEqual([0, 3]);
    expect(zoomRange(null, 2, 0.5, 0.1)).toBeNull();
  });
  test("pan moves by columns and stays inside", () => {
    expect(panRange([10, 20], 100, -100, 1000)).toEqual([11, 21]);
    expect(panRange([0, 10], 100, 500, 1000)).toEqual([0, 10]);
    expect(panRange(null, 100, 50, 1000)).toBeNull();
  });
});

describe("driver layout params", () => {
  test("clamp and round trip", () => {
    expect(clampColPx(2)).toBe(4);
    expect(clampColPx(99)).toBe(40);
    expect(clampColPx("abc")).toBeNull();
    expect(driverLayoutFromSearch("?drvw=18&cndrv=1")).toEqual({ driverColPx: 18, cnDrivers: true });
    expect(driverLayoutFromSearch("?x=1")).toBeNull();
    expect(driverLayoutToSearch({ heatmapType: "drivers", driverColPx: 18 })).toEqual({ drvw: "18" });
    expect(driverLayoutToSearch({ heatmapType: "cn", cnDrivers: true, driverColPx: null })).toEqual({ cndrv: "1" });
    expect(driverLayoutToSearch({ heatmapType: "cn", cnDrivers: false, driverColPx: 18 })).toEqual({});
  });
});
