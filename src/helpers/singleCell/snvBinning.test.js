import { binDensity, binLegendText, snvBinRGB } from "./snvBinning";
import { columnBins, snvWhiteNaRGB, hexToRgb, snvMissingColor, packRGBA } from "./matrix";

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

import { effectiveSnvMetric, gtBinRGB, plBinRGBA, plBinSummary, plProb, plRGB, PL_NO_EVIDENCE, setPlMarkNoRead } from "./snvBinning";
import { snvMetricValue } from "./matrix";
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

describe("PL confidence greyscale", () => {
  const byte = (p) => 1 + Math.round(249 * p);
  it("decodes bytes: 0 none, 255 flat PL = no evidence, 1..250 = P(ALT)", () => {
    expect(plProb(0)).toBeNull();
    expect(plProb(255)).toBeNull();
    expect(plProb(1)).toBe(0);
    expect(plProb(250)).toBe(1);
    expect(plProb(byte(0.5))).toBeCloseTo(0.5, 2);
  });
  it("confident REF is white, confident ALT black, uncertain mid grey, monotone", () => {
    expect(plRGB(0)).toEqual([255, 255, 255]);
    expect(plRGB(1)).toEqual([0, 0, 0]);
    expect(plRGB(0.5)[0]).toBeGreaterThan(100);
    expect(plRGB(0.5)[0]).toBeLessThan(160);
    const v = [0, 0.2, 0.5, 0.8, 1].map((p) => plRGB(p)[0]);
    expect(v).toEqual([...v].sort((a, b) => b - a));
  });
  it("no read evidence is white like REF by default, a pale non-grey tint when marked", () => {
    expect(plRGB(null)).toEqual([255, 255, 255]);
    setPlMarkNoRead(true);
    const [r, g, b] = plRGB(null);
    expect(hexToRgb(PL_NO_EVIDENCE.light)).toEqual([r, g, b]);
    expect(b).toBeGreaterThan(r);
    expect(r).toBeGreaterThan(200);
    setPlMarkNoRead(false);
  });
  const snv = { pl: [Uint8Array.from([byte(0), byte(1), 255, 0, byte(0.5)])] };
  const cols = [0, 1, 2, 3, 4];
  it("a bin averages P(ALT) over sites with evidence only (flat and missing excluded)", () => {
    const s = plBinSummary(snv, 0, cols, 0, 5);
    expect(s.n).toBe(3);
    expect(s.sum / s.n).toBeCloseTo(0.5, 2);
    expect(plBinSummary(snv, 0, cols, 2, 4).n).toBe(0);
  });
  it("an all-no-evidence bin (or a row without data) is white, tinted when marked; single site and bin of one agree", () => {
    expect(plBinRGBA(plBinSummary(snv, 0, cols, 2, 4))).toBe(packRGBA([255, 255, 255]));
    expect(plBinRGBA(plBinSummary(snv, -1, cols, 0, 5))).toBe(packRGBA([255, 255, 255]));
    setPlMarkNoRead(true);
    expect(plBinRGBA(plBinSummary(snv, 0, cols, 2, 4))).toBe(packRGBA(hexToRgb(PL_NO_EVIDENCE.light)));
    expect(plBinRGBA(plBinSummary(snv, -1, cols, 0, 5))).toBe(packRGBA(hexToRgb(PL_NO_EVIDENCE.light)));
    setPlMarkNoRead(false);
    expect(plBinRGBA(plBinSummary(snv, 0, cols, 1, 2))).toBe(packRGBA(plRGB(snvMetricValue(snv, 0, 1, "gt"))));
  });
  it("snvMetricValue gt uses PL when present; the metric stays gt without hard calls", () => {
    expect(snvMetricValue(snv, 0, 0, "gt")).toBe(0);
    expect(snvMetricValue(snv, 0, 2, "gt")).toBeNull();
    expect(effectiveSnvMetric("gt", { gt: null, pl: [] })).toBe("gt");
    expect(effectiveSnvMetric("gt", { gt: null, pl: null })).toBe("vaf");
  });
});
