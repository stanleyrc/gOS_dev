import { ALT_BINS, SNV_ALT_TOP, SNV_REF_COLOR, altBin, countRGBA, hexToRgb, setSnvNaMode, snvMetricMax, snvMetricRGBA, snvMissingColor, snvNaMode, snvWhiteNaRGB, vafRGB } from "./matrix";
import { parseSiteState, serializeSiteState, siteAnnotations, matchesAnnotFilter, setRange, setValues } from "./snvAnnot";

afterEach(() => setSnvNaMode("white")); // restore the default

describe("ALT read counts", () => {
  test("discrete bins 0 / 1 / 2 / 3-5 / 6+", () => {
    expect([0, 1, 2, 3, 5, 6, 400].map((v) => altBin(v).label)).toEqual(["0", "1", "2", "3-5", "3-5", "6+", "6+"]);
    expect(altBin(null)).toBeNull();
    expect(new Set(ALT_BINS.map((b) => b.color)).size).toBe(5);
  });
  test("zero reads is not the missing colour; a huge outlier does not flatten the scale", () => {
    expect(snvMetricRGBA(0, "alt", 6)).not.toBe(snvMetricRGBA(null, "alt", 6));
    const snv = { alt: [Float32Array.from([1, 2, 900])], depth: [Float32Array.from([...Array.from({ length: 300 }, (_, i) => 5 + (i % 20)), 5000])] };
    expect(snvMetricMax(snv, "alt")).toBe(6);
    expect(snvMetricMax(snv, "depth")).toBeLessThan(5000);
  });
});

describe("missing colour option", () => {
  test("white by default, grey on request, in every metric", () => {
    expect(snvNaMode()).toBe("white");
    expect(snvMissingColor()).toBe("#ffffff");
    const white = countRGBA(null, 6, "alt");
    expect(snvMetricRGBA(null, "gt", 1)).toBe(white);
    setSnvNaMode("grey");
    expect(snvNaMode()).toBe("grey");
    expect(countRGBA(null, 6, "alt")).not.toBe(white);
    setSnvNaMode(null);
    expect(snvNaMode()).toBe("white");
  });
  test("white NA: reference reads and every alt VAF stay distinct from no reads", () => {
    setSnvNaMode("white");
    const na = vafRGB(null).join(",");
    expect(na).toBe("255,255,255");
    expect(vafRGB(0)).toEqual(hexToRgb(SNV_REF_COLOR));
    expect(vafRGB(0).join(",")).not.toBe(na);
    [0.01, 0.25, 0.5, 1].forEach((f) => {
      const [r, g, b] = vafRGB(f);
      expect(r).toBe(g);
      expect(g).toBe(b);
      expect(r).toBeLessThanOrEqual(SNV_ALT_TOP);
    });
    expect(vafRGB(1)).toEqual([0, 0, 0]);
    expect(vafRGB(0.5)[0]).toBeGreaterThan(vafRGB(0.75)[0]);
    expect(snvWhiteNaRGB(null)).toEqual([255, 255, 255]);
    setSnvNaMode("grey");
    expect(vafRGB(0)).toEqual([255, 255, 255]);
    setSnvNaMode("white");
  });
});

describe("site state in the URL", () => {
  test("round trip", () => {
    const layout = { snvAnnotFilter: { signature: { values: ["SBS13"] }, carriers: { min: 2, max: 40 }, gene: { values: ["TP53", "EGFR"] } }, snvCategories: ["subclonal"], snvDriversOnly: true, snvLabel: "gene", snvNaColor: "grey", snvIsolate: true, snvMinCladeScore: 0.7 };
    const q = new URLSearchParams(serializeSiteState(layout)).toString();
    const back = parseSiteState(`?${q}`);
    expect(back.snvAnnotFilter).toEqual(layout.snvAnnotFilter);
    expect(back).toMatchObject({ snvCategories: ["subclonal"], snvDriversOnly: true, snvLabel: "gene", snvNaColor: "grey", snvIsolate: true, snvMinCladeScore: 0.7 });
  });
  test("defaults add nothing", () => expect(serializeSiteState({})).toEqual({}));
});

describe("filter bar keys", () => {
  const snv = {
    variants: [{ id: "a", gene: "TP53" }, { id: "b", gene: "ENSG1" }, { id: "c", gene: "EGFR" }],
    status: [Int8Array.from([1, 1, 0]), Int8Array.from([1, 0, 0]), Int8Array.from([-1, 0, 1])],
    depth: [Float32Array.from([5, 5, 5]), Float32Array.from([5, 5, 5]), Float32Array.from([5, 5, 5])],
  };
  test("gene and carrier filters", () => {
    const annot = siteAnnotations(snv);
    expect(annot.cat.gene).toEqual(["TP53", null, "EGFR"]);
    expect(Array.from(annot.num.carriers)).toEqual([2, 1, 1]);
    expect(annot.available).not.toContain("gene");
    expect([0, 1, 2].filter((c) => matchesAnnotFilter(annot, setValues(null, "gene", ["TP53", "EGFR"]), c))).toEqual([0, 2]);
    expect([0, 1, 2].filter((c) => matchesAnnotFilter(annot, setRange(null, "carriers", 2, null), c))).toEqual([0]);
  });
});

describe("numeric legend click and QC / F1 filters", () => {
  const { valueAtFraction, fractionOfValue, toggleMin, finiteRange, parseTracks, serializeTracks } = require("./snvAnnot");
  test("click position maps to a threshold and back", () => {
    expect(valueAtFraction([0, 40], 0.5)).toBe(20);
    expect(valueAtFraction([-2, 30], 0)).toBe(-2);
    expect(valueAtFraction([0, 1], 1.7)).toBe(1);
    expect(fractionOfValue([0, 40], 10)).toBeCloseTo(0.25);
    expect(finiteRange(Float32Array.from([NaN, 2, 9, 4]))).toEqual([2, 9]);
    expect(finiteRange(null)).toBeNull();
  });
  test("a legend click sets the filter, applies to the sites and survives the URL", () => {
    const snv = {
      variants: [{ id: "a", sumLogodds: 1, qcNAlt: 3 }, { id: "b", sumLogodds: 8, qcNAlt: 9 }, { id: "c", sumLogodds: null }],
      status: [Int8Array.from([1, 1, 0])],
      depth: [Float32Array.from([5, 5, 5])],
    };
    const annot = siteAnnotations(snv);
    expect(annot.ranges.qc).toEqual([1, 8]);
    const filter = toggleMin(null, "qc", valueAtFraction(annot.ranges.qc, 0.5));
    expect(filter).toEqual({ qc: { min: 4.5 } });
    expect([0, 1, 2].filter((c) => matchesAnnotFilter(annot, filter, c))).toEqual([1]);
    expect(toggleMin(filter, "qc", 4.5)).toBeNull(); // click again clears
    const q = new URLSearchParams(serializeTracks(null, filter)).toString();
    expect(parseTracks(`?${q}`).filter).toEqual(filter);
    expect(Array.from(annot.num.qnalt).slice(0, 2)).toEqual([3, 9]);
  });
  test("F1 filter keeps unscored sites unless exclude is set", () => {
    const snv = { variants: [{ id: "a" }, { id: "b" }, { id: "c" }], status: [Int8Array.from([1, 1, 1])], depth: [Float32Array.from([5, 5, 5])] };
    const fit = { n: 2, f1: Float32Array.from([0.9, 0.3, NaN]), precision: new Float32Array(3), recall: new Float32Array(3), dropout: new Float32Array(3), outside: new Float32Array(3), changes: new Float32Array(3), ci: new Float32Array(3) };
    const annot = siteAnnotations(snv, { fit });
    const keep = { phylo: { min: 0.8 } };
    expect([0, 1, 2].filter((c) => matchesAnnotFilter(annot, keep, c))).toEqual([0, 2]);
    expect([0, 1, 2].filter((c) => matchesAnnotFilter(annot, { phylo: { min: 0.8, exclude: true } }, c))).toEqual([0]);
    const q = new URLSearchParams(serializeTracks(null, { phylo: { min: 0.8, exclude: true } })).toString();
    expect(parseTracks(`?${q}`).filter).toEqual({ phylo: { min: 0.8, exclude: true } });
  });
});
