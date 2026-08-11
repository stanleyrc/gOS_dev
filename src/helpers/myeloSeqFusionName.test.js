/** @jest-environment node */

import { getMyeloSeqFusionName } from "./myeloSeqFusionName";

describe("getMyeloSeqFusionName", () => {
  it("prefixes a descriptive fusion Variant with its gene identity", () => {
    expect(
      getMyeloSeqFusionName({
        gene: "RUNX1::RUNX1T1",
        variant: "In-Frame Fusion Exon 3::Exon 3",
      }),
    ).toBe("RUNX1::RUNX1T1 In-Frame Fusion Exon 3::Exon 3");
  });

  it("does not duplicate genes already named by the Variant", () => {
    expect(
      getMyeloSeqFusionName({
        gene: "BCR::ABL1",
        variant: "BCR(14)::ABL1(2)",
      }),
    ).toBe("BCR(14)::ABL1(2)");
  });

  it("supports fusion_genes and prevents Fusion from matching the FUS gene", () => {
    expect(
      getMyeloSeqFusionName({
        gene: "",
        fusion_genes: "FUS::CREB3L2",
        Variant: "In-Frame Fusion Exon 6::Exon 5",
      }),
    ).toBe("FUS::CREB3L2 In-Frame Fusion Exon 6::Exon 5");
  });

  it("falls back when only one identity source is available", () => {
    expect(
      getMyeloSeqFusionName({ variant: "Legacy Fusion Exon 1::Exon 2" }),
    ).toBe("Legacy Fusion Exon 1::Exon 2");
    expect(getMyeloSeqFusionName({ gene: "PML::RARA" })).toBe("PML::RARA");
    expect(getMyeloSeqFusionName({})).toBeUndefined();
  });
});
