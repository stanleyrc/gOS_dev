import { chromLimits, cnPixels, panWindow, parseCnBinnedMeta, windowBins, windowLabel, zoomWindow } from "./paperCnZoom";

const meta = parseCnBinnedMeta({
  cells: ["a", "b"],
  levels: { "100kb": { bin_size: 100, n_bins: 5, missing_value: 65535, chromosomes: [{ chr: "1", first_bin: 0, n_bins: 2 }, { chr: "7", first_bin: 2, n_bins: 3 }] } },
});

describe("paper CN zoom", () => {
  it("parses the 100 kb level and maps windows to bins", () => {
    expect(meta.index.get("b")).toBe(1);
    expect(windowBins(meta, "chr7", 1, 300)).toEqual({ b0: 2, b1: 5 });
    expect(windowBins(meta, "7", 150, 210)).toEqual({ b0: 3, b1: 5 });
    expect(windowBins(meta, "X", 1, 10)).toBeNull();
    expect(chromLimits(meta, "7")).toEqual([1, 300]);
    expect(parseCnBinnedMeta({})).toBeNull();
  });
  it("zooms about a point and pans within limits", () => {
    expect(zoomWindow({ from: 0, to: 1000 }, 0.5, 0.5, [0, 1000], 10)).toEqual({ from: 250, to: 750 });
    expect(zoomWindow({ from: 0, to: 1000 }, 0.5, 0, [0, 1000], 10)).toEqual({ from: 0, to: 500 });
    expect(zoomWindow({ from: 0, to: 100 }, 0.01, 0.5, [0, 1000], 50)).toEqual({ from: 25, to: 75 });
    expect(panWindow({ from: 100, to: 200 }, 10, [0, 300])).toEqual({ from: 200, to: 300 });
    expect(windowLabel("7", { from: 50e6, to: 57e6 })).toBe("chr7:50.0–57.0 Mb");
  });
  it("paints rows of cells across the window, missing transparent", () => {
    // cell-major: a = [1,1, 2,3,65535], b = [0,0, 5,5,5]
    const values = Uint16Array.from([1, 1, 2, 3, 65535, 0, 0, 5, 5, 5]);
    const px = cnPixels(values, meta, ["b", "a", "zz"], { from: 1, to: 300 }, "7", 3, (v) => [v, v, v]);
    expect(Array.from(px.slice(0, 12))).toEqual([5, 5, 5, 255, 5, 5, 5, 255, 5, 5, 5, 255]);
    expect(Array.from(px.slice(12, 24))).toEqual([2, 2, 2, 255, 3, 3, 3, 255, 0, 0, 0, 0]);
    expect(Array.from(px.slice(24, 36)).every((v) => v === 0)).toBe(true);
  });
});
