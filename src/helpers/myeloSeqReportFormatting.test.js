/** @jest-environment node */
import { formatMyeloSeqVariant } from "./myeloSeqReportFormatting";

describe("formatMyeloSeqVariant", () => {
  it.each([
    ["p.V617F / c.1849G>T", "c.1849G>T, p.V617F"],
    ["c.1849G>T / p.V617F", "c.1849G>T, p.V617F"],
    ["p.V617F,c.1849G>T", "c.1849G>T, p.V617F"],
    ["c.1849G>T, p.V617F", "c.1849G>T, p.V617F"],
    ["p.K385Nfs*47 / c.1154_1155insTTGTC", "c.1154_1155insTTGTC, p.K385Nfs*47"],
    ["c.1740_1793dupGGTGACCGGCTCCTCAGATAATGAGTACTTCTACGTTGATTTCAGAGAATATGA / p.Glu598_Tyr599insValThrGly", "c.1740_1793dupGGTGACCGGCTCCTCAGATAATGAGTACTTCTACGTTGATTTCAGAGAATATGA, p.Glu598_Tyr599insValThrGly"],
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
