import { cnRowQc, eventClass, eventLabel, medianMad, oncoprintMatrix, robustOutliers, shannonDiversity, snvCategoryCounts } from "./cohortStats";

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

  it("classifies and labels gGnome complex SVs", () => {
    const cx = { type: "Complex SV", vartype: "rDel", Variant: "rDel (7,12)", gene: "" };
    expect(eventClass(cx)).toBe("complex");
    expect(eventClass({ type: "Complex SV", vartype: "Chromothripsis" })).toBe("complex");
    expect(eventLabel(cx)).toBe("rDel (7,12)");
    expect(eventLabel({ gene: "EGFR", vartype: "AMP", type: "SCNA" })).toBe("EGFR");
    const m = oncoprintMatrix({ P1: [{ ...cx, cell_fraction: 0.4, n_cells: 40 }] });
    expect(m.genes.map((g) => g.gene)).toEqual(["rDel (7,12)"]);
    expect(m.genes[0].cells.P1.class).toBe("complex");
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

describe("oncoprintEventFilter", () => {
  const { oncoprintEventFilter } = require("./cohortStats");
  it("keeps only the chosen classes and applies the base filter", () => {
    const amp = { gene: "G1", type: "SCNA", Variant: "AMP", Tier: 2 };
    const fus = { gene: "G2::G3", fusion_genes: "G2::G3", type: "Fusion", Tier: 2 };
    const cls = (e) => eventClass(e);
    expect(oncoprintEventFilter()).toBeNull();
    const onlyAmp = oncoprintEventFilter({ classes: [cls(amp)] });
    expect(onlyAmp(amp)).toBe(true);
    expect(onlyAmp(fus)).toBe(false);
    const none = oncoprintEventFilter({ base: () => false, classes: [cls(amp)] });
    expect(none(amp)).toBe(false);
  });
});

describe("damaging tier-3 missense", () => {
  const { isDamagingMissense, passesTier } = require("./cohortStats");
  const dmg = { Tier: "3", type: "Missense", driver_evidence: "SIFT deleterious (0.01); PolyPhen probably damaging (0.99)" };
  const half = { Tier: "3", type: "Missense", driver_evidence: "SIFT deleterious (0.01); PolyPhen benign (0.1)" };
  const t2 = { Tier: "2", type: "SCNA" };
  it("needs both SIFT and PolyPhen damaging on a tier-3 missense", () => {
    expect(isDamagingMissense(dmg)).toBe(true);
    expect(isDamagingMissense(half)).toBe(false);
    expect(isDamagingMissense({ ...dmg, Tier: "2" })).toBe(false);
    expect(isDamagingMissense({ ...dmg, type: "Splice" })).toBe(false);
  });
  it("tier option 2d keeps tiers 1-2 and damaging tier-3 missense", () => {
    expect([dmg, half, t2].map((e) => passesTier(e, "2d"))).toEqual([true, false, true]);
    expect([dmg, half, t2].map((e) => passesTier(e, 2))).toEqual([false, false, true]);
    expect(passesTier(half, 3)).toBe(true);
  });
});

describe("oncoprint row notes", () => {
  const { oncoprintRowNote, oncoprintRole } = require("./cohortStats");
  it("explains complex labels and leaves genes alone", () => {
    expect(oncoprintRowNote("DM (7)")).toMatch(/double minute.*chromosome\(s\) 7/);
    expect(oncoprintRowNote("TIC (6,8)")).toMatch(/templated insertion chain/);
    expect(oncoprintRowNote("GENEA")).toBeNull();
  });
  it("picks the most common role", () => {
    const cells = { P1: { all: [{ event: { role: "Oncogene" } }] }, P2: { all: [{ event: { role: "Oncogene" } }, { event: { role: "None" } }] } };
    expect(oncoprintRole(cells)).toBe("Oncogene");
    expect(oncoprintRole({})).toBeNull();
  });
});

describe("groupOncoprintRows", () => {
  const { groupOncoprintRows } = require("./cohortStats");
  it("groups by role with headers and keeps order within groups", () => {
    const genes = [
      { gene: "GA", cells: { P1: { all: [{ event: { role: "Oncogene" } }] } } },
      { gene: "GB", cells: { P1: { all: [{ event: { role: "Tumor Suppressor" } }] } } },
      { gene: "DM (7)", cells: {} },
      { gene: "GC", cells: { P1: { all: [{ event: { role: "Oncogene" } }] } } },
      { gene: "GD", cells: {} },
    ];
    const rows = groupOncoprintRows(genes, "role");
    expect(rows.map((r) => r.header || r.gene.gene)).toEqual(["Oncogenes", "GA", "GC", "Tumour suppressors", "GB", "Structural / ecDNA events", "DM (7)", "Other / unannotated", "GD"]);
    expect(groupOncoprintRows(genes, "none")).toHaveLength(5);
  });
});

describe("tierOf", () => {
  const { tierOf, passesTier } = require("./cohortStats");
  it("null / None / NA / '' are no tier, not tier 0", () => {
    expect([null, undefined, "", "None", "NA"].map((t) => tierOf({ Tier: t }))).toEqual([null, null, null, null, null]);
    expect(tierOf({ Tier: "1" })).toBe(1);
    expect(tierOf({ tier: 3 })).toBe(3);
  });
  it("an untiered complex event is not tier <= 2 but is not dropped by the tier filter", () => {
    expect(passesTier({ Tier: null, type: "Complex SV" }, 2)).toBe(true);
    expect(passesTier({ Tier: 3, type: "Missense" }, 2)).toBe(false);
  });
});
