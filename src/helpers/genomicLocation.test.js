/** @jest-environment node */

import {
  getCoordinateCopyValue,
  parseVariantG,
} from "./genomicLocation";

describe("parseVariantG", () => {
  test.each([
    [
      "17:7577568-7577568 C>A",
      {
        chromosome: "17",
        start: "7577568",
        end: "7577568",
        reference: "C",
        alternate: "A",
      },
    ],
    [
      "1:16262679-16262680 A>AC",
      {
        chromosome: "1",
        start: "16262679",
        end: "16262680",
        reference: "A",
        alternate: "AC",
      },
    ],
    [
      "15:74327546-74327560 GTCCTCGCCAGCCCAC>G",
      {
        chromosome: "15",
        start: "74327546",
        end: "74327560",
        reference: "GTCCTCGCCAGCCCAC",
        alternate: "G",
      },
    ],
    [
      "  ChRx:66905929-66905929 c > t  ",
      {
        chromosome: "x",
        start: "66905929",
        end: "66905929",
        reference: "c",
        alternate: "t",
      },
    ],
    [
      "chrM:100-101 a>g",
      {
        chromosome: "M",
        start: "100",
        end: "101",
        reference: "a",
        alternate: "g",
      },
    ],
  ])("parses the small-variant display value %s", (value, expected) => {
    expect(parseVariantG(value)).toEqual(expected);
  });

  it("keeps a complete shape for the legacy single-position shorthand", () => {
    expect(parseVariantG("1:100 A>G")).toEqual({
      chromosome: "1",
      start: "100",
      end: "100",
      reference: "A",
      alternate: "G",
    });
  });

  test.each([
    null,
    undefined,
    {},
    "",
    "not a variant",
    "1:100-100",
    "1:100-100 A>",
    "1:100-100 A>G extra",
    "1:100-1:200",
  ])("returns null for malformed input %#", (value) => {
    expect(parseVariantG(value)).toBeNull();
  });
});

describe("getCoordinateCopyValue", () => {
  it("removes a terminal SNV allele change", () => {
    expect(getCoordinateCopyValue("17:7577568-7577568 C>A")).toBe(
      "17:7577568-7577568",
    );
    expect(getCoordinateCopyValue("1:100-101 C > CT")).toBe("1:100-101");
  });

  it("preserves unsuffixed and fusion coordinates", () => {
    expect(getCoordinateCopyValue("1:100-1:200")).toBe("1:100-1:200");
    expect(getCoordinateCopyValue("5:10-20-,7:30-40+")).toBe(
      "5:10-20-,7:30-40+",
    );
  });

  it("normalizes absent and surrounding whitespace", () => {
    expect(getCoordinateCopyValue(null)).toBe("");
    expect(getCoordinateCopyValue("  1:100-200  ")).toBe("1:100-200");
  });
});
