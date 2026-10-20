import { searchGeneOptions, pickedSpans, domainsForSpans, sameDomains } from "./geneSearch";

const options = [
  { label: "EGFR", value: 0 }, { label: "EGFR-AS1", value: 1 }, { label: "SEC61G", value: 2 }, { label: "PEGF", value: 3 }, { label: "egfl7", value: 4 },
];

describe("gene search helpers", () => {
  it("ranks exact, then prefix, then substring, case-insensitively, and caps results", () => {
    expect(searchGeneOptions(options, "egfr").map((o) => o.label)).toEqual(["EGFR", "EGFR-AS1"]);
    expect(searchGeneOptions(options, "EGF").map((o) => o.label)).toEqual(["egfl7", "EGFR", "EGFR-AS1", "PEGF"]);
    expect(searchGeneOptions(options, "egf", 2)).toHaveLength(2);
    expect(searchGeneOptions(options, "")).toEqual([]);
    expect(searchGeneOptions(null, "x")).toEqual([]);
  });
  it("maps picked indices to spans and drops bad ones", () => {
    const spans = pickedSpans([0, 1, 2, 9], options, [100, 5000, NaN], [900, 6000, 1]);
    expect(spans.map((s) => s.name)).toEqual(["EGFR", "EGFR-AS1"]);
  });
  it("pads, clamps and merges domains", () => {
    expect(domainsForSpans([{ name: "A", start: 100000, end: 110000 }], 1e6, { padFrac: 0.5, minPad: 1 })).toEqual([[95000, 115000]]);
    expect(domainsForSpans([{ name: "A", start: 10, end: 20 }], 1e6, { minPad: 1000 })).toEqual([[1, 1020]]);
    expect(domainsForSpans([{ name: "A", start: 1000, end: 2000 }, { name: "B", start: 3000, end: 4000 }], 1e6, { minPad: 5000 })).toEqual([[1, 9000]]);
    expect(domainsForSpans([{ name: "A", start: 0, end: 10 }, { name: "B", start: 900000, end: 999999 }], 1e6, { minPad: 100 })).toHaveLength(2);
    expect(domainsForSpans([], 1e6)).toBeNull();
    expect(domainsForSpans([{ start: 1, end: 2 }], 0)).toBeNull();
  });
  it("compares domains", () => {
    expect(sameDomains([[1, 2]], [[1, 2]])).toBe(true);
    expect(sameDomains([[1, 2]], [[1, 3]])).toBe(false);
    expect(sameDomains(null, [[1, 2]])).toBe(false);
  });
});
