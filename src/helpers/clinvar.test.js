/** @jest-environment node */

import {
  getClinvarAlleleId,
  getClinvarAlleleUrl,
  getClinvarUrl,
  isClinvarAnnotation,
} from "./clinvar";

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
    [{ class: "pathogenic", desc: "Pathogenic" }, true],
    [{ class: "benign", desc: "Benign" }, true],
    [{ class: "na", desc: "Conflicting pathogenicity" }, true],
    [{ class: "na", desc: "Not Cancer Related" }, true],
    [{ class: "na", desc: "Not in ClinVar" }, false],
    [{ class: "NA", desc: "  not in clinvar  " }, false],
    [{ class: "na", desc: null }, true],
    [{}, false],
    [null, false],
  ])("identifies whether an annotation is in ClinVar", (annotation, expected) => {
    expect(isClinvarAnnotation(annotation)).toBe(expected);
  });

  test("prefers an allele-ID link for any annotation in ClinVar", () => {
    expect(
      getClinvarUrl(
        { class: "pathogenic", desc: "Pathogenic" },
        { ALLELEID: 12345, Variant_g: "17:7577538-7577538 C>T" },
      ),
    ).toBe("https://www.ncbi.nlm.nih.gov/clinvar/?term=12345[alleleid]");
  });

  test.each([
    [
      { class: "pathogenic", desc: "Pathogenic" },
      { Variant_g: "17:7577538-7577538 C>T" },
      "https://www.ncbi.nlm.nih.gov/clinvar/?term=17%3A7577538-7577538%20C%3ET",
    ],
    [
      { class: "benign", desc: "Benign" },
      { Variant: "p.Arg248Gln / c.743G>A", gene: "TP53" },
      "https://www.ncbi.nlm.nih.gov/clinvar/?term=TP53%20c.743G%3EA",
    ],
    [
      { class: "na", desc: "Conflicting pathogenicity" },
      { gene: "SDHA" },
      "https://www.ncbi.nlm.nih.gov/clinvar/?term=SDHA",
    ],
  ])(
    "falls back to a variant search when an annotation has no allele ID",
    (annotation, record, expected) => {
      expect(getClinvarUrl(annotation, record)).toBe(expected);
    },
  );

  test("does not link only annotations that are not in ClinVar", () => {
    expect(
      getClinvarUrl(
        { class: "na", desc: "Not in Clinvar" },
        { Variant_g: "17:7577538-7577538 C>T" },
      ),
    ).toBeNull();
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
