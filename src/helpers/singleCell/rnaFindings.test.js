import { cloneComposition, cohortRnaHighlights, compareGene, isSilentAmp, matchedTumorCells, rnaExpressionFindings, rnaHeadlines, rnaMetaFindings } from "./rnaFindings";

// two clones of 20 DNA cells each + 4 normal; clone A is AC / cycling / edge, clone B NPC / G1 / core
const cells = [
  ...Array.from({ length: 20 }, (_, i) => ({ cell_id: `a${i}`, clone_id: "A" })),
  ...Array.from({ length: 20 }, (_, i) => ({ cell_id: `b${i}`, clone_id: "B" })),
  ...Array.from({ length: 4 }, (_, i) => ({ cell_id: `n${i}`, clone_id: "Normal" })),
];
const rnaCells = [
  ...Array.from({ length: 20 }, (_, i) => ({ cell_id: `a${i}`, state: i < 18 ? "AC" : "NPC", Phase: i < 14 ? "S" : "G1", Region_Annotation: "Edge" })),
  ...Array.from({ length: 20 }, (_, i) => ({ cell_id: `b${i}`, state: i < 17 ? "NPC" : "AC", Phase: i < 3 ? "G2M" : "G1", Region_Annotation: "Core" })),
  ...Array.from({ length: 4 }, (_, i) => ({ cell_id: `n${i}`, state: null, Phase: "G1", Region_Annotation: "Core" })),
  { cell_id: null, state: "MES", Cell_Type: "Malignant", Phase: "G1" }, // RNA-only malignant cell
  { cell_id: null, state: null, Cell_Type: "Microglia", Phase: "G1" },
];

// gene-major sparse matrix over the 46 RNA cells: G0 high in clone A, G1 flat
function matrixOf(columns) {
  const indptr = [0];
  const indices = [];
  const data = [];
  columns.forEach((col) => {
    col.forEach((v, r) => {
      if (v) {
        indices.push(r);
        data.push(v);
      }
    });
    indptr.push(indices.length);
  });
  return { indptr: Int32Array.from(indptr), indices: Int32Array.from(indices), data: Float32Array.from(data) };
}
const g0 = rnaCells.map((c) => (c.cell_id && c.cell_id.startsWith("a") ? 3 : 0.1 * ((c.cell_id || "").length % 2)));
const g1 = rnaCells.map((_, r) => (r % 3 ? 1 : 0));
const summary = { cells: rnaCells, genes: ["EGFR", "CDK4"], geneIndex: new Map([["EGFR", 0], ["CDK4", 1]]) };
const matrix = matrixOf([g0, g1]);

describe("rnaFindings", () => {
  test("matchedTumorCells keeps RNA cells linked to tumor clones only", () => {
    const m = matchedTumorCells(rnaCells, new Map(cells.map((c) => [c.cell_id, c.clone_id])));
    expect(m).toHaveLength(40);
    expect(new Set(m.map((x) => x.clone))).toEqual(new Set(["A", "B"]));
  });

  test("cloneComposition finds the enriched clone x level", () => {
    const comp = cloneComposition([...Array(10).fill({ clone: "A", value: "x" }), ...Array(10).fill({ clone: "B", value: "y" })]);
    expect(comp.p).toBeLessThan(0.001);
    expect(comp.enriched.map((x) => `${x.clone}:${x.level}`).sort()).toEqual(["A:x", "B:y"]);
    expect(cloneComposition([{ clone: "A", value: "x" }]).enriched).toEqual([]);
  });

  test("rnaMetaFindings: state mix, clone states, cycling, region", () => {
    const meta = rnaMetaFindings({ rnaCells, cells });
    expect(meta.nRna).toBe(46);
    expect(meta.nTumorMatched).toBe(40);
    expect(meta.nTumorRna).toBe(41); // + the RNA-only malignant cell
    expect(meta.states.mix[0].state).toBe("AC");
    expect(meta.states.byClone.enriched.some((x) => x.clone === "A" && x.level === "AC")).toBe(true);
    expect(meta.cycling.byClone.A).toBeCloseTo(0.7);
    expect(meta.cycling.high.map((x) => x.clone)).toEqual(["A"]);
    expect(meta.regions.field).toBe("Region_Annotation");
    expect(meta.regions.byClone.enriched.length).toBeGreaterThan(0);
  });

  test("compareGene: carriers vs others", () => {
    const a = rnaCells.map((c, r) => (c.cell_id?.startsWith("a") ? r : -1)).filter((r) => r >= 0);
    const b = rnaCells.map((c, r) => (c.cell_id?.startsWith("b") ? r : -1)).filter((r) => r >= 0);
    const r = compareGene(matrix, 0, a, b);
    expect(r.meanA).toBeCloseTo(3);
    expect(r.pctA).toBe(1);
    expect(r.log2FC).toBeGreaterThan(3);
    expect(r.p).toBeLessThan(1e-6);
  });

  test("rnaExpressionFindings: concordant and silent amplifications, clone markers", async () => {
    const carriersA = cells.filter((c) => c.clone_id === "A").map((c) => c.cell_id).join(",");
    const drivers = [
      { label: "EGFR amplification", gene: "EGFR", class: "amp", event: { cell_ids: carriersA } },
      { label: "CDK4 amplification", gene: "CDK4", class: "amp", event: { cell_ids: carriersA } },
      { label: "TP53 (Trunc)", gene: "TP53", class: "trunc", event: { cell_ids: carriersA } },
    ];
    const expr = await rnaExpressionFindings({ summary, matrix, cells, drivers });
    expect(expr.dosage.map((x) => x.gene)).toEqual(["EGFR", "CDK4"]);
    expect(expr.dosage[0].concordant).toBe(true);
    expect(isSilentAmp(expr.dosage[1])).toBe(true);
    const markerA = expr.markers.find((m) => m.clone === "A");
    expect(markerA.up.map((r) => r.gene)).toContain("EGFR");

    const heads = rnaHeadlines(rnaMetaFindings({ rnaCells, cells }), expr);
    const kinds = heads.map((h) => h.kind);
    expect(kinds[0]).toBe("state-mix");
    expect(kinds).toEqual(expect.arrayContaining(["clone-state", "clone-cycling", "clone-region", "dosage", "silent-amp", "clone-markers"]));
    expect(kinds).not.toContain("clone-quiescent"); // mirror of the cycling clone

    const cohort = cohortRnaHighlights({ P1: { meta: rnaMetaFindings({ rnaCells, cells }), expr }, P2: { meta: rnaMetaFindings({ rnaCells, cells }), expr }, P3: null });
    expect(cohort.nPatients).toBe(2);
    expect(cohort.dosage[0]).toMatchObject({ gene: "EGFR" });
    expect(cohort.dosage[0].patients).toHaveLength(2);
    expect(cohort.silent[0]).toEqual({ gene: "CDK4", patients: ["P1", "P2"] });
    expect(cohort.recurrentMarkers.map((m) => m.gene)).toContain("EGFR");
    expect(cohort.cloneStatePatients).toEqual(["P1", "P2"]);
  });

  test("no RNA: no headlines", () => {
    expect(rnaHeadlines(null)).toEqual([]);
    expect(rnaHeadlines(rnaMetaFindings({ rnaCells: [], cells }))).toEqual([]);
  });
});
