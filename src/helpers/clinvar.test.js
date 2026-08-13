/** @jest-environment node */

import { getClinvarAlleleId, getClinvarAlleleUrl } from "./clinvar";

describe("ClinVar allele links", () => {
  test.each([
    [{ alleleId: 12345 }, "12345"],
    [{ alleleid: "23456" }, "23456"],
    [{ ALLELEID: 34567 }, "34567"],
    [{ AlleleID: "45678" }, "45678"],
  ])("reads supported allele ID representations", (annotation, expected) => {
    expect(getClinvarAlleleId(annotation)).toBe(expected);
  });

  test("builds the NCBI ClinVar allele search URL", () => {
    expect(getClinvarAlleleUrl({ ALLELEID: 12345 })).toBe(
      "https://www.ncbi.nlm.nih.gov/clinvar/?term=12345[alleleid]",
    );
  });

  test.each([
    null,
    {},
    { alleleId: null },
    { alleleId: "" },
    { alleleId: "not-an-id" },
  ])("does not link an annotation without a valid allele ID", (annotation) => {
    expect(getClinvarAlleleId(annotation)).toBeNull();
    expect(getClinvarAlleleUrl(annotation)).toBeNull();
  });
});
