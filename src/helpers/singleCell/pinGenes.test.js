import { genePrefixMatch, geneSelectOptions } from "./pinGenes";

describe("pinGenes", () => {
  it("maps gene options to label/value pairs and tolerates missing lists", () => {
    expect(geneSelectOptions([{ label: "EGFR", value: 1 }, { label: "PTEN", value: 2 }, null, { value: 3 }])).toEqual([
      { value: "EGFR", label: "EGFR" },
      { value: "PTEN", label: "PTEN" },
    ]);
    expect(geneSelectOptions(undefined)).toEqual([]);
  });
  it("matches by case-insensitive prefix", () => {
    expect(genePrefixMatch("eg", { value: "EGFR" })).toBe(true);
    expect(genePrefixMatch("fr", { value: "EGFR" })).toBe(false);
    expect(genePrefixMatch("", { value: "EGFR" })).toBe(true);
    expect(genePrefixMatch("x", {})).toBe(false);
  });
});
