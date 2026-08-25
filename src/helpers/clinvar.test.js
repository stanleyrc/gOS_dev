/** @jest-environment node */

import {
  getClinvarAlleleId,
  getClinvarAlleleUrl,
  getClinvarGenomicVariant,
  getClinvarLinkModel,
  getClinvarSearchTerm,
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

  test("extracts VCF-like fields from a genomic display value", () => {
    expect(
      getClinvarGenomicVariant({
        Variant_g: "9:5073770-5073770 G>T",
      }),
    ).toEqual({
      chromosome: "9",
      start: "5073770",
      reference: "G",
      alternate: "T",
    });
    expect(
      getClinvarGenomicVariant({
        Variant_g: "chrX:66905929-66905929 C>T",
      }),
    ).toEqual({
      chromosome: "X",
      start: "66905929",
      reference: "C",
      alternate: "T",
    });
    expect(
      getClinvarGenomicVariant({ Variant_g: "not a variant" }),
    ).toBeNull();
    expect(getClinvarGenomicVariant({})).toBeNull();
  });

  test("keeps ClinVar chromosome, allele, and shorthand normalization", () => {
    expect(
      getClinvarGenomicVariant({ Variant_g: "chrm:100 a>g" }),
    ).toEqual({
      chromosome: "MT",
      start: "100",
      reference: "A",
      alternate: "G",
    });
    expect(
      getClinvarGenomicVariant({ Variant_g: "1:100-100 A > G" }),
    ).toBeNull();
    expect(
      getClinvarGenomicVariant({ Variant_g: "23:100-100 A>G" }),
    ).toBeNull();
  });

  test.each([
    ["9:5073770-5073770 G>T", "9:5073770:G:T(GRCh37)"],
    ["1:16262679-16262680 A>AC", "1:16262679:A:AC(GRCh37)"],
    [
      "15:74327546-74327560 GTCCTCGCCAGCCCAC>G",
      "15:74327545:GTCCTCGCCAGCCCAC:G(GRCh37)",
    ],
  ])(
    "builds an assembly-specific ClinVar query from %s",
    (variantG, expected) => {
      expect(getClinvarSearchTerm({ Variant_g: variantG })).toBe(expected);
    },
  );

  test("falls back to coding HGVS or gene when Variant_g is unavailable", () => {
    expect(
      getClinvarSearchTerm({
        gene: "TP53",
        Variant: "p.Arg248Gln / c.743G>A",
      }),
    ).toBe("TP53 c.743G>A");
    expect(getClinvarSearchTerm({ gene: "SDHA" })).toBe("SDHA");
    expect(getClinvarSearchTerm({})).toBeNull();
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
      {
        gene: "JAK2",
        Variant: "p.Val617Phe / c.1849G>T",
        Variant_g: "9:5073770-5073770 G>T",
      },
      "9:5073770:G:T(GRCh37)",
    ],
    [
      { class: "benign", desc: "Benign" },
      { Variant: "p.Arg248Gln / c.743G>A", gene: "TP53" },
      "TP53 c.743G>A",
    ],
    [
      { class: "na", desc: "Conflicting pathogenicity" },
      { Variant_g: "17:7577538-7577538 C>T" },
      "17:7577538:C:T(GRCh37)",
    ],
    [
      { class: "na", desc: "Not Cancer Related" },
      {
        gene: "PML",
        Variant:
          "p.Ala595_Pro599del / c.1784_1798delCCCACTCCTCGCCAG",
        Variant_g: "15:74327546-74327560 GTCCTCGCCAGCCCAC>G",
      },
      "15:74327545:GTCCTCGCCAGCCCAC:G(GRCh37)",
    ],
    [
      { class: "na", desc: "Conflicting pathogenicity" },
      { gene: "SDHA" },
      "SDHA",
    ],
  ])(
    "falls back to a variant search when an annotation has no allele ID",
    (annotation, record, searchTerm) => {
      expect(getClinvarUrl(annotation, record)).toBe(
        `https://www.ncbi.nlm.nih.gov/clinvar/?term=${encodeURIComponent(
          searchTerm,
        )}`,
      );
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

describe("ClinVar link model", () => {
  test.each([
    [
      "annotation allele ID precedence",
      { class: "pathogenic", desc: "Pathogenic", ALLELEID: 12345 },
      { ALLELEID: 67890, Variant_g: "17:7577538-7577538 C>T" },
      {
        href: "https://www.ncbi.nlm.nih.gov/clinvar/?term=12345[alleleid]",
        kind: "allele",
        targetLabel: "allele 12345",
      },
    ],
    [
      "record allele ID fallback",
      { class: "benign", desc: "Benign" },
      { ALLELEID: 67890 },
      {
        href: "https://www.ncbi.nlm.nih.gov/clinvar/?term=67890[alleleid]",
        kind: "allele",
        targetLabel: "allele 67890",
      },
    ],
    [
      "exact genomic fallback",
      { class: "na", desc: "Conflicting pathogenicity" },
      { Variant_g: "17:7577538-7577538 C>T" },
      {
        href:
          "https://www.ncbi.nlm.nih.gov/clinvar/?term=17%3A7577538%3AC%3AT(GRCh37)",
        kind: "variant",
        targetLabel: "17:7577538-7577538 C>T",
      },
    ],
    [
      "HGVS fallback",
      { class: "pathogenic", desc: "Pathogenic" },
      { gene: "TP53", Variant: "p.Arg248Gln / c.743G>A" },
      {
        href:
          "https://www.ncbi.nlm.nih.gov/clinvar/?term=TP53%20c.743G%3EA",
        kind: "variant",
        targetLabel: "variant",
      },
    ],
    [
      "gene fallback",
      { class: "benign", desc: "Benign" },
      { gene: "SDHA" },
      {
        href: "https://www.ncbi.nlm.nih.gov/clinvar/?term=SDHA",
        kind: "variant",
        targetLabel: "variant",
      },
    ],
    [
      "Not in ClinVar",
      { class: "na", desc: "Not in ClinVar", ALLELEID: 12345 },
      { Variant_g: "17:7577538-7577538 C>T" },
      null,
    ],
    [
      "empty annotation",
      {},
      { ALLELEID: 12345, Variant_g: "17:7577538-7577538 C>T" },
      null,
    ],
    [
      "represented annotation without a target",
      { class: "na", desc: "Conflicting pathogenicity" },
      {},
      null,
    ],
  ])("decides %s", (_case, annotation, record, expected) => {
    expect(getClinvarLinkModel(annotation, record)).toEqual(expected);
  });
});
