import { DEFAULT_ONCOPRINT, cohortEntries, drvOpenParams, geneChoices, oncoprintGrid, selectCohortEntries, sortColumns, sortColumnsMemo } from "./cohortOncoprint";

const ev = (o) => ({ seqnames: "7", start: "100", end: "200", Genome_Location: "7:100-200", n_cells: "10", cells: "10/20", cell_fraction: "0.5", ...o });
const A = [
  ev({ gene: "EGFR", vartype: "AMP", type: "SCNA", Tier: 1, role: "Oncogene", cell_fraction: "0.98", n_cells: "20", cells: "20/20" }),
  ev({ gene: "TP53", vartype: "SNV", type: "Missense", Variant: "p.R175H", Tier: 1, seqnames: "17", Genome_Location: "17:7-7", cell_fraction: "0.4" }),
  ev({ gene: "ZZZ3", vartype: "SNV", type: "Missense", Tier: 3, Genome_Location: "3:50-50", cell_fraction: "0.9" }),
  ev({ gene: "C::D", fusion_genes: "upstream of C::D", vartype: "fusion", type: "Fusion", Tier: 1, role: "Oncogene", upstream_only: true, Genome_Location: "1:1-2" }),
];
const B = [
  ev({ gene: "TP53", vartype: "SNV", type: "Missense", Variant: "p.R248Q", Tier: 1, seqnames: "17", Genome_Location: "17:9-9", cell_fraction: "0.7" }),
  ev({ gene: "PTEN", vartype: "HOMDEL", type: "SCNA", Tier: 2, role: "Tumor Suppressor", Genome_Location: "10:1-5", cell_fraction: "0.3" }),
  ev({ gene: "", vartype: "DM", type: "Complex SV", Genome_Location: "12:1-9", cell_fraction: "0.6", n_cells: "12" }),
];
const C = [ev({ gene: "EGFR", vartype: "AMP", type: "SCNA", Tier: 1, role: "Oncogene", cell_fraction: "0.2" })];
const byP = () => ({ A: cohortEntries(A), B: cohortEntries(B), C: cohortEntries(C) });

describe("cohortEntries", () => {
  it("takes the fraction from the event and flags clonality", () => {
    const e = cohortEntries(A);
    expect(e.find((d) => d.genes[0] === "EGFR").fraction).toBeCloseTo(0.98);
    expect(e.find((d) => d.genes[0] === "EGFR").subclonal).toBe(false);
    expect(e.find((d) => d.genes[0] === "TP53").subclonal).toBe(true);
  });
});

describe("selectCohortEntries", () => {
  it("recommended = tier 1-2 cancer genes, no upstream-only fusion", () => {
    const keys = selectCohortEntries(cohortEntries(A)).map((d) => d.genes[0]).sort();
    expect(keys).toEqual(["EGFR", "TP53"]);
  });
  it("all includes the upstream-only fusion and tier 3", () => {
    expect(selectCohortEntries(cohortEntries(A), { ...DEFAULT_ONCOPRINT, preset: "all" })).toHaveLength(4);
  });
  it("filters by class, tier and fraction", () => {
    const e = cohortEntries(A);
    expect(selectCohortEntries(e, { preset: "all", classes: ["amp"] }).map((d) => d.genes[0])).toEqual(["EGFR"]);
    expect(selectCohortEntries(e, { preset: "all", tiers: [3] }).map((d) => d.genes[0])).toEqual(["ZZZ3"]);
    expect(selectCohortEntries(e, { preset: "all", minFraction: 0.9 }).map((d) => d.genes[0]).sort()).toEqual(["EGFR", "ZZZ3"]);
  });
  it("adds and removes genes", () => {
    const e = cohortEntries(A);
    expect(selectCohortEntries(e, { addGenes: ["zzz3"] }).map((d) => d.genes[0])).toContain("ZZZ3");
    expect(selectCohortEntries(e, { removeGenes: ["TP53"] }).map((d) => d.genes[0])).toEqual(["EGFR"]);
  });
  it("gbm preset keeps GBM genes only", () => {
    expect(selectCohortEntries(cohortEntries(A), { preset: "gbm" }).map((d) => d.genes[0]).sort()).toEqual(["EGFR", "TP53"]);
  });
  it("never adds an upstream-only fusion by gene name", () => {
    expect(selectCohortEntries(cohortEntries(A), { addGenes: ["C"] }).some((d) => d.upstreamOnly)).toBe(false);
  });
});

describe("oncoprintGrid and sorting", () => {
  it("groups by gene, rows by frequency, DM row labelled by chromosome", () => {
    const g = oncoprintGrid(byP());
    expect(g.rows.map((r) => r.gene)[0]).toMatch(/EGFR|TP53/);
    expect(g.rows.find((r) => r.gene === "TP53").nPatients).toBe(2);
    expect(g.rows.find((r) => /DM/.test(r.gene)).cells.B.best.cls).toBe("complex");
    expect(g.rows.find((r) => r.gene === "EGFR").cells.A.clonal).toBe(true);
    expect(g.rows.find((r) => r.gene === "EGFR").cells.C.clonal).toBe(false);
  });
  it("memo sort puts patients altered in the top row first, mutual exclusivity visible", () => {
    const rows = [
      { gene: "g1", cells: { P3: { fraction: 0.9 }, P1: { fraction: 0.2 } } },
      { gene: "g2", cells: { P2: { fraction: 0.5 } } },
    ];
    expect(sortColumnsMemo(rows, ["P1", "P2", "P3", "P4"])).toEqual(["P3", "P1", "P2", "P4"]);
  });
  it("other column modes", () => {
    const g = oncoprintGrid(byP());
    expect(sortColumns(g, "name")).toEqual(["A", "B", "C"]);
    expect(sortColumns(g, "burden")[2]).toBe("C");
  });
  it("geneChoices counts patients", () => {
    expect(geneChoices(byP()).find((x) => x.gene === "TP53").nPatients).toBe(2);
  });
});

describe("drvOpenParams", () => {
  it("opens the Single-Cell tab on the Drivers layer at the event", () => {
    const [d] = cohortEntries(A);
    expect(drvOpenParams("A", d)).toMatchObject({ report: "A", tab: "7", heatmap: "drivers", drvopen: d.key });
  });
});
