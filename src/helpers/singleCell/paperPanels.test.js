import { cellsInLasso, parseStateScores, phyloSignalColumns, phyloSignalGeneSets, quadrantOf, symmetricExtent, zTransform } from "./paperPanels";

const scores = {
  format: "gos-sc-state-scores/1",
  cells: [
    { patient: "PA", cell_id: "a1", MES: 0, AC: 0, OPC: 0, NPC: 1, D: 0.5, x: 0.4, state: "NPC" },
    { patient: "PA", cell_id: "a2", MES: 1, AC: 0, OPC: 0, NPC: 0, D: -0.5, x: 0.3, state: "MES" },
    { patient: "PB", cell_id: "b1", MES: 0, AC: 1, OPC: 0, NPC: 0, D: -0.4, x: -0.6, state: "AC" },
    { patient: "PB", cell_id: "b2", D: null, x: 0.1, state: "AC" },
  ],
};

describe("state quadrant data", () => {
  it("parses rows and drops incomplete cells", () => {
    const p = parseStateScores(scores);
    expect(p.map((r) => r.cell)).toEqual(["a1", "a2", "b1"]);
    expect(p[0]).toMatchObject({ patient: "PA", x: 0.4, y: 0.5, state: "NPC" });
    expect(parseStateScores(null)).toBeNull();
  });
  it("parses column-oriented cells", () => {
    const p = parseStateScores({ cells: { patient: ["PA"], cell_id: ["c"], D: [1], x: [-1], state: ["OPC"] } });
    expect(p).toHaveLength(1);
    expect(p[0].y).toBe(1);
  });
  it("names quadrants and pads extents symmetrically", () => {
    expect([quadrantOf(1, 1), quadrantOf(-1, 1), quadrantOf(-1, -1), quadrantOf(1, -1)]).toEqual(["NPC", "OPC", "AC", "MES"]);
    const [lo, hi] = symmetricExtent([0.2, -1, 0.5], { pad: 0 });
    expect([lo, hi]).toEqual([-1, 1]);
  });
  it("groups lassoed cells by patient, largest first", () => {
    const p = parseStateScores(scores);
    const g = cellsInLasso(p, [[-1, -1], [1, -1], [1, 1], [-1, 1]]);
    expect(g[0]).toEqual({ patient: "PA", cells: ["a1", "a2"] });
    expect(g[1]).toEqual({ patient: "PB", cells: ["b1"] });
    expect(cellsInLasso(p, [[0.35, 0.4], [0.45, 0.4], [0.45, 0.6], [0.35, 0.6]])).toEqual([{ patient: "PA", cells: ["a1"] }]);
  });
});

const sig = (patient, rows) => ({ patient, data: { rows } });
const signals = [
  sig("PA", [
    { key: "Seq. depth", kind: "control", z: 0.3 },
    { key: "Ploidy", kind: "control", z: 2.5 },
    { key: "w1", kind: "walk", gene_set: "EGFR", walk_id: "7", z: 3 },
    { key: "w2", kind: "walk", gene_set: "EGFR", walk_id: "8", z: 1 },
    { key: "Mean somatic VAF", kind: "control", z: 0.4 },
  ]),
  sig("PB", [
    { key: "Seq. depth", kind: "control", z: null },
    { key: "w3", kind: "walk", gene_set: "EGFR", walk_id: "1", z: 100 },
    { key: "w4", kind: "walk", gene_set: "MYCN", walk_id: "2", z: 9 },
  ]),
];

describe("phylogenetic signal columns", () => {
  it("orders depth | amplicon | VAF, lists missing controls, takes medians", () => {
    const { columns, missing } = phyloSignalColumns(signals, { geneSets: ["EGFR"] });
    expect(columns.map((c) => c.label)).toEqual(["Seq. depth", "EGFR ecDNA", "Somatic VAF"]);
    expect(columns[1].points.map((p) => p.walkId)).toEqual(["7", "8", "1"]);
    expect(columns[1].median).toBe(3);
    expect(missing).toEqual([{ key: "Seq. depth", patients: ["PB"] }]);
  });
  it("lists gene sets by patients", () => {
    expect(phyloSignalGeneSets(signals)).toEqual([{ geneSet: "EGFR", patients: 2 }, { geneSet: "MYCN", patients: 1 }]);
  });
  it("pseudo-log z is monotone and symmetric", () => {
    expect(zTransform(0)).toBe(0);
    expect(zTransform(9)).toBeCloseTo(1);
    expect(zTransform(-9)).toBeCloseTo(-1);
    expect(zTransform(100)).toBeGreaterThan(zTransform(20));
  });
});
