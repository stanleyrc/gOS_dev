import { parseNewick, layoutTree, leafNames } from "./newick";
import {
  alignTipNames,
  cladeAt,
  cladeCells,
  countCrossings,
  defaultPair,
  eventChoices,
  eventLeafStates,
  layoutFor,
  median,
  orientToReference,
  searchSnvs,
  sharedCells,
  snvConcordance,
  snvLabel,
  snvLeafStates,
  tanglegramLinks,
  tipKey,
  treeConcordance,
  treeFromNewick,
  usableTrees,
} from "./treeCompare";

const lay = (nwk) => layoutTree(parseNewick(nwk));

// synthetic matrix: cells c1..c8, variants 0 (clade of c1-c4), 1 (scattered), 2 (too few carriers)
const CELLS = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"];
const mat = (rows) => ({
  cells: CELLS,
  variants: rows.map((_, i) => ({ id: `chr1_${i + 1}_A_C`, index: i, chromosome: "chr1", position: i + 1, ref: "A", alt: "C", gene: i === 0 ? "EGFR" : "ENSG0001", driver: i === 0, altCells: rows[i].filter((x) => x === 1).length })),
  status: CELLS.map((_, p) => Int8Array.from(rows.map((r) => r[p]))),
});

describe("tip matching", () => {
  it("matches tips case-insensitively and with - / _ and drops the rest", () => {
    expect(tipKey("pool-Q-BWH70-10A")).toBe(tipKey("pool_q_bwh70_10a"));
    const { root, matched, total } = alignTipNames(parseNewick("((BWH69_10a:1,x:1):1,(bwh69_3B:1,BWH69_5C:1):1);"), ["BWH69_10A", "BWH69_3B", "BWH69_5C"]);
    expect(total).toBe(4);
    expect(matched).toBe(3);
    expect(leafNames(root).sort()).toEqual(["BWH69_10A", "BWH69_3B", "BWH69_5C"]);
    expect(alignTipNames(parseNewick("(x:1,y:1);"), ["a", "b"]).root).toBeNull();
    expect(treeFromNewick("(a:1,B:1);", ["A", "b"]).matched).toBe(2);
  });
  it("lists usable trees and a default pair", () => {
    const idx = [{ name: "gos", n_matched: 10 }, { name: "jake_old", n_matched: 2 }, { name: "jake_latest", n_matched: 9 }];
    expect(usableTrees(idx).map((t) => t.name)).toEqual(["gos", "jake_latest"]);
    expect(defaultPair(usableTrees(idx))).toEqual(["gos", "jake_latest"]);
    expect(defaultPair([{ name: "a" }, { name: "b" }])).toEqual(["a", "b"]);
    expect(usableTrees(null)).toEqual([]);
  });
});

describe("tanglegram", () => {
  const A = lay("((a:1,b:1):1,(c:1,d:1):1);");
  it("counts crossings and orients tree B to A", () => {
    const rootB = parseNewick("((c:1,d:1):1,(b:1,a:1):1);");
    const before = tanglegramLinks(A, layoutTree(rootB));
    expect(countCrossings(before)).toBe(5);
    const rotated = layoutTree(orientToReference(rootB, A));
    expect(rotated.leaves).toEqual(["a", "b", "c", "d"]);
    expect(countCrossings(tanglegramLinks(A, rotated))).toBe(0);
    expect(countCrossings([{ a: 0, b: 1 }, { a: 1, b: 0 }])).toBe(1);
    expect(countCrossings([])).toBe(0);
  });
  it("links only shared cells", () => {
    const B = lay("((a:1,z:1):1,(d:1,c:1):1);");
    expect([...sharedCells(A, B)].sort()).toEqual(["a", "c", "d"]);
    expect(tanglegramLinks(A, B).map((l) => l.id)).toEqual(["a", "c", "d"]);
    expect(layoutFor(parseNewick("((a:1,b:1):1,(c:1,d:1):1);"), new Set(["a", "d"])).leaves).toEqual(["a", "d"]);
  });
});

describe("clade picking", () => {
  const L = lay("((a:1,b:1):1,(c:1,d:2):1);");
  it("picks the branch under the click and lists its cells", () => {
    // leaf a: x = 2, parent (a,b) at x = 1
    expect(L.nodes[cladeAt(L, 0, 2.5)].isLeaf).toBe(true);
    const inner = cladeAt(L, 0, 0.5);
    expect(cladeCells(L, inner)).toEqual(["a", "b"]);
    expect(cladeCells(L, cladeAt(L, 0, -1))).toEqual(["a", "b", "c", "d"]);
    expect(cladeAt(L, 99, 1)).toBeNull();
    expect(cladeCells(L, 999)).toEqual([]);
  });
});

describe("mutation painting", () => {
  const snv = mat([
    [1, 1, 1, 1, 0, 0, 0, -1],
    [1, 0, 0, 0, 1, 0, 0, 1],
  ]);
  it("gives alt / ref / no-coverage per leaf, no coverage for unknown cells", () => {
    expect(Array.from(snvLeafStates(snv, ["c1", "c5", "c8", "zz"], 0))).toEqual([1, 0, -1, -1]);
    expect(Array.from(eventLeafStates({ cell_ids: "c1,c3" }, ["c1", "c2", "c3"]))).toEqual([1, 0, 1]);
  });
  it("searches SNVs with drivers first and labels them", () => {
    expect(searchSnvs(snv.variants, "").map((v) => v.index)).toEqual([0]);
    expect(searchSnvs(snv.variants, "chr1:2")[0].index).toBe(1);
    expect(searchSnvs(snv.variants, "egfr")[0].index).toBe(0);
    expect(snvLabel(snv.variants[0])).toBe("EGFR chr1:1 A>C");
    expect(snvLabel(snv.variants[1])).toBe("chr1:2 A>C");
  });
  it("lists events with carriers by tier", () => {
    const ev = [{ gene: "B", type: "amp", cell_ids: "c1", Tier: 2 }, { gene: "A", type: "amp", cell_ids: "c1,c2", Tier: 1 }, { gene: "C", cell_ids: "" }];
    expect(eventChoices(ev).map((e) => e.label)).toEqual(["A amp", "B amp"]);
  });
});

describe("concordance", () => {
  const L = lay("(((c1:1,c2:1):1,(c3:1,c4:1):1):1,((c5:1,c6:1):1,(c7:1,c8:1):1):1);");
  const rows = [
    [1, 1, 1, 1, 0, 0, 0, 0], // exactly the first clade
    [1, 0, 1, 0, 1, 0, 1, 0], // scattered
    [1, 1, 0, 0, 0, 0, 0, 0], // two carriers
  ];
  const snv = mat(rows);
  it("scores one SNV and the median over SNVs with enough carriers", async () => {
    expect(snvConcordance(snv, L, 0).score).toBe(1);
    expect(snvConcordance(snv, L, 1).score).toBeLessThan(0.7);
    const res = await treeConcordance(snv, L, { minCarriers: 4 });
    expect(res.n).toBe(2);
    expect(res.eligible).toBe(2);
    expect(res.sampled).toBe(false);
    expect(res.scores.get(0)).toBe(1);
    expect(res.scores.has(2)).toBe(false);
    expect(res.median).toBeCloseTo((1 + res.scores.get(1)) / 2, 6);
  });
  it("samples when there are too many sites and can be cancelled", async () => {
    const res = await treeConcordance(snv, L, { minCarriers: 2, maxSites: 2 });
    expect(res.sampled).toBe(true);
    expect(res.n).toBe(2);
    expect(await treeConcordance(snv, L, { minCarriers: 2, cancelled: () => true })).toBeNull();
  });
  it("is empty without SNVs and median ignores NaN", async () => {
    expect((await treeConcordance(null, L)).n).toBe(0);
    expect(median([NaN, 1, 3])).toBe(2);
    expect(Number.isNaN(median([]))).toBe(true);
  });
});

describe("drawing helpers", () => {
  const { rowRuns, nodeCloneKeys, branchPaths, paintColors } = require("./treeCompare");
  it("merges rows into runs", () => {
    expect(rowRuns([5, 3, 4, 9, 3])).toEqual([[3, 5], [9, 9]]);
    expect(rowRuns([])).toEqual([]);
  });
  it("colours branches by shared clone and groups the path by colour", () => {
    const L = lay("((a:1,b:1):1,(c:1,d:1):1);");
    const clone = { a: "x", b: "x", c: "x", d: "y" };
    const keys = nodeCloneKeys(L, (n) => clone[n]);
    expect(keys[0]).toBeNull();
    expect(keys[1]).toBe("x");
    expect(keys[L.nodes.findIndex((n) => n.name === "d")]).toBe("y");
    const paths = branchPaths(L, (x) => x * 10, (r) => r * 4, (id) => keys[id] || "mixed");
    expect([...paths.keys()].sort()).toEqual(["mixed", "x", "y"]);
    expect(paths.get("y")).toBe("M10 14H20");
    expect(paintColors("dark").alt).not.toBe(paintColors("light").alt);
  });
});
