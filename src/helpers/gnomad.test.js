/** @jest-environment node */

import { getGnomadVariant, getGnomadVariantUrl } from "./gnomad";

describe("gnomAD variant links", () => {
  test.each([
    [
      "1:3329058-3329058 G>T",
      {
        chromosome: "1",
        position: "3329058",
        referenceAllele: "G",
        alternateAllele: "T",
      },
    ],
    [
      "chrX:123-124 ac>a",
      {
        chromosome: "X",
        position: "123",
        referenceAllele: "AC",
        alternateAllele: "A",
      },
    ],
  ])("reads the gnomAD variant from %s", (variantG, expected) => {
    expect(getGnomadVariant({ Variant_g: variantG })).toEqual(expected);
  });

  test("builds the gnomAD 2.1 variant URL", () => {
    expect(
      getGnomadVariantUrl({ Variant_g: "1:3329058-3329058 G>T" }),
    ).toBe(
      "https://gnomad.broadinstitute.org/variant/1-3329058-G-T?dataset=gnomad_r2_1",
    );
  });

  test.each([
    null,
    {},
    { Variant_g: null },
    { Variant_g: "" },
    { Variant_g: "1:100-100" },
    { Variant_g: "1:100-100 G>" },
    { Variant_g: "1:100-100 G>T extra" },
  ])("does not link a record without a valid genomic variant", (record) => {
    expect(getGnomadVariant(record)).toBeNull();
    expect(getGnomadVariantUrl(record)).toBeNull();
  });
});
