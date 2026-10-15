import { covariateHits, driverEventsForGene, eventLabelsForGene, labelHasGene, levelRank, parseBiomarkerDrugs, parseCuratedGenes, tmbHits } from "./geneQuickLook";

describe("geneQuickLook", () => {
  test("parseCuratedGenes reads flags and rejects non-tsv", () => {
    const t = "Hugo_Symbol\tIs_Oncogene\tIs_Tumor_Suppressor_Gene\tHighest_Level_of_Evidence_sensitivity\tHighest_Level_of_Evidence_resistance\tSummary_Background\nEGFR\tYes\tNo\t1\tR1\tAn RTK.\nTP53\tNo\tYes\t\t\tTSG.";
    const m = parseCuratedGenes(t);
    expect(m.get("EGFR")).toMatchObject({ oncogene: true, tsg: false, sensitivity: "1", resistance: "R1" });
    expect(m.get("TP53").tsg).toBe(true);
    expect(parseCuratedGenes("<!doctype html><html></html>")).toBeNull();
    expect(parseCuratedGenes("")).toBeNull();
  });
  test("parseBiomarkerDrugs groups drugs, sorts levels, skips Dx/Px", () => {
    const t = "Level\tGene\tAlterations_Cancer_Types\tDrugs\n3A\tEGFR\tAmp\tGBM\tDrugB\n1\tEGFR\tL858R\tNSCLC\tDrugA\n1\tEGFR\tL858R\tNSCLC\tDrugC\nDx2\tEGFR\tX\tY\tZ";
    const e = parseBiomarkerDrugs(t).get("EGFR");
    expect(e.map((x) => x.level)).toEqual(["1", "3A"]);
    expect(e[0].drugs).toEqual(["DrugA", "DrugC"]);
    expect(parseBiomarkerDrugs("<html>")).toBeNull();
    expect(levelRank("R1")).toBeGreaterThan(levelRank("4"));
  });
  const summaries = [{ caseReportId: "P1" }, { caseReportId: "P2" }];
  const files = {
    P1: { events: [{ gene: "EGFR", Tier: 1, cell_fraction: 0.9, Variant: "amp", vartype: "CNV" }, { gene: "METTL1", Tier: 2 }] },
    P2: { events: [{ fusion_genes: "SEPT14::EGFR", Tier: 2, cell_fraction: 0.2, vartype: "SV" }] },
  };
  test("driver events match whole gene tokens including fusion partners", () => {
    expect(labelHasGene("SEPT14::EGFR", "EGFR")).toBe(true);
    expect(labelHasGene("METTL1", "MET")).toBe(false);
    const ev = driverEventsForGene(summaries, files, "EGFR");
    expect(ev.map((e) => e.patient)).toEqual(["P1", "P2"]);
    expect(eventLabelsForGene(summaries, files, "EGFR")).toEqual(["EGFR", "SEPT14::EGFR"]);
  });
  test("covariate and TMB hits", () => {
    const de = { tests: [
      { id: "a", label: "A", genes: [{ gene: "G", q_val: 0.01, avg_log2FC: 1, n_patients: 3, n_concordant: 3 }] },
      { id: "b", label: "B", genes: [{ gene: "G", q_val: 0.2, avg_log2FC: 1, n_patients: 3, n_concordant: 3 }] },
    ] };
    expect(covariateHits(de, "G").map((h) => h.id)).toEqual(["a"]);
    expect(covariateHits(de, "G")[0].robust).toBe(true);
    const doc = { genes: { "subclonal|x": { measure: "subclonal", adjust: "x", up: [{ gene: "G", mean_r: 0.2, q: 0.03, per: { P1: 0.3 } }], down: [] } } };
    expect(tmbHits(doc, "G")[0]).toMatchObject({ meanR: 0.2, q: 0.03 });
    expect(tmbHits(doc, "H")).toEqual([]);
  });
});
