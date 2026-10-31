import { binDensity, binLegendText, snvBinRGB } from "./snvBinning";
import { columnBins, snvWhiteNaRGB, hexToRgb, snvMissingColor } from "./matrix";

describe("snvBinning", () => {
  it("one carrier among many sites stays near white, unlike the single-site floor", () => {
    const bin = snvBinRGB(1, 20)[0];
    expect(bin).toBeGreaterThan(240);
    expect(snvWhiteNaRGB(0.05)[0]).toBeLessThanOrEqual(205);
  });
  it("is linear from white to black and never lighter for more carriers", () => {
    const levels = [0, 5, 10, 20].map((p) => snvBinRGB(p, 20)[0]);
    expect(levels[0]).toBe(255);
    expect(levels[3]).toBe(0);
    expect(levels).toEqual([...levels].sort((a, b) => b - a));
  });
  it("all-missing bin takes the no-reads colour", () => {
    expect(snvBinRGB(0, 5, 5)).toEqual(hexToRgb(snvMissingColor()));
  });
  it("reports density and exact drawing", () => {
    expect(binDensity(columnBins(10, 20))).toBeNull();
    const d = binDensity(columnBins(100, 10));
    expect(d.mean).toBe(10);
    expect(d.max).toBe(10);
    expect(binLegendText(columnBins(10, 20))).toBe("one site per column");
    expect(binLegendText(columnBins(100, 10))).toContain("~10 sites per pixel");
  });
});

import { effectiveSnvMetric, gtBinRGB } from "./snvBinning";
import { GT_MATRIX, snvMetricRGBA } from "./matrix";

describe("genotype colours", () => {
  it("gt bins: all REF pure white, all ALT the alt colour, no calls grey, same ramp as single sites", () => {
    expect(gtBinRGB(0, 8)).toEqual([255, 255, 255]);
    expect(gtBinRGB(8, 0)).toEqual(hexToRgb(GT_MATRIX.alt));
    expect(gtBinRGB(0, 0)).toEqual(hexToRgb(GT_MATRIX.nocall));
    expect(gtBinRGB(1, 1)[1]).toBeLessThan(255);
    expect(gtBinRGB(1, 1)[1]).toBeGreaterThan(gtBinRGB(8, 0)[1]);
  });
  it("single-site GT: REF is white (not blue)", () => {
    const px = snvMetricRGBA(0, "gt", 1);
    expect(px).toBe(0xffffffff);
    expect(snvMetricRGBA(1, "gt", 1)).not.toBe(px);
    expect(snvMetricRGBA(null, "gt", 1)).not.toBe(px);
  });
  it("falls back to VAF without calls", () => {
    expect(effectiveSnvMetric("gt", { gt: null })).toBe("vaf");
    expect(effectiveSnvMetric("gt", { gt: [] })).toBe("gt");
    expect(effectiveSnvMetric("alt", { gt: null })).toBe("alt");
  });
});
