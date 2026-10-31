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
