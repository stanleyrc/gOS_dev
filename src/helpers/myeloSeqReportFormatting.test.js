/** @jest-environment node */
import {
  formatMyeloSeqVariant,
  formatMyeloSeqFindingVariant,
  formatMyeloSeqVariantType,
  formatMyeloSeqVaf,
  formatMyeloSeqDepth,
  getMyeloSeqVariantType,
  getMyeloSeqInsertionSize,
  isMyeloSeqFusion,
} from "./myeloSeqReportFormatting";

describe("MyeloSeq variant types and insertion sizes", () => {
  it.each(["snv", "indel", "fusion", "flt3itd"])("uses supplied %s rather than consequence labels", (variant_type) => {
    expect(getMyeloSeqVariantType({ variant_type, type: "Missense" })).toBe(variant_type.toUpperCase());
  });

  it("supports legacy types but treats the supplied type as authoritative", () => {
    expect(getMyeloSeqVariantType({ type: "Fusion" })).toBe("FUSION");
    expect(getMyeloSeqVariantType({ variant_type: "  indel  " })).toBe("INDEL");
    expect(getMyeloSeqVariantType({})).toBe("");
    expect(isMyeloSeqFusion({ variant_type: "fusion", type: "Other" })).toBe(true);
    expect(isMyeloSeqFusion({ eventType: "fusion" })).toBe(true);
    expect(isMyeloSeqFusion({ variant_type: "snv", eventType: "fusion" })).toBe(false);
  });

  it.each([
    ["c.1740_1793dupGGTGAC", 54],
    ["p.Glu598_Tyr599insValThrGly / c.1740_1793*", undefined],
    ["c.1740_1740dupA", 1],
    ["c.1793_1740dupA", undefined],
    ["c.0_10dupA", undefined],
    ["c.1740+1_1793dupA", undefined],
    ["c.1740_1793+1dupA", undefined],
    ["c.1740_9007199254740992dupA", undefined],
    ["p.Glu598_Tyr599insValThrGly", undefined],
    [undefined, undefined],
  ])("computes the inclusive c. range for %s", (variant, expected) => {
    expect(getMyeloSeqInsertionSize({ gene: "FLT3", variant_type: "indel", variant })).toBe(expected);
  });

  it("uses source Variant and never calculates sizes for other types", () => {
    expect(getMyeloSeqInsertionSize({ gene: "FLT3", variant_type: "INDEL", sourceVariant: "c.1740_1793dupA", variant: "p.only" })).toBe(54);
    expect(getMyeloSeqInsertionSize({ gene: "FLT3", variant_type: "FLT3ITD", Variant: "c.1740_1793dupA" })).toBe(54);
    expect(getMyeloSeqInsertionSize({ gene: "CALR", variant_type: "INDEL", variant: "c.1740_1793dupA" })).toBeUndefined();
  });
});

describe("FLT3 INDEL duplication display", () => {
  const coding = "c.1740_1793dupGGTGACCGGCTCCTCAGATAATGAGTACTTCTACGTTGATTTCAGAGAATATGA";
  const protein = "p.Glu598_Tyr599insValThrGlySerSerAspAsnGluTyrPheTyrValAspPheArgGluTyrGlu";
  const finding = { gene: "FLT3", variant_type: "INDEL", variant: `${protein} / ${coding}` };

  it("matches protein duplication to the coding range and labels the type exactly", () => {
    expect(formatMyeloSeqFindingVariant(finding)).toBe("c.1740_1793dup, p.V581_E598dup");
    expect(formatMyeloSeqVariantType(finding)).toBe("INDEL 54(bp)");
    expect(finding.variant).toBe(`${protein} / ${coding}`);
    expect(formatMyeloSeqFindingVariant({ ...finding, sourceVariant: finding.variant, variant: "p.only" }))
      .toBe("c.1740_1793dup, p.V581_E598dup");
  });

  it("shortens existing matching dup annotations and supports legacy FLT3ITD", () => {
    const dup = { ...finding, variant_type: "FLT3ITD", variant: `${coding} / p.Val581_Glu598dupVTGSSDNEYFYVDFREYE` };
    expect(formatMyeloSeqFindingVariant(dup)).toBe("c.1740_1793dup, p.V581_E598dup");
    expect(formatMyeloSeqVariantType(dup)).toBe("INDEL 54(bp)");
    expect(formatMyeloSeqFindingVariant({ ...finding, variant: "c.1740_1742dupGAA / p.Glu581_Tyr582insGlu" }))
      .toBe("c.1740_1742dup, p.E581dup");
    expect(formatMyeloSeqFindingVariant({ ...finding, variant: coding })).toBe("c.1740_1793dup");
  });

  it.each([
    { gene: "CALR" }, { gene: "ASXL1" }, { variant_type: "SNV" },
  ])("does not shorten or reconcile unrelated findings: %j", (override) => {
    expect(formatMyeloSeqFindingVariant({ ...finding, ...override }))
      .toBe(`${coding}, p.E598_Y599insVTGSSDNEYFYVDFREYE`);
    expect(formatMyeloSeqVariantType({ ...finding, ...override })).toBe(override.variant_type || "INDEL");
  });

  it.each([
    "c.1740_1793del / p.Glu598_Tyr599insValGlu",
    "c.1740_1793insA / p.Glu598_Tyr599insValGlu",
    "c.1740_1793dupA / p.E598_Y599insVTGSSDNEYFYVDFREYE",
    "c.1740_1793dup / p.E598_Y599insVTG",
    "c.1740_1792dup / p.E598_Y599insVTGSSDNEYFYVDFREYE",
    "c.1740_1793dup / p.E597_Y598insVTGSSDNEYFYVDFREYE",
    "c.1740_1793dup / p.E598_Y600insVTGSSDNEYFYVDFREYE",
    "c.1740_1793dup / p.E598_Y599insVTGSSDNEYFYVDFREYA",
    "c.1740_1793dup / p.V580_E598dup",
    "c.1740_1793dup / p.unknown",
  ])("preserves unsupported or inconsistent annotations: %s", (variant) => {
    expect(formatMyeloSeqFindingVariant({ ...finding, variant })).toBe(formatMyeloSeqVariant(variant));
  });

  it("does not infer a size for FLT3 deletions or missing coding ranges", () => {
    expect(formatMyeloSeqVariantType({ ...finding, variant: "c.1740_1793del" })).toBe("INDEL");
    expect(formatMyeloSeqVariantType({ ...finding, variant: "p.only" })).toBe("INDEL");
  });
});

describe("formatMyeloSeqDepth", () => {
  it.each([
    [2753, "2753"], [2586, "2586"], ["2000", "2000"], [0, "0"],
    [2000.7, "2001"], [1000000, "1000000"],
    [undefined, ""], [null, ""], ["", ""], ["  ", ""], ["invalid", ""], [Infinity, ""],
  ])("formats %s without grouping separators", (value, expected) => {
    expect(formatMyeloSeqDepth(value)).toBe(expected);
  });
});

describe("formatMyeloSeqVaf", () => {
  it.each([
    [0.4894, "48.94"], [0.046, "4.60"], [0.477, "47.70"],
    [49.95, "49.95"], ["0.081", "8.10"], [0, "0.00"], [1, "100.00"],
    [undefined, ""], [null, ""], ["", ""], ["  ", ""], ["invalid", ""], [Infinity, ""],
  ])("formats %s with two decimal places", (value, expected) => {
    expect(formatMyeloSeqVaf(value)).toBe(expected);
  });
});

describe("formatMyeloSeqVariant", () => {
  it.each([
    ["p.Asp835Tyr / c.2503G>T", "c.2503G>T, p.D835Y"],
    ["p.Lys385AsnfsTer47", "p.K385Nfs*47"],
    ["p.Gln548Ter", "p.Q548*"],
    ["p.(Arg175His)", "p.(R175H)"],
    ["p.Val581_Glu598dup", "p.V581_E598dup"],
    ["p.Ala1_Cys2delinsAspGluPheGlyHisIleLysLeuMetAsnProGlnArgSerThrValTrpTyr", "p.A1_C2delinsDEFGHIKLMNPQRSTVWY"],
    ["p.Sec1Pyl", "p.U1O"],
    ["c.123del", "c.123del"],
    ["p.V617F / c.1849G>T", "c.1849G>T, p.V617F"],
    ["c.1849G>T / p.V617F", "c.1849G>T, p.V617F"],
    ["p.V617F,c.1849G>T", "c.1849G>T, p.V617F"],
    ["c.1849G>T, p.V617F", "c.1849G>T, p.V617F"],
    ["p.K385Nfs*47 / c.1154_1155insTTGTC", "c.1154_1155insTTGTC, p.K385Nfs*47"],
    ["c.1740_1793dupGGTGACCGGCTCCTCAGATAATGAGTACTTCTACGTTGATTTCAGAGAATATGA / p.Glu598_Tyr599insValThrGly", "c.1740_1793dupGGTGACCGGCTCCTCAGATAATGAGTACTTCTACGTTGATTTCAGAGAATATGA, p.E598_Y599insVTG"],
    [" p.R175H ", "p.R175H"],
    ["c.119C>T", "c.119C>T"],
    ["BCR(14)::ABL1(2)", "BCR(14)::ABL1(2)"],
    ["unrecognized / annotation", "unrecognized / annotation"],
    [undefined, ""],
    [null, ""],
    ["", ""],
  ])("formats %s without losing annotation text", (value, expected) => {
    expect(formatMyeloSeqVariant(value)).toBe(expected);
  });
});
