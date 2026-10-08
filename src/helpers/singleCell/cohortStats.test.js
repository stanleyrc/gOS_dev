import { cnRowQc, eventClass, medianMad, oncoprintMatrix, robustOutliers, shannonDiversity, snvCategoryCounts } from "./cohortStats";

describe("cohort statistics", () => {
  it("counts SNV categories among CellPhy-input sites", () => {
    const v = [
      { category: "truncal", cellphy_input: true },
      { category: "truncal", cellphy_input: false },
      { category: "private", cellphy_input: true },
      { cellphy_input: true },
    ];
    expect(snvCategoryCounts(v)).toMatchObject({ truncal: 1, private: 1, unmapped: 1, subclonal: 0 });
    expect(snvCategoryCounts(v, { cellphyOnly: false }).truncal).toBe(2);
  });

  it("computes Shannon diversity without normals", () => {
    expect(shannonDiversity({ "Clone 1": 50, "Clone 2": 50, Normal: 10 })).toBeCloseTo(Math.log(2));
    expect(shannonDiversity({ "Clone 1": 10 })).toBe(0);
  });

  it("classifies events and builds the oncoprint", () => {
    expect(eventClass({ vartype: "AMP", type: "SCNA" })).toBe("amp");
    expect(eventClass({ vartype: "fusion", type: "Fusion" })).toBe("fusion");
    expect(eventClass({ vartype: "SNV", type: "Trunc" })).toBe("trunc");
    const m = oncoprintMatrix({
      P1: [
        { gene: "EGFR", vartype: "AMP", type: "SCNA", Tier: 1, cell_fraction: 0.95, n_cells: 120 },
        { gene: "EGFR", vartype: "SNV", type: "Missense", Tier: 2, cell_fraction: 0.2, n_cells: 20 },
        { gene: "LOW", vartype: "SNV", type: "Missense", Tier: 3, cell_fraction: 0.2, n_cells: 20 },
      ],
      P2: [{ gene: "CDK4", vartype: "AMP", type: "SCNA", Tier: 1, cell_fraction: 0.7, n_cells: 77 }],
    });
    expect(m.patients).toEqual(["P1", "P2"]);
    expect(m.genes.map((g) => g.gene)).toEqual(["EGFR", "CDK4"]);
    expect(m.genes[0].cells.P1.class).toBe("amp");
    expect(m.genes[0].cells.P1.all).toHaveLength(2);
  });

  it("flags robust outliers", () => {
    const v = [1, 1.1, 0.9, 1, 1.05, 0.95, 5];
    expect(robustOutliers(v)).toEqual([6]);
    expect(medianMad(v).median).toBe(1);
  });

  it("summarises a CN row", () => {
    const row = {
      binIndex: { n: 4, start: [0, 10, 20, 30], end: [10, 20, 30, 40], chromosome: ["1", "1", "1", "X"] },
      values: [2, 2, 4, 1],
    };
    const qc = cnRowQc(row);
    expect(qc.modalCn).toBe(2);
    expect(qc.fractionAltered).toBeCloseTo(0.5);
    expect(qc.segments).toBe(2);
    expect(qc.chrXMeanCn).toBe(1);
  });
});

describe("eventTooltipLines", () => {
  it("describes fusions and deletions", () => {
    const { eventTooltipLines } = require("./cohortStats");
    expect(eventTooltipLines({ Tier: "1", vartype: "outframe_fusion", fusion_gene_coords: "12:1-2+,12:5-6-", cells: "65/130", cell_fraction: "0.5" })).toEqual(["Tier 1", "out-of-frame fusion", "breakpoints 12:1-2+,12:5-6-", "65/130 cells (50%)"]);
    expect(eventTooltipLines({ Tier: "1", vartype: "HOMDEL", Genome_Location: "17:1-2", role: "Tumor Suppressor", effect: "None", estimated_altered_copies: "2" })).toEqual(["Tier 1", "homozygous deletion", "17:1-2", "Tumor Suppressor", "2 altered copies"]);
    expect(eventTooltipLines({ vartype: "SNV", Variant: "p.R132H", Variant_g: "2:1-1 G>A" })).toEqual(["SNV p.R132H", "2:1-1 G>A"]);
  });
});
