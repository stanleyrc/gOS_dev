import { binDensity, binLegendText, snvBinRGB } from "./snvBinning";
import { columnBins, snvWhiteNaRGB, hexToRgb, snvMissingColor, packRGBA } from "./matrix";

describe("snvBinning", () => {
  it("one carrier among many sites stays near white, unlike the single-site floor", () => {
    const bin = snvBinRGB(1, 20)[0];
    expect(bin).toBeGreaterThan(240);
    expect(snvWhiteNaRGB(0.05)[0]).toBeGreaterThan(225);
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

import { isLoneRead, snvBinIntensity, strongCarriers, snvBinRGB as _bin, effectiveSnvMetric, gtBinRGB, homProb, plBinRGBA, plBinSummary, plHomRGB, plProb, plRGB, PL_NO_EVIDENCE, setPlMarkNoRead } from "./snvBinning";
import { plReadCap, snvMetricValue } from "./matrix";
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

  it("a covered cell with zero ALT reads is never signal, whatever its PL byte says", () => {
    const snv = { status: [Int8Array.from([0, 1, -1])], pl: [Uint8Array.from([byte(0.9), byte(0.9), byte(0.9)])] };
    expect(snvMetricValue(snv, 0, 0, "gt")).toBe(0);
    expect(snvMetricValue(snv, 0, 1, "gt")).toBeCloseTo(0.9, 2);
    expect(plBinRGBA(plBinSummary(snv, 0, [0, 0], 0, 2))).toBe(packRGBA([255, 255, 255]));
  });
});

describe("het vs hom-ALT colouring", () => {
  const byte = (p) => 1 + Math.round(249 * p);
  it("two distinct hues at full P(ALT), white at P = 0, greyscale without a split", () => {
    const het = plHomRGB(1, 0);
    const hom = plHomRGB(1, 1);
    expect(het).not.toEqual(hom);
    expect(het[0]).toBeGreaterThan(hom[0]); // orange vs deep purple
    expect(plHomRGB(0, 1)).toEqual([255, 255, 255]);
    expect(plHomRGB(0.5, 0)[0]).toBeGreaterThan(het[0] - 1);
    expect(plHomRGB(1, null)).toEqual(plRGB(1));
    expect(plHomRGB(null, 1)).toEqual(plRGB(null));
  });
  it("bins weight the het/hom share by P(ALT) and ignore sites without evidence", () => {
    const snv = { pl: [Uint8Array.from([byte(1), byte(1), 255, byte(0)])], hom: [Uint8Array.from([byte(1), byte(0), 255, byte(1)])] };
    const s = plBinSummary(snv, 0, [0, 1, 2, 3], 0, 4);
    expect(s.n).toBe(3);
    expect(s.hSum / s.hW).toBeCloseTo(0.5, 2); // P = 0 site carries no weight
    expect(homProb(snv, 0, 2)).toBeNull();
    expect(homProb({ pl: snv.pl }, 0, 0)).toBeNull();
    expect(plBinRGBA(plBinSummary({ pl: snv.pl }, 0, [0, 1], 0, 2))).toBe(packRGBA(plRGB(1)));
  });
  it("VAF is the default metric", () => {
    expect(effectiveSnvMetric(undefined, { gt: null, pl: [] })).toBe("vaf");
  });

  it("display is capped by read support: a lone ALT read fades with REF depth, multi-read support stays dark", () => {
    const hi = byte(0.99); // PL (dropout model / clonal prior) says ALT
    const mk = (a, r) => ({ status: [Int8Array.of(1)], alt: [Float32Array.of(a)], depth: [Float32Array.of(a + r)], pl: [Uint8Array.of(hi)] });
    const v = (a, r) => snvMetricValue(mk(a, r), 0, 0, "gt");
    expect(v(1, 15)).toBeLessThan(0.15);
    expect(v(1, 20)).toBeLessThan(v(1, 16));
    expect(v(1, 16)).toBeLessThan(v(1, 15));
    expect(v(1, 5)).toBeGreaterThan(v(1, 10));
    expect(v(3, 5)).toBeCloseTo(0.99, 2);
    expect(v(2, 3)).toBeCloseTo(0.99, 2);
    expect(plReadCap(1, 1)).toBe(1);
    expect(plReadCap(undefined, 10)).toBe(1); // counts unknown: no cap, PL as stored
    const low = { status: [Int8Array.of(1)], alt: [Float32Array.of(2)], depth: [Float32Array.of(3)], pl: [Uint8Array.of(byte(0.1))] };
    expect(snvMetricValue(low, 0, 0, "gt")).toBeCloseTo(0.1, 2); // never raised above the PL
  });
});

describe("VAF view: no floor, mean-based bins", () => {
  const mk = (alts, depths) => ({
    variants: alts.map(() => ({})),
    status: [Int8Array.from(alts.map((a) => (a > 0 ? 1 : 0)))],
    alt: [Float32Array.from(alts)],
    depth: [Float32Array.from(depths)],
  });
  it("1 ALT in 15, 16 and 20 REF reads is near white and ordered by depth", () => {
    const l = (r) => snvWhiteNaRGB(1 / (1 + r))[0];
    expect(l(15)).toBeGreaterThan(225);
    expect(l(20)).toBeGreaterThan(l(16));
    expect(l(16)).toBeGreaterThan(l(15));
    expect(snvWhiteNaRGB(0.3)[0]).toBeLessThan(140); // real VAFs stay strong
  });
  it("a bin is the mean intensity: nine lone reads in deep REF do not paint it, true carriers do", () => {
    const lone = mk(Array(10).fill(1), Array(10).fill(21));
    const real = mk(Array(10).fill(8), Array(10).fill(12));
    const cols = [...Array(10).keys()];
    const lv = snvBinRGB(snvBinIntensity(lone, 0, cols, 0, 10), 10)[0];
    const rv = snvBinRGB(snvBinIntensity(real, 0, cols, 0, 10), 10)[0];
    expect(lv).toBeGreaterThan(225);
    expect(rv).toBeLessThan(10);
  });
});

describe("lone-read rule", () => {
  const snv = { variants: [{}, {}], alt: [Float32Array.of(1, 1), Float32Array.of(3, 1)] };
  it("a 1-ALT cell is lone unless its clone has a 2+ ALT cell at the site", () => {
    const strong = strongCarriers(snv, [0, 1], ["A", "A"]);
    expect(isLoneRead(snv, 0, 0, "A", strong)).toBe(false); // clone-mate has 3 ALT reads at site 0
    expect(isLoneRead(snv, 0, 1, "A", strong)).toBe(true);
    expect(isLoneRead(snv, 1, 0, "A", strong)).toBe(false); // 3 reads is not lone
    const other = strongCarriers(snv, [0, 1], ["A", "B"]);
    expect(isLoneRead(snv, 0, 0, "A", other)).toBe(true); // supporter is in another clone
  });
  it("plBinSummary treats lone cells as P = 0 only when the rule is passed", () => {
    const s2 = { pl: [Uint8Array.of(250, 250)], status: [Int8Array.of(1, 1)] };
    expect(plBinSummary(s2, 0, [0, 1], 0, 2).sum).toBe(2);
    expect(plBinSummary(s2, 0, [0, 1], 0, 2, (c) => c === 0).sum).toBe(1);
  });
});
