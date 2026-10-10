import { cohortHeadline, ecdnaPrevalence, ecdnaWalks, recurrentDrivers } from "./cohortHeadline";

const drv = (gene, cls, clonality, fraction = clonality === "clonal" ? 0.95 : 0.4) => ({ gene, class: cls, clonality, fraction, label: `${gene} ${cls}` });
const report = (clonal = [], subclonal = []) => ({ clonal, subclonal });
const walk = (genes, extra = {}) => ({ circular: true, ncells: 10, median_cn: 8, driver_genes: genes, ...extra });

describe("ecdnaWalks", () => {
  it("keeps circular walks with enough cells and copies", () => {
    const file = { walks: [walk("EGFR"), walk("MYC", { circular: false }), walk("CDK4", { ncells: 2 }), walk("MDM2", { median_cn: 3 })] };
    expect(ecdnaWalks(file).map((w) => w.driver_genes)).toEqual(["EGFR"]);
    expect(ecdnaWalks(null)).toEqual([]);
  });
});

describe("recurrentDrivers", () => {
  it("counts gene+class across patients, split truncal / subclonal", () => {
    const patients = [
      { id: "A", report: report([drv("EGFR", "amp", "clonal")], [drv("CDK4", "amp", "subclonal")]) },
      { id: "B", report: report([drv("EGFR", "amp", "clonal")]) },
      { id: "C", report: report([], [drv("EGFR", "amp", "subclonal"), drv("EGFR", "trunc", "subclonal")]) },
    ];
    const r = recurrentDrivers(patients);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ gene: "EGFR", class: "amp", truncal: ["A", "B"], subclonal: ["C"] });
  });
  it("skips fusions and complex SVs", () => {
    const patients = ["A", "B"].map((id) => ({ id, report: report([drv("X::Y", "fusion", "clonal")]) }));
    expect(recurrentDrivers(patients)).toEqual([]);
  });
});

describe("ecdnaPrevalence", () => {
  it("counts carriers among patients with walks", () => {
    const ec = ecdnaPrevalence([
      { id: "A", walks: { walks: [walk("EGFR"), walk("EGFR,CDK4")] } },
      { id: "B", walks: { walks: [walk("EGFR", { circular: false })] } },
      { id: "C", walks: null },
    ]);
    expect(ec.carriers).toEqual(["A"]);
    expect(ec.nAssessed).toBe(2);
    expect(ec.nSpecies).toBe(2);
    expect(ec.oncogenes.map((g) => g.gene)).toEqual(["CDK4", "EGFR"]);
  });
});

describe("cohortHeadline", () => {
  const patients = [
    { id: "A", report: report([drv("CDKN2A", "homdel", "clonal"), drv("EGFR", "amp", "clonal")]), walks: { walks: [walk("EGFR")] } },
    { id: "B", report: report([drv("CDKN2A", "homdel", "clonal"), drv("EGFR", "amp", "clonal")], [drv("PTEN", "homdel", "subclonal")]), walks: { walks: [walk("EGFR")] } },
    { id: "C", report: report([drv("CDKN2A", "homdel", "clonal")], [drv("EGFR", "amp", "subclonal")]), walks: { walks: [] } },
    { id: "D", report: report([], [drv("EGFR", "amp", "subclonal")]), walks: null },
  ];
  const h = cohortHeadline(patients);

  it("leads with shared truncal drivers, most shared first", () => {
    expect(h.map((x) => x.key)).toEqual(["drivers", "ecdna", "subclonal"]);
    expect(h[0].title).toBe("Shared truncal drivers: CDKN2A deletion (3 tumors) and EGFR amplification (2 tumors)");
    expect(h[0]).toMatchObject({ value: 3, total: 4, view: "drivers" });
    expect(h[0].detail).toContain("EGFR amplification is subclonal in 2 more (C, D)");
    expect(h[0].detail).toContain("3 of 4 tumors have at least one truncal driver");
  });
  it("states ecDNA prevalence among reconstructed tumors", () => {
    expect(h[1]).toMatchObject({ value: 2, total: 3, patients: ["A", "B"], view: "amplicons" });
    expect(h[1].title).toBe("2 of 3 reconstructed tumors carry ecDNA: 2 circular amplicons");
    expect(h[1].detail).toBe("Recurrent oncogenes on ecDNA: EGFR (2). Not reconstructed: D");
  });
  it("counts tumors with subclonal drivers", () => {
    expect(h[2]).toMatchObject({ value: 3, total: 4 });
    expect(h[2].title).toBe("3 of 4 tumors carry subclonal drivers: 3 alterations in only part of the tumor");
  });
  it("is empty without patients and skips findings without data", () => {
    expect(cohortHeadline([])).toEqual([]);
    expect(cohortHeadline([{ id: "A", report: report(), walks: null }]).map((x) => x.key)).toEqual([]);
  });
});
