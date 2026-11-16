import { TIGHT_HEADER, tightGenesBudget } from "./genomeHeader";

describe("tightGenesBudget", () => {
  it("gives the default navigation height minus strip, controls and ideogram to the genes", () => {
    expect(tightGenesBudget({ plotHeight: 240 })).toBe(240 - TIGHT_HEADER.strip - TIGHT_HEADER.controls - TIGHT_HEADER.cytobands);
    expect(tightGenesBudget({})).toBe(tightGenesBudget({ plotHeight: 240 }));
  });
  it("grows with the user's navigation height", () => {
    expect(tightGenesBudget({ plotHeight: 400 })).toBeGreaterThan(tightGenesBudget({ plotHeight: 240 }));
  });
  it("never drops below one labelled row", () => {
    expect(tightGenesBudget({ plotHeight: 140 })).toBe(TIGHT_HEADER.minGenes);
  });
  it("uses the small pinned budget while compact", () => {
    expect(tightGenesBudget({ plotHeight: 600, compact: true })).toBe(TIGHT_HEADER.pinnedGenes);
  });
  it("keeps the ideogram band inside its strip", () => {
    const [lo, hi] = TIGHT_HEADER.cytobandsYExtent;
    expect(lo).toBeLessThan(0);
    expect(hi).toBeGreaterThan(1);
    expect(TIGHT_HEADER.cytobands / (hi - lo)).toBeGreaterThanOrEqual(20); // band >= 20 px tall
  });
});
