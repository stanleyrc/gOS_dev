import { ALT_BINS, altBin, countRGBA, setSnvNaMode, snvMetricMax, snvMetricRGBA, snvMissingColor, snvNaMode } from "./matrix";
import { parseSiteState, serializeSiteState, siteAnnotations, matchesAnnotFilter, setRange, setValues } from "./snvAnnot";

afterEach(() => setSnvNaMode("grey"));

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
  test("grey by default, white on request, in every metric", () => {
    expect(snvNaMode()).toBe("grey");
    const grey = countRGBA(null, 6, "alt");
    setSnvNaMode("white");
    expect(snvMissingColor()).toBe("#ffffff");
    expect(countRGBA(null, 6, "alt")).not.toBe(grey);
    expect(snvMetricRGBA(null, "gt", 1)).toBe(countRGBA(null, 6, "alt"));
  });
});

describe("site state in the URL", () => {
  test("round trip", () => {
    const layout = { snvAnnotFilter: { signature: { values: ["SBS13"] }, carriers: { min: 2, max: 40 }, gene: { values: ["TP53", "EGFR"] } }, snvCategories: ["subclonal"], snvDriversOnly: true, snvLabel: "gene", snvNaColor: "white", snvIsolate: true, snvMinCladeScore: 0.7 };
    const q = new URLSearchParams(serializeSiteState(layout)).toString();
    const back = parseSiteState(`?${q}`);
    expect(back.snvAnnotFilter).toEqual(layout.snvAnnotFilter);
    expect(back).toMatchObject({ snvCategories: ["subclonal"], snvDriversOnly: true, snvLabel: "gene", snvNaColor: "white", snvIsolate: true, snvMinCladeScore: 0.7 });
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
