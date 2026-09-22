/** @jest-environment node */

import {
  getMyeloSeqFusionGeneExons,
  getMyeloSeqFusionName,
} from "./myeloSeqFusionName";

describe("getMyeloSeqFusionGeneExons", () => {
  const fusion = { gene: "EWSR1::FLI1", variant: "In-Frame Fusion Exon 7::Exon 6" };
  const identity = "EWSR1(NM_013986.4:exon 7) :: FLI1(NM_002017.5:exon 6)";

  it.each(["transcript", "Transcript", "transcript_id"])("uses supplied partner IDs from %s", (field) => {
    const finding = { ...fusion, [field]: " NM_013986.4 :: NM_002017.5 " };
    const before = JSON.stringify(finding);
    expect(getMyeloSeqFusionGeneExons(finding)).toBe(identity);
    expect(JSON.stringify(finding)).toBe(before);
  });

  it("supports an ordered pair of transcript IDs and an existing short identity", () => {
    expect(getMyeloSeqFusionGeneExons({
      ...fusion, variant: "EWSR1(7)::FLI1(6)", transcript: ["NM_013986.4", "NM_002017.5"],
    })).toBe(identity);
  });

  it.each([undefined, null, "", " ", [], [null, " "], "::", "NM_013986.4", ["NM_013986.4"], "NM_013986.4::NM_002017.5::NM_000001.1"])(
    "keeps the original format for missing or unpaired transcripts: %j", (transcript) => {
      expect(getMyeloSeqFusionGeneExons({ ...fusion, transcript })).toBe("EWSR1(7)::FLI1(6)");
    },
  );

  it("retains only the supplied transcript when one explicit partner slot is empty", () => {
    expect(getMyeloSeqFusionGeneExons({ ...fusion, transcript: ["NM_013986.4", null] }))
      .toBe("EWSR1(NM_013986.4:exon 7) :: FLI1(6)");
    expect(getMyeloSeqFusionGeneExons({ ...fusion, transcript: "::NM_002017.5" }))
      .toBe("EWSR1(7) :: FLI1(NM_002017.5:exon 6)");
  });

  it.each(["gene", "variant"])("retains a transcript identity already supplied in %s", (field) => {
    expect(getMyeloSeqFusionGeneExons({ [field]: identity })).toBe(identity);
  });

  it("keeps explicit inline transcript pairing rather than replacing it", () => {
    expect(getMyeloSeqFusionGeneExons({ ...fusion, variant: identity, transcript: "NM_000001.1::NM_000002.2" }))
      .toBe(identity);
  });

  it("retains gene-field transcript IDs when Variant is a short formatted identity", () => {
    expect(getMyeloSeqFusionGeneExons({ gene: identity, variant: "EWSR1(7)::FLI1(6)" })).toBe(identity);
  });

  it("pairs separate IDs by source gene even if the formatted variant is reversed", () => {
    expect(getMyeloSeqFusionGeneExons({
      ...fusion, variant: "FLI1(6)::EWSR1(7)", transcript: "NM_013986.4::NM_002017.5",
    })).toBe("FLI1(NM_002017.5:exon 6) :: EWSR1(NM_013986.4:exon 7)");
  });

  it("does not assign transcripts to contradictory genes or invent missing exons", () => {
    expect(getMyeloSeqFusionGeneExons({
      ...fusion, variant: "BCR(14)::ABL1(2)", transcript: "NM_013986.4::NM_002017.5",
    })).toBe("BCR(14)::ABL1(2)");
    expect(getMyeloSeqFusionGeneExons({ gene: "EWSR1::FLI1", transcript: "NM_013986.4::NM_002017.5" }))
      .toBe("EWSR1::FLI1");
  });

  it("preserves an existing GENE(EXON)::GENE(EXON) value", () => {
    expect(
      getMyeloSeqFusionGeneExons({
        gene: "BCR::ABL1",
        variant: "BCR(14)::ABL1(2)",
      }),
    ).toBe("BCR(14)::ABL1(2)");
  });

  it("combines fusion genes with exon numbers from a descriptive Variant", () => {
    expect(
      getMyeloSeqFusionGeneExons({
        gene: "RUNX1::RUNX1T1",
        variant: "In-Frame Fusion Exon 3::Exon 3",
      }),
    ).toBe("RUNX1(3)::RUNX1T1(3)");
    expect(
      getMyeloSeqFusionGeneExons({
        fusion_genes: "FUS::CREB3L2",
        Variant: "Out-of-Frame Fusion Exon 6 (p.526)::Exon 5 (p.174)",
      }),
    ).toBe("FUS(6)::CREB3L2(5)");
  });

  it("preserves the best available fusion identity when exons cannot be paired", () => {
    expect(
      getMyeloSeqFusionGeneExons({
        gene: "PML::RARA",
        variant: "Fusion breakpoints unavailable",
      }),
    ).toBe("PML::RARA Fusion breakpoints unavailable");
    expect(getMyeloSeqFusionGeneExons({})).toBeUndefined();
  });
});

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
