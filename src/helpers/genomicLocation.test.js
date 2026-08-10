/** @jest-environment node */

import { getCoordinateCopyValue } from "./genomicLocation";

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
