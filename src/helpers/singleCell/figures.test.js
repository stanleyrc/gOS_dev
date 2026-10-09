import {
  ampliconRGB,
  ampliconRGBA,
  binSnvMatrix,
  cloneFractions,
  columnCorrelations,
  groupCombinations,
  leafDistances,
  linearFit,
  logDensity,
  packSnvCells,
  phyloSignal,
  snvTreeOrder,
  subclonalFindings,
  walkGeneSet,
  walkGroups,
} from "./figures";
import { layoutTree, parseNewick } from "./newick";

const cells = ["a", "b", "c", "d"];
const walks = [
  { id: "1", driver_genes: "EGFR", curated: true, cells: { a: 10, b: 20 } },
  { id: "2", driver_genes: ["EGFR"], curated: true, cells: { a: 5, c: 3 } },
  { id: "3", driver_genes: ["MDM2", "CDK4"], curated: true, cells: { b: 4, c: 4, d: 8 } },
  { id: "4", driver_genes: [], curated: true, cells: { a: 9, b: 9, c: 9 } },
  { id: "5", driver_genes: "MYC", curated: false, cells: { a: 9, b: 9, c: 9 } },
];

describe("walk groups", () => {
  test("gene-set key sorts driver genes and falls back to Other", () => {
    expect(walkGeneSet(walks[2])).toBe("CDK4+MDM2");
    expect(walkGeneSet(walks[3])).toBe("Other");
  });
  test("groups sum copies per cell and honour curated / Other / minCells", () => {
    const g = walkGroups(walks, cells, { minCells: 2 });
    expect(g.map((x) => x.key)).toEqual(["EGFR", "CDK4+MDM2"]);
    expect(Array.from(g[0].cn)).toEqual([15, 20, 3, 0]);
    expect(g[0].nCells).toBe(3);
    expect(g[0].walks).toHaveLength(2);
    const all = walkGroups(walks, cells, { minCells: 2, includeOther: true, curatedOnly: false });
    expect(all.map((x) => x.key)).toEqual(["EGFR", "MYC", "CDK4+MDM2", "Other"]);
  });
  test("combinations per cell", () => {
    const g = walkGroups(walks, cells, { minCells: 2 });
    const c = groupCombinations(g, cells, 1);
    expect(c.find((x) => x.keys.join("|") === "EGFR|CDK4+MDM2").n).toBe(2);
    expect(c.reduce((s, x) => s + x.n, 0)).toBe(4);
  });
});

describe("densities and fits", () => {
  test("log density peaks near the data and is normalised", () => {
    const d = logDensity([10, 10, 11, 9, 10], 1, 100, 21);
    const peak = d.indexOf(Math.max(...d));
    expect(peak).toBe(10); // log10(10) is the middle of [0, 2]
    expect(Math.max(...d)).toBeCloseTo(1);
  });
  test("linear fit recovers slope and ratio", () => {
    const f = linearFit([1, 2, 3, 4], [2, 4, 6, 8]);
    expect(f.slope).toBeCloseTo(2);
    expect(f.r2).toBeCloseTo(1);
    expect(f.ratio).toBeCloseTo(2);
  });
});

describe("phylogenetic signal", () => {
  const layout = layoutTree(parseNewick("((a:1,b:1):1,(c:1,d:1):1,(e:1,f:1):1,(g:1,h:1):1);"));
  test("leaf distances are patristic", () => {
    const D = leafDistances(layout);
    const n = layout.leaves.length;
    const i = layout.leaves.indexOf("a");
    expect(D[i * n + layout.leaves.indexOf("b")]).toBe(2);
    expect(D[i * n + layout.leaves.indexOf("h")]).toBe(4);
  });
  test("clade-structured values have a high z, shuffled ones do not", () => {
    const clade = { a: 10, b: 10, c: 1, d: 1, e: 5, f: 5, g: 0, h: 0 };
    const noise = { a: 10, b: 1, c: 5, d: 0, e: 0, f: 10, g: 5, h: 1 };
    const [s1, s2] = phyloSignal(layout, layout.leaves, [
      { key: "clade", value: (id) => clade[id] },
      { key: "noise", value: (id) => noise[id] },
    ]);
    expect(s1.z).toBeGreaterThan(1.5);
    expect(s2.z).toBeLessThan(s1.z);
  });
});

describe("findings", () => {
  const layout = layoutTree(parseNewick("((a:1,b:1,c:1):1,(d:1,e:1,f:1):1,n:1);"));
  const cellRecs = ["a", "b", "c", "d", "e", "f"].map((id) => ({ cell_id: id, clone_id: id < "d" ? "Clone 1" : "Clone 2" })).concat([{ cell_id: "n", clone_id: "Normal" }]);
  test("clone fractions", () => {
    const f = cloneFractions(cellRecs, new Set(["a", "b", "d"]));
    expect(f.find((x) => x.clone === "Clone 1").fraction).toBeCloseTo(2 / 3);
  });
  test("a fusion in one clone is subclonal; a clonal one is not", () => {
    const events = [
      { type: "Fusion", vartype: "fusion", fusion_genes: "ZNF345::MLLT3", gene: "ZNF345::MLLT3", Tier: 2, cell_ids: "a,b,c" },
      { type: "SCNA", vartype: "AMP", gene: "CDK4", Tier: 2, cell_ids: "a,b,c,d,e,f" },
    ];
    const out = subclonalFindings({ events, cells: cellRecs, tree: layout });
    expect(out.map((x) => x.label)).toEqual(["ZNF345::MLLT3"]);
    expect(out[0].f1).toBeCloseTo(1);
    expect(out[0].clones.find((c) => c.clone === "Clone 1").fraction).toBe(1);
  });
});

describe("colours and SNV packing", () => {
  test("amplicon ramp end points", () => {
    expect(ampliconRGB(2)).toEqual([253, 232, 205]);
    expect(ampliconRGB(500)).toEqual([20, 0, 0]);
    expect(ampliconRGBA(2)).toBe(((255 << 24) | (205 << 16) | (232 << 8) | 253) >>> 0);
  });
  test("packing, tree order and binning", () => {
    const packed = packSnvCells({ a: [[0, 5, 5, 1], [1, 0, 0, null], [2, 10, 0, 0]], b: [[1, 0, 4, 1], [2, 2, 8, 1]] });
    expect(Array.from(packed.a.idx)).toEqual([0, 2]);
    expect(Array.from(packed.a.vaf)).toEqual([125, 0]);
    const rowOf = new Map([["a", 0], ["b", 1]]);
    const order = snvTreeOrder(packed, rowOf, 3);
    expect(order).toEqual([0, 1, 2]);
    const M = binSnvMatrix(packed, ["a", "b"], order, 3);
    expect(Array.from(M)).toEqual([125, -1, 0, -1, 250, 200]);
  });
  test("column correlations", () => {
    const C = columnCorrelations(Float32Array.from([1, 2, 2, 4, 3, 6]), 3, 2);
    expect(C[1]).toBeCloseTo(1);
  });
});
