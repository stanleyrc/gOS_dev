import { AMPLICON_STRUCTURES_FILE, burdenByState, cellsInLasso, classCombinations, classRank, fractionAboveMes, linearKde, parseAmpliconStructures, parseEcdnaSnvs, parseStateScores, phyloSignalColumns, phyloSignalGeneSets, quadrantOf, snvBlockOrder, subclonalPerCell, symmetricExtent, upsetColumns, zTransform } from "./paperPanels";

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


const amp = {
  format: "gos-sc-amplicon-structures/1",
  patients: {
    PB: { n_tumour_cells: 10, classes: [{ cls: "EGFR", n_cells: 3, n_structures: 2, cells: ["b1", "b2", "b3"], cn: [10, 20, 30], structure: [1, 1, 2] }] },
    PA: {
      n_tumour_cells: 4,
      classes: [
        { cls: "CDK4+MDM2", n_cells: 2, n_structures: 1, cells: ["a1", "a2"], cn: [12, 14], structure: [1, 1] },
        { cls: "MYCN", n_cells: 3, n_structures: null, cells: ["a1", "a2", "a3"], cn: [40, null, 60], structure: [1, null, 2] },
      ],
    },
  },
  not_available: { PC: "no gene-cluster table" },
};

describe("amplicon classes (Fig 3A/B)", () => {
  it("parses, orders classes as the paper and patients as given", () => {
    expect(AMPLICON_STRUCTURES_FILE).toBe("amplicon_structures.json");
    const d = parseAmpliconStructures(amp, ["PA", "PB"]);
    expect(d.patients.map((p) => p.patient)).toEqual(["PA", "PB"]);
    expect(d.patients[0].classes.map((c) => c.cls)).toEqual(["MYCN", "CDK4+MDM2"]);
    expect(d.patients[0].classes[0].nStructures).toBeNull();
    expect(Number.isNaN(d.patients[0].classes[0].cn[1])).toBe(true);
    expect(d.notAvailable).toEqual([{ patient: "PC", why: "no gene-cluster table" }]);
    expect(parseAmpliconStructures(null)).toBeNull();
    expect(classRank("EGFR")).toBeLessThan(classRank("CDK4"));
  });
  it("combines classes per cell with shares of the tumour cells", () => {
    const d = parseAmpliconStructures(amp, ["PA", "PB"]);
    const b = classCombinations(d.patients, { minPct: 1, minCells: 1 });
    expect(b[0].rows[0]).toMatchObject({ key: "CDK4+MDM2|MYCN", n: 2, pct: 50 });
    expect(b[0].rows[1]).toMatchObject({ key: "MYCN", n: 1, pct: 25 });
    expect(classCombinations(d.patients)[0].rows.map((r) => r.key)).toEqual(["CDK4+MDM2|MYCN"]);
    expect(upsetColumns(b)).toEqual(["CDK4+MDM2", "EGFR", "MYCN"]);
  });
  it("linear KDE peaks at the data and is 0..1", () => {
    const k = linearKde([50, 50, 52, 48], 0, 100, 51);
    const top = k.reduce((a, b) => (b.d > a.d ? b : a));
    expect(Math.abs(top.x - 50)).toBeLessThanOrEqual(2);
    expect(Math.max(...k.map((p) => p.d))).toBeCloseTo(1);
  });
});

describe("SNV blocks (Fig 4B)", () => {
  it("orders truncal | subclonal by clade in tree order | private | unmapped", () => {
    const variants = [{ category: "private" }, { category: "subclonal" }, { category: "truncal" }, { category: "subclonal" }, { category: "subclonal" }, { category: "subclonal" }];
    const nodes = [{ firstLeaf: 3, lastLeaf: 3 }, { firstLeaf: 2, lastLeaf: 3 }, { firstLeaf: 0, lastLeaf: 3 }, { firstLeaf: 0, lastLeaf: 1 }, null, { firstLeaf: 1, lastLeaf: 1 }];
    const clade = (r) => (r < 2 ? "C1" : "C2");
    const { cols, blocks } = snvBlockOrder(variants, nodes, clade, [1, 2, 4, 2, 0, 1]);
    expect(cols).toEqual([2, 3, 1, 5, 0, 4]);
    expect(blocks.map((b) => [b.block, b.x0, b.x1])).toEqual([["Truncal", 0, 1], ["Subclonal", 1, 3], ["Private", 3, 5], ["Unmapped", 5, 6]]);
    expect(blocks[1].clades).toEqual([{ clade: "C1", x0: 1, x1: 2 }, { clade: "C2", x0: 2, x1: 3 }]);
  });
  it("parses exported ecDNA SNVs", () => {
    const s = parseEcdnaSnvs({ sites: [{ id: "7_200_G_C", pos: 200, cells: ["a"], ref_count: [1], alt_count: [3] }, { id: "7_100_A_T", pos: 100, cells: "b", ref_count: 2, alt_count: 0 }] });
    expect(s.map((x) => x.id)).toEqual(["7_100_A_T", "7_200_G_C"]);
    expect(s[1].reads.get("a")).toEqual([1, 3]);
    expect(s[0].reads.get("b")).toEqual([2, 0]);
    expect(parseEcdnaSnvs({})).toBeNull();
  });
});

describe("Fig 1d/f/g data", () => {
  it("counts subclonal genotype-1 sites per tumour cell", () => {
    const variants = [{ category: "subclonal" }, { category: "truncal" }, { category: "subclonal" }];
    const packed = { a: { idx: Int32Array.from([0, 1, 2]), vaf: Uint8Array.from([100, 100, 0]), gt: Int8Array.from([1, 1, 0]) }, b: { idx: Int32Array.from([0, 2]), vaf: Uint8Array.from([90, 90]), gt: Int8Array.from([1, 1]) } };
    expect(subclonalPerCell(variants, packed, ["a", "b", "z"])).toEqual({ k: 2, med: 1.5, lo: 1.25, hi: 1.75 });
  });
  it("scales burden to the MES median and needs >= 3 MES cells", () => {
    const tmb = {
      patients: [
        { patient: "P1", cells: [{ cell_id: "m1", tmb_corrected: 1 }, { cell_id: "m2", tmb_corrected: 2 }, { cell_id: "m3", tmb_corrected: 3 }, { cell_id: "a1", tmb_corrected: 4 }, { cell_id: "x", tmb_corrected: 9 }] },
        { patient: "P2", cells: [{ cell_id: "m1", tmb_corrected: 1 }, { cell_id: "a1", tmb_corrected: 2 }] },
      ],
    };
    const st = { m1: "MES", m2: "MES", m3: "MES", a1: "AC", x: "Normal" };
    const rows = burdenByState(tmb, (p, id) => st[id]);
    expect(rows.map((r) => [r.patient, r.cell, r.rel])).toEqual([["P1", "m1", 0.5], ["P1", "m2", 1], ["P1", "m3", 1.5], ["P1", "a1", 2]]);
    expect(fractionAboveMes(rows, 1)).toEqual([{ patient: "P1", state: "MES", n: 3, above: 1, frac: 1 / 3 }, { patient: "P1", state: "AC", n: 1, above: 1, frac: 1 }]);
  });
});
