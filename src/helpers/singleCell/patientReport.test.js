import { buildPatientReport, cloneFractions, definingClones, eventLabel } from "./patientReport";

describe("patient report", () => {
  const cells = [
    ...Array.from({ length: 10 }, (_, i) => ({ cell_id: `a${i}`, clone_id: "Clone 1" })),
    ...Array.from({ length: 10 }, (_, i) => ({ cell_id: `b${i}`, clone_id: "Clone 2" })),
    { cell_id: "n1", clone_id: "Normal" },
  ];
  const ids = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(",");
  const events = [
    { gene: "EGFR", vartype: "AMP", type: "SCNA", Tier: "1", cell_fraction: "1", n_cells: "20", cells: "20/20", cell_ids: `${ids("a", 10)},${ids("b", 10)}` },
    { gene: "PTEN", vartype: "SNV", type: "Trunc", Variant: "p.R130*", Tier: "1", cell_fraction: "0.45", n_cells: "9", cells: "9/20", cell_ids: ids("b", 9) },
    { gene: "X::Y", fusion_genes: "X::Y", vartype: "fusion", type: "Fusion", Tier: "2", cell_fraction: "0.9", n_cells: "18", cells: "18/20", cell_ids: `${ids("a", 9)},${ids("b", 9)}` },
    { gene: "NOISE", vartype: "HOMDEL", type: "SCNA", Tier: "1", cell_fraction: "0.05", n_cells: "1", cells: "1/20", cell_ids: "a1" },
  ];

  it("labels events", () => {
    expect(eventLabel(events[0])).toBe("EGFR amplification");
    expect(eventLabel(events[1])).toBe("PTEN p.R130* (Trunc)");
  });

  it("finds clone-defining events", () => {
    const cloneOf = new Map(cells.map((c) => [c.cell_id, c.clone_id]));
    const f = cloneFractions(events[1], cloneOf, { "Clone 1": 10, "Clone 2": 10 });
    expect(f["Clone 2"].fraction).toBeCloseTo(0.9);
    expect(definingClones(f, 20)).toEqual(["Clone 2"]);
  });

  it("builds clonal / subclonal sections and caveats", () => {
    const r = buildPatientReport({ patient: "P", events, cells, variants: [{ category: "truncal", cellphy_input: true, driver: true }], signatures: null });
    expect(r.nTumorCells).toBe(20);
    expect(r.clonal.map((d) => d.gene)).toEqual(["EGFR", "X::Y"]);
    expect(r.subclonal.map((d) => d.gene)).toEqual(["PTEN"]);
    expect(r.clones.find((c) => c.clone === "Clone 2").defining.map((d) => d.gene)).toEqual(["PTEN"]);
    expect(r.caveats).toEqual(["fusions-unverified", "homdel-noise"]);
    expect(r.burden.truncal).toBe(1);
  });
});
