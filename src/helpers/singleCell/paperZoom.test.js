import { axisWindows, regionWindows, colIndexAt, snvAt, snvLookup, cellFromLabel, graphInWindow, lensContains, lensOn, lensPan, lensToDisplay, lensToPage, lensView, lensZoom, marksInBox, nearestJunction, regionWindow } from "./paperZoom";
import { parseSidecar, toPage } from "./paperSidecar";

describe("panel lens", () => {
  const rect = { x: 100, y: 50, w: 200, h: 100 };
  it("maps page <-> display and zooms about the pointer", () => {
    const l = lensOn(rect);
    expect(lensToDisplay(l, 2, 150, 60)).toEqual([300, 120]);
    expect(lensToPage(l, 2, 300, 120)).toEqual([150, 60]);
    const z = lensZoom(l, 2, 4, 300, 120);
    expect(z.s).toBe(4);
    const [x, y] = lensToPage(z, 2, 300, 120);
    expect(x).toBeCloseTo(150);
    expect(y).toBeCloseTo(60);
    expect(lensView(z).x1 - lensView(z).x0).toBeCloseTo(50);
    expect(lensContains(z, 2, 250, 150)).toBe(true);
    expect(lensContains(z, 2, 10, 10)).toBe(false);
  });
  it("clamps scale and panning to the panel", () => {
    expect(lensZoom(lensOn(rect), 2, 0.1, 300, 120).s).toBe(1);
    const z = lensZoom(lensOn(rect), 2, 2, 200, 100);
    const p = lensPan(z, 2, 10000, 10000);
    expect(p.ox).toBe(100);
    expect(p.oy).toBe(50);
  });
});

describe("genome tracks", () => {
  const graph = {
    intervals: [
      { iid: 1, chromosome: "7", startPoint: 100, endPoint: 200, y: 2 },
      { iid: 2, chromosome: "7", startPoint: 201, endPoint: 500, y: 40 },
      { iid: 3, chromosome: "12", startPoint: 1, endPoint: 50, y: 3 },
    ],
    connections: [
      { cid: 9, source: 1, sink: -2, type: "ALT", weight: 38, title: "DEL-like" },
      { cid: 10, source: 2, sink: 3, type: "ALT", weight: 5, title: "TRA" },
      { cid: 11, source: 1, sink: 2, type: "REF", weight: 2 },
    ],
  };
  it("finds segments and junctions in a window", () => {
    const g = graphInWindow(graph, { chr: "chr7", from: 150, to: 600 });
    expect(g.segs.map((s) => s.cn)).toEqual([2, 40]);
    expect(g.juncs.map((j) => [j.id, j.a, j.b, j.cn])).toEqual([[9, 200, 500, 38], [10, 500, 1, 5]]);
    expect(nearestJunction(g.juncs, "7", 495, 10).id).toBe(9);
    expect(nearestJunction(g.juncs, "7", 300, 10)).toBeNull();
  });
  it("reads a cell id from a region label and a window from a region", () => {
    expect(cellFromLabel("Short-only cell BWH70_MR_1_pl1_7b: JaBbA graph")).toBe("BWH70_MR_1_pl1_7b");
    expect(cellFromLabel("Genome tracks, cell BWH69_MR_4_tube2_pl1_8B")).toBe("BWH69_MR_4_tube2_pl1_8B");
    expect(cellFromLabel("no cell")).toBeNull();
    expect(regionWindow({ x: 0, w: 100, axis: { chr: "7", from: 0, to: 1000 } }, 25, 50)).toEqual({ chr: "7", from: 250, to: 500 });
  });
});

describe("box selection", () => {
  it("collects cells of points and rect centres inside a page box", () => {
    const sc = parseSidecar({
      regions: [
        { id: "p", kind: "plot", x: 0, y: 0, w: 100, h: 100, xscale: { range: [0, 10] }, yscale: { range: [0, 10] }, marks: [{ type: "points", x: [1, 9], y: [9, 1], fields: { cell: ["a", "b"], patient: "P1" } }, { type: "rects", xmin: [0], xmax: [2], ymin: [0], ymax: [2], fields: { cell: ["c"] } }] },
      ],
    });
    const m = marksInBox(sc, 0, 0, 30, 100, toPage);
    expect([...m.entries()]).toEqual([["a", "P1"], ["c", null]]);
  });
});

describe("SNV heatmap data", () => {
  it("looks up reads per cell and site and maps x to columns", () => {
    const L = snvLookup({ variants: [{ id: "chr7_100_A_T", gene: "EGFR" }, { id: "chr7_200_G_C" }], cells: { c1: [[0, 3, 1, 1]], c2: [] } });
    expect(snvAt(L, "c1", "7_100_A_T")).toEqual({ ref: 3, alt: 1, vaf: 0.25, gene: "EGFR" });
    expect(snvAt(L, "c2", "chr7_100_A_T").vaf).toBeNull();
    expect(snvAt(L, "c1", "x")).toBeNull();
    expect(colIndexAt({ x: 10, w: 100, cols: { ids: ["a", "b", "c", "d"] } }, 60)).toBe(2);
    expect(colIndexAt({ x: 10, w: 100 }, 60)).toBe(-1);
  });
});

describe("broken genome axes", () => {
  it("maps page x to the right window of a multi-window axis", () => {
    const r = { x: 0, w: 100, axis: { type: "genome", windows: [{ chr: "2", from: 14e6, to: 16e6, f0: 0, f1: 0.6 }, { chr: "12", from: 57e6, to: 58e6, f0: 0.7, f1: 1 }] } };
    expect(axisWindows(r).length).toBe(2);
    const ws = regionWindows(r, 30, 85);
    expect(ws.map((w) => [w.chr, w.from, w.to])).toEqual([["2", 15e6, 16e6], ["12", 57e6, 57.5e6]]);
    expect(axisWindows({ x: 0, w: 10, axis: { chr: "7", from: 1, to: 2 } })).toEqual([{ chr: "7", from: 1, to: 2, f0: 0, f1: 1 }]);
  });
});
