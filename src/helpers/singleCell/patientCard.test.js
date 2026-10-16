import { cardTmb, cardVignette, keyDrivers, parseClones, treeSource, tumourClones } from "./patientCard";

test("parseClones and tumourClones", () => {
  const c = parseClones("Single-cell WGS patient\nCells: 9\nClones: Clone 1 (4 cells), Clone 2 (3 cells), Normal (1 cells), Unassigned (1 cells)\nTree: included");
  expect(c).toHaveLength(4);
  expect(tumourClones(c).map((x) => x.name)).toEqual(["Clone 1", "Clone 2"]);
  expect(parseClones("nothing")).toEqual([]);
});

test("treeSource", () => {
  expect(treeSource({ tumor_details: "Old tree (P_tree.nwk); no SNVs yet. Will be replaced." })).toMatchObject({ kind: "older", file: "P_tree.nwk", noSnvs: true });
  expect(treeSource({ summary: "Clones: A (1 cells)\nTree: included" }).kind).toBe("current");
  expect(treeSource({}).kind).toBe("none");
});

test("keyDrivers keeps tier 1, strongest first, one per label", () => {
  const ev = [
    { gene: "A", Tier: 1, cell_fraction: 0.2, Variant: "x" },
    { gene: "B", Tier: 2, cell_fraction: 0.9 },
    { gene: "A", Tier: 1, cell_fraction: 0.1 },
    { gene: "C", Tier: 1, cell_fraction: 0.5 },
  ];
  expect(keyDrivers(ev).map((e) => e.label)).toEqual(["C", "A"]);
});

test("cardTmb and cardVignette", () => {
  const tmb = { patients: [{ patient: "P", noisy: true, patient_summary: { cell_tmb_corrected: { median: 0.3 } } }] };
  expect(cardTmb(tmb, "P")).toEqual({ value: 0.3, noisy: true });
  expect(cardTmb(tmb, "Q")).toBeNull();
  const v = { patients: [{ patient: "P", n_cells: 10, n_tumor: 8, n_normal: 2, n_rna_linked: 5, findings: [{ short: "S", text: "T" }] }] };
  expect(cardVignette(v, "P")).toMatchObject({ nTumor: 8, nRna: 5, headline: { short: "S" } });
  expect(cardVignette(v, "Q")).toBeNull();
  expect(cardVignette({ patients: { P: v.patients[0] } }, "P").nRna).toBe(5);
});

test("keyDrivers shows a TERT promoter rearrangement once, as TERT promoter SV, with its event", () => {
  const sv = (g) => ({ gene: g, fusion_genes: g, vartype: "fusion", type: "Fusion", Tier: "1", tert_promoter_sv: true, cell_fraction: "0.97" });
  const out = keyDrivers([sv("GENEA::TERT"), sv("GENEB::TERT"), { gene: "EGFR", vartype: "AMP", type: "SCNA", Tier: "1", cell_fraction: "0.5" }]);
  expect(out.map((d) => `${d.label} ${d.cls}`)).toEqual(["TERT promoter SV", "EGFR amp"]);
  expect(out[0].event.fusion_genes).toBe("GENEA::TERT");
});
