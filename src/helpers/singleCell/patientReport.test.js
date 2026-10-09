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
    expect(f["Clone 2"].p).toBeLessThan(0.01);
    expect(f["Clone 1"].p).toBeLessThan(0.01);
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
    expect(r.picked).toBe(false);
  });

  it("uses the Add-to-report selection when one is given, whatever the tier", () => {
    const has2 = { uid: "8:1-8:1", gene: "HAS2", vartype: "SNV", type: "Missense", Variant: "p.F44L", Tier: 3, cell_fraction: "0.95", n_cells: "19", cells: "19/20", cell_ids: ids("a", 10) };
    const all = [...events.map((e, i) => ({ ...e, uid: `u${i}` })), has2];
    const r = buildPatientReport({ patient: "P", events: all, cells, selectedUids: ["8:1-8:1", "u1"] });
    expect(r.picked).toBe(true);
    expect([...r.clonal, ...r.subclonal, ...r.rare].map((d) => d.gene).sort()).toEqual(["HAS2", "PTEN"]);
    // nothing ticked: back to the strong tier 1-2 events
    expect(buildPatientReport({ patient: "P", events: all, cells, selectedUids: [] }).clonal.map((d) => d.gene)).toEqual(["EGFR", "X::Y"]);
  });

  it("takes the re-tiered tier and lists Tier 3 likely drivers as candidates", () => {
    const akap = { gene: "AKAP3", vartype: "SNV", type: "Missense", Variant: "p.Y86N", Tier: 3, tier: "2", cell_fraction: "0.9", n_cells: "18", cells: "18/20", cell_ids: ids("a", 9) };
    const cand = { gene: "NF1", vartype: "SNV", type: "Missense", Variant: "p.R1276Q", Tier: 3, cell_fraction: "0.3", n_cells: "6", cells: "6/20", cell_ids: ids("b", 6), driver_class: "likely", driver_score: 5, driver_evidence: "OncoKB cancer gene" };
    const r = buildPatientReport({ patient: "P", events: [akap, cand], cells });
    expect(r.clonal.map((d) => d.gene)).toEqual(["AKAP3"]);
    expect(r.clonal[0].tier).toBe(2);
    expect(r.candidates.map((c) => [c.gene, c.score])).toEqual([["NF1", 5]]);
  });
});
