import {
  balanceTable,
  chimericSupport,
  classifyDeRow,
  cnContrast,
  comparatorCells,
  driverLabel,
  eventContrast,
  exonProfile,
  plateOf,
  stratifiedDE,
  subclonalDrivers,
} from "./driverContrast";
import { layoutTree, parseNewick } from "./newick";

const tree = layoutTree(parseNewick("((P_A_pl1_a1,P_A_pl1_a2,P_A_pl1_a3),((P_A_pl1_b1,P_A_pl2_b2),(P_A_pl2_c1,P_A_pl2_c2,P_A_pl2_c3)));"));
const tumor = tree.leaves.slice();

describe("plateOf / driverLabel", () => {
  it("strips patient and well", () => {
    expect(plateOf("MGH303_MR_4_pl5_8d")).toBe("MR_4_pl5");
    expect(plateOf("MGH285_MR3_pl3_4d")).toBe("MR3_pl3");
    expect(plateOf("x")).toBe("");
  });
  it("labels fusions by their genes and others by gene + type", () => {
    expect(driverLabel({ fusion_genes: "ZNF345::MLLT3", gene: "ZNF345::MLLT3" })).toBe("ZNF345::MLLT3");
    expect(driverLabel({ gene: "EGFR", vartype: "AMP" })).toBe("EGFR AMP");
  });
});

describe("subclonalDrivers", () => {
  const events = [
    { gene: "CLONAL", vartype: "AMP", Tier: 2, cell_ids: tumor.join(",") },
    { gene: "SUB", vartype: "AMP", Tier: 2, cell_ids: "P_A_pl2_c1,P_A_pl2_c2,P_A_pl2_c3" },
    { gene: "SCATTER", vartype: "HOMDEL", Tier: 3, cell_ids: "P_A_pl1_a1,P_A_pl2_c1,P_A_pl1_b1" },
    { gene: "RARE", vartype: "AMP", Tier: 1, cell_ids: "P_A_pl1_a1" },
  ];
  it("keeps drivers carried by part of the tumor cells, best clade fit first within a tier", () => {
    const d = subclonalDrivers(events, tumor, tree, { minCells: 2, minFraction: 0.1 });
    expect(d.map((x) => x.label)).toEqual(["SUB AMP", "SCATTER HOMDEL"]);
    expect(d[0].fit.score).toBeCloseTo(1);
    expect(d[0].fraction).toBeCloseTo(3 / 8);
  });
});

describe("comparatorCells", () => {
  const carriers = ["P_A_pl2_c1", "P_A_pl2_c2", "P_A_pl2_c3"];
  it("sister: closest non-carrier relatives", () => {
    const { cells, note } = comparatorCells("sister", carriers, tumor, tree, { minCells: 2 });
    expect(cells.sort()).toEqual(["P_A_pl1_b1", "P_A_pl2_b2"]);
    expect(note.key).toBe("sister");
  });
  it("sister widens until it has enough cells", () => {
    const { cells } = comparatorCells("sister", carriers, tumor, tree, { minCells: 4 });
    expect(cells).toHaveLength(5);
  });
  it("plate: non-carriers on the carriers' plates", () => {
    expect(comparatorCells("plate", carriers, tumor, tree).cells).toEqual(["P_A_pl2_b2"]);
  });
  it("all: every non-carrier", () => {
    expect(comparatorCells("all", carriers, tumor, tree).cells).toHaveLength(5);
  });
});

describe("balanceTable", () => {
  it("counts levels and flags levels holding only carriers", () => {
    const [t] = balanceTable(["P_A_pl2_c1", "P_A_pl2_c2", "P_A_pl1_a1"], ["P_A_pl1_a2", "P_A_pl1_a3"], ["plate"], (id) => plateOf(id));
    expect(t.levels).toEqual([
      { level: "A_pl1", a: 1, b: 2 },
      { level: "A_pl2", a: 2, b: 0 },
    ]);
    expect(t.onlyA).toEqual(["A_pl2"]);
    expect(t.p).toBeGreaterThan(0);
  });
});

describe("cnContrast", () => {
  const binIndex = { sorted: Int32Array.from([0, 1]), sortedStarts: Float64Array.from([0, 100]), gEnd: Float64Array.from([99, 199]) };
  const cn = {
    cells: ["a", "b", "c", "d"],
    rows: [
      { binIndex, values: [2, 4] },
      { binIndex, values: [2, 4] },
      { binIndex, values: [2, 2] },
      { binIndex, values: [2, 2] },
    ],
  };
  it("finds the region where the groups' copy number differs", () => {
    const r = cnContrast(cn, ["a", "b"], ["c", "d"], [10, 50, 110, 150]);
    expect(r.meanA).toEqual([2, 2, 4, 4]);
    expect(r.regions).toEqual([{ start: 110, end: 150, meanA: 4, meanB: 2, diff: 2 }]);
  });
});

describe("eventContrast", () => {
  it("lists events enriched in one group", () => {
    const events = [
      { gene: "X", vartype: "AMP", cell_ids: "a1,a2,a3,a4" },
      { gene: "Y", vartype: "AMP", cell_ids: "a1,b1" },
    ];
    const out = eventContrast(events, ["a1", "a2", "a3", "a4"], ["b1", "b2", "b3", "b4"], null);
    expect(out[0].label).toBe("X AMP");
    expect(out[0].fracA).toBe(1);
    expect(out.find((o) => o.label === "Y AMP")).toBeUndefined();
  });
});

describe("stratifiedDE", () => {
  // 2 plates x (4 carriers + 4 non-carriers); gene 0 is up in carriers on both plates,
  // gene 1 differs only between plates (plate 2 holds more carriers) and must not come out.
  const plateOfRow = (r) => (r < 8 ? "p1" : "p2");
  const rowsA = [0, 1, 2, 3, 8, 9, 10, 11];
  const rowsB = [4, 5, 6, 7, 12, 13, 14, 15];
  const cols = [[], []];
  for (let r = 0; r < 16; r += 1) {
    cols[0].push([r, rowsA.includes(r) ? 3 + (r % 3) * 0.1 : 0.5 + (r % 2) * 0.1]);
    cols[1].push([r, r < 8 ? 0.2 + (r % 4) * 0.01 : 3 + (r % 4) * 0.01]);
  }
  const indptr = [0];
  const indices = [];
  const data = [];
  cols.forEach((c) => {
    c.forEach(([r, v]) => {
      indices.push(r);
      data.push(v);
    });
    indptr.push(indices.length);
  });
  const matrix = { indptr: Int32Array.from(indptr), indices: Int32Array.from(indices), data: Float32Array.from(data) };
  it("finds the within-plate effect and ignores the plate effect", async () => {
    const { rows, strata, pooled } = await stratifiedDE(matrix, ["UP", "PLATE"], 16, rowsA, rowsB, plateOfRow);
    expect(pooled).toBe(false);
    expect(strata).toHaveLength(2);
    const up = rows.find((r) => r.gene === "UP");
    const plate = rows.find((r) => r.gene === "PLATE");
    expect(up.z).toBeGreaterThan(2);
    expect(up.p_val).toBeLessThan(0.01);
    expect(plate.p_val).toBeGreaterThan(0.5);
  });
  it("pools when no stratum holds both groups", async () => {
    const { pooled } = await stratifiedDE(matrix, ["UP", "PLATE"], 16, [0, 1, 2, 3], [12, 13, 14, 15], plateOfRow);
    expect(pooled).toBe(true);
  });
});

describe("classifyDeRow", () => {
  const driver = [{ start: 1000, end: 2000 }];
  it("locus, copy number and trans", () => {
    expect(classifyDeRow({ avg_log2FC: 1 }, { mid: 2500 }, driver, 0, { windowBp: 1000 })).toBe("locus");
    expect(classifyDeRow({ avg_log2FC: 1 }, { mid: 9e6 }, driver, 1, { windowBp: 1000 })).toBe("cn");
    expect(classifyDeRow({ avg_log2FC: -1 }, { mid: 9e6 }, driver, 1, { windowBp: 1000 })).toBe("trans");
  });
});

describe("exonProfile / chimericSupport", () => {
  const entry = {
    genes: [{ gene: "G", strand: "-", transcript: "T", exons: [{ n: 1, start: 10, end: 20 }, { n: 2, start: 1, end: 5 }] }],
    cells: {
      a: { arriba: 2, discarded: 1, exons: { G: [10, 30] } },
      b: { arriba: 0, discarded: 0, exons: { G: [10, 10] } },
    },
  };
  it("mean counts per million per exon in each group", () => {
    const p = exonProfile(entry, "G", ["a"], ["b"], () => 1e6);
    expect(p.exons.map((e) => [e.a, e.b])).toEqual([
      [10, 10],
      [30, 10],
    ]);
  });
  it("chimeric reads per group", () => {
    expect(chimericSupport(entry, ["a"], ["b"]).a).toEqual({ withRna: 1, cells: 1, reads: 2, discarded: 1 });
  });
});
