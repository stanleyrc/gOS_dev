import { parseNewick, layoutTree, pruneTree, leafNames, treeForCells, toUnitHeight } from "./newick";
import {
  buildBinIndex,
  binAt,
  genomicColumnLookup,
  discreteColumnLookup,
  rowLookup,
  representativeCells,
  defaultCellOrder,
  rowMap,
  snvColumnOrder,
  junctionColumnOrder,
  resolveChromosome,
  packRGBA,
  packRGBInt,
  cnStateColor,
  junctionColor,
  binLabel,
  chromosomeSpans,
  discreteGroups,
  cloneColorMap,
  zoomDomain,
  panDomain,
  expressionRGB,
} from "./matrix";
import {
  entryType,
  cellsForPatient,
  patientKeyOf,
  patientRecordFor,
  cohortSummaries,
  cnRowFromGenome,
  connectionBreakpoints,
  junctionsFromGenomes,
  parseAnnotation,
  snvFromMutations,
  medianCnRow,
} from "./cellFiles";
import { cnDistances, hasInformativeSnvs, snvDistances, upgma } from "./phylogeny";

const chromoBins = {
  1: { chromosome: "1", startPoint: 1, endPoint: 1000, startPlace: 1, endPlace: 1000 },
  2: { chromosome: "2", startPoint: 1, endPoint: 1000, startPlace: 1001, endPlace: 2000 },
};

const bins = {
  chromosome: ["1", "1", "1", "2", "2"],
  start: [1, 201, 401, 1, 201],
  end: [200, 400, 600, 200, 400],
};

describe("newick", () => {
  it("parses labels, lengths, quotes and comments", () => {
    const tree = parseNewick("((a:1,'b c':2)x:0.5[comment],c:1e-1);");
    expect(tree.children).toHaveLength(2);
    expect(tree.children[0].name).toBe("x");
    expect(tree.children[0].length).toBe(0.5);
    expect(tree.children[0].children[1].name).toBe("b c");
    expect(tree.children[1].length).toBeCloseTo(0.1);
    expect(leafNames(tree)).toEqual(["a", "b c", "c"]);
  });

  it("keeps underscores in cell ids", () => {
    expect(leafNames(parseNewick("(cell_1,cell_2);"))).toEqual(["cell_1", "cell_2"]);
  });

  it("rejects malformed input", () => {
    expect(() => parseNewick("((a,b);")).toThrow();
    expect(() => parseNewick("")).toThrow();
  });

  it("lays out a phylogram with leaf rows in DFS order", () => {
    const { nodes, leaves, maxX } = layoutTree(parseNewick("((a:1,b:2):1,c:3);"));
    expect(leaves).toEqual(["a", "b", "c"]);
    const byName = Object.fromEntries(nodes.filter((n) => n.isLeaf).map((n) => [n.name, n]));
    expect(byName.a.x).toBe(2);
    expect(byName.b.x).toBe(3);
    expect(byName.c.x).toBe(3);
    expect(maxX).toBe(3);
    const root = nodes[0];
    expect(root.firstLeaf).toBe(0);
    expect(root.lastLeaf).toBe(2);
    const ab = nodes[root.children[0]];
    expect(ab.y).toBe(0.5);
    expect([ab.firstLeaf, ab.lastLeaf]).toEqual([0, 1]);
  });

  it("aligns leaves when branch lengths are absent", () => {
    const { nodes } = layoutTree(parseNewick("((a,b),c);"));
    const leafX = nodes.filter((n) => n.isLeaf).map((n) => n.x);
    expect(new Set(leafX).size).toBe(1);
  });

  it("prunes missing leaves and collapses unary nodes", () => {
    const pruned = pruneTree(parseNewick("((a:1,b:2):1,c:3);"), new Set(["a", "c"]));
    expect(leafNames(pruned)).toEqual(["a", "c"]);
    expect(pruned.children[0].length).toBe(2);
  });

  it("rescales trees to unit height", () => {
    const scaled = toUnitHeight(parseNewick("((a:2,b:4):4,c:1);"));
    expect(layoutTree(scaled).maxX).toBeCloseTo(1);
    const clado = toUnitHeight(parseNewick("((a,b),c);"));
    expect(layoutTree(clado).maxX).toBeCloseTo(1);
  });

  it("reports cells absent from the tree", () => {
    const { layout, unplaced } = treeForCells("(a,b);", ["a", "b", "z"]);
    expect(layout.leaves).toEqual(["a", "b"]);
    expect(unplaced).toEqual(["z"]);
  });
});

describe("bins and pixel lookups", () => {
  const index = buildBinIndex(bins, chromoBins);

  it("builds global coordinates", () => {
    expect(Array.from(index.gStart)).toEqual([2, 202, 402, 1002, 1202]);
    expect(binAt(index, 250)).toBe(1);
    expect(binAt(index, 1100)).toBe(3);
    expect(binAt(index, 800)).toBe(-1);
    expect(binLabel(index, 3)).toBe("2:1-200");
  });

  it("resolves chr prefixes", () => {
    expect(resolveChromosome("chr1", chromoBins)).toBe("1");
    expect(resolveChromosome("chrUn", chromoBins)).toBeNull();
    const withPrefix = buildBinIndex({ chromosome: ["chr2"], start: [1], end: [10] }, chromoBins);
    expect(withPrefix.gStart[0]).toBe(1002);
  });

  it("maps pixels to bins across one or more domains", () => {
    const { cols } = genomicColumnLookup(index, [[1, 2000]], 20);
    expect(cols).toHaveLength(20);
    expect(cols[0]).toBe(0);
    expect(cols[19]).toBe(-1);
    const two = genomicColumnLookup(index, [[1, 600], [1001, 1400]], 21, 1);
    expect(two.extents).toHaveLength(2);
    expect(two.cols[two.extents[1][0]]).toBe(3);
  });

  it("maps pixels to discrete columns and rows", () => {
    expect(Array.from(discreteColumnLookup(2, 4))).toEqual([0, 0, 1, 1]);
    expect(Array.from(rowLookup(3, 3))).toEqual([0, 1, 2]);
    expect(Array.from(rowLookup(4, 2))).toEqual([1, 3]);
  });
});

describe("colours", () => {
  it("packs colours for ImageData and WebGL", () => {
    expect(packRGBA([1, 2, 3])).toBe(((255 << 24) | (3 << 16) | (2 << 8) | 1) >>> 0);
    expect(packRGBInt([1, 2, 3])).toBe(65536 + 512 + 3);
    expect(cnStateColor(2)).toBe("#CCCCCC");
    expect(cnStateColor(40)).toBe("#D4B9DA");
    expect(junctionColor(0, 5)).toBe("#EEEEEE");
    expect(junctionColor(5, 5)).toBe("#7F0000");
  });
});

describe("axes", () => {
  it("finds visible chromosome spans and separators", () => {
    const { spans, separators } = chromosomeSpans(chromoBins, [[0, 100, [1, 2000]]]);
    expect(spans.map((s) => s.chromosome)).toEqual(["1", "2"]);
    expect(separators).toHaveLength(1);
    expect(separators[0]).toBeCloseTo(50, 0);
  });

  it("groups discrete columns by key", () => {
    const { spans, separators } = discreteGroups([0, 1, 2], (i) => ["1", "1", "2"][i], 30);
    expect(spans.map((s) => [s.chromosome, s.x0, s.x1])).toEqual([["1", 0, 20], ["2", 20, 30]]);
    expect(separators).toEqual([20]);
  });
});

describe("ordering and colours", () => {
  it("orders cells by clone with unassigned last and picks representatives", () => {
    const order = defaultCellOrder([
      { cell_id: "z", clone_id: "2" },
      { cell_id: "y", clone_id: "10" },
      { cell_id: "x", clone_id: null },
    ]);
    expect(order).toEqual(["z", "y", "x"]);
    const cells = [
      { cell_id: "c1", clone_id: "A" },
      { cell_id: "c2", clone_id: "A" },
      { cell_id: "c3", clone_id: "B" },
    ];
    expect(representativeCells(cells, ["c3", "c1", "c2"], 3)).toEqual(["c3", "c1"]);
    expect(Array.from(rowMap(["c2", "q"], ["c1", "c2"]))).toEqual([1, -1]);
  });

  it("honours clone colours from the data", () => {
    const colors = cloneColorMap([{ clone_id: "B" }, { clone_id: "A" }], [{ clone_id: "B", color: "#000000" }]);
    expect(colors.B).toBe("#000000");
    expect(typeof colors.A).toBe("string");
  });
});

describe("manifest records", () => {
  const records = [
    { pair: "P1", entry_type: "patient", patient_id: "P1" },
    { pair: "P2", entry_type: "Patient" },
    { pair: "P1_c2", entry_type: "cell", patient_id: "P1", clone_id: "B" },
    { pair: "P1_c1", entry_type: "cell", patient_id: "P1", clone_id: 1 },
    { pair: "P2_c1", entry_type: "cell", patient_id: "P2" },
    { pair: "bulk1" },
  ];

  it("classifies entry types", () => {
    expect(entryType(records[1])).toBe("patient");
    expect(entryType(records[5])).toBeNull();
    expect(patientKeyOf(records[1])).toBe("P2");
  });

  it("finds a patient's cells and a cell's patient", () => {
    const cells = cellsForPatient(records, "P1");
    expect(cells.map((c) => c.cell_id)).toEqual(["P1_c1", "P1_c2"]);
    expect(cells[0].clone_id).toBe("1");
    expect(patientRecordFor(records, records[4]).pair).toBe("P2");
  });

  it("summarizes the cohort", () => {
    const rows = cohortSummaries(records);
    expect(rows.map((r) => [r.caseReportId, r.nCells, r.nClones])).toEqual([
      ["P1", 2, 2],
      ["P2", 1, 0],
    ]);
    expect(rows[1].cloneCounts).toEqual({ unassigned: 1 });
  });
});

const genomeA = {
  intervals: [
    { iid: 1, chromosome: "1", startPoint: 1, endPoint: 500, y: 2, type: "interval" },
    { iid: 2, chromosome: "1", startPoint: 501, endPoint: 1000, y: 4, type: "interval" },
    { iid: 3, chromosome: "2", startPoint: 1, endPoint: 1000, y: 1, type: "interval" },
    { iid: 4, chromosome: "Un", startPoint: 1, endPoint: 10, y: 9, type: "interval" },
  ],
  connections: [
    { cid: 1, source: 1, sink: 2, type: "REF", weight: 2 },
    { cid: 2, source: 2, sink: -3, type: "ALT", weight: 3, title: "TRA-like" },
  ],
};
const genomeB = {
  intervals: [
    { iid: 7, chromosome: "1", startPoint: 1, endPoint: 1000, y: 2, type: "interval" },
    { iid: 8, chromosome: "2", startPoint: 1, endPoint: 1000, y: 2, type: "interval" },
  ],
  connections: [{ cid: 1, source: -8, sink: -7, type: "ALT", weight: 1 }],
};

describe("cell genome files", () => {
  it("turns genome graph nodes into a heatmap row", () => {
    const row = cnRowFromGenome(genomeA, chromoBins);
    expect(row.binIndex.n).toBe(3);
    expect(Array.from(row.values)).toEqual([2, 4, 1]);
    expect(row.values[binAt(row.binIndex, 600)]).toBe(4);
  });

  it("reads breakpoints from signed connections", () => {
    const byId = new Map(genomeA.intervals.map((d) => [d.iid, d]));
    const [a, b] = connectionBreakpoints(genomeA.connections[1], byId);
    expect([a.chromosome, a.position, a.strand]).toEqual(["1", 1000, "+"]);
    expect([b.chromosome, b.position, b.strand]).toEqual(["2", 1000, "+"]);
  });

  it("matches junctions across cells and fills copy number", () => {
    const j = junctionsFromGenomes(["a", "b", "c"], { a: genomeA, b: genomeB }, chromoBins, 1000);
    expect(j.junctions).toHaveLength(2);
    expect(j.maxCn).toBe(3);
    expect(Array.from(j.cn[0])).toEqual([3, 0]);
    expect(Number.isNaN(j.cn[2][0])).toBe(true);
    expect(junctionColumnOrder(j.junctions)).toEqual([0, 1]);
  });

  it("builds a median consensus row on a genome grid", () => {
    const rows = [cnRowFromGenome(genomeA, chromoBins), cnRowFromGenome(genomeB, chromoBins), null];
    const consensus = medianCnRow(rows, chromoBins, 250);
    expect(consensus.binIndex.n).toBe(8);
    expect(Array.from(consensus.values)).toEqual([2, 2, 3, 3, 1.5, 1.5, 1.5, 1.5]);
  });

  it("parses mutation annotations", () => {
    const a = parseAnnotation("Type: missense; Gene: TP53; Alt_count: 3; Ref_count: 1; ");
    expect(a).toEqual({ Type: "missense", Gene: "TP53", Alt_count: "3", Ref_count: "1" });
  });

  it("builds an SNV matrix from per-cell mutations", () => {
    const mut = (pos, gene, alt = 2) => ({
      chromosome: "1",
      startPoint: pos,
      endPoint: pos + 1,
      annotation: `Type: missense_variant; Gene: ${gene}; Genomic_variant: A>T; Alt_count: ${alt}; Ref_count: 3; `,
    });
    const snv = snvFromMutations(
      ["a", "b", "c"],
      { a: { intervals: [mut(50, "X"), mut(10, "Y")] }, b: { intervals: [mut(50, "X", 0)] } },
      chromoBins
    );
    expect(snv.variants.map((v) => v.id)).toEqual(["1:50:A>T", "1:10:A>T"]);
    expect(Array.from(snv.status[0])).toEqual([1, 1]);
    expect(Array.from(snv.status[1])).toEqual([0, 0]);
    expect(Array.from(snv.status[2])).toEqual([-1, -1]);
    expect(snv.depth[0][0]).toBe(5);
    expect(snvColumnOrder(snv, "genomic")).toEqual([1, 0]);
    expect(hasInformativeSnvs(snv)).toBe(false);
  });
});

describe("phylogeny inference", () => {
  it("joins the closest cells first", () => {
    const labels = ["a", "b", "c", "d"];
    const d = [
      [0, 1, 6, 6],
      [1, 0, 6, 6],
      [6, 6, 0, 2],
      [6, 6, 2, 0],
    ];
    const tree = upgma(Float64Array.from(d.flat()), labels);
    const groups = tree.children.map((c) => leafNames(c).sort().join(""));
    expect(groups.sort()).toEqual(["ab", "cd"]);
    const ab = tree.children.find((c) => leafNames(c).includes("a"));
    expect(ab.children[0].length).toBeCloseTo(0.5);
    expect(ab.length).toBeCloseTo(2.5);
    const { leaves } = layoutTree(tree);
    expect(leaves).toHaveLength(4);
  });

  it("handles trivial inputs", () => {
    expect(upgma(new Float64Array(0), [])).toBeNull();
    expect(upgma(new Float64Array(1), ["x"]).name).toBe("x");
  });

  it("computes SNV Jaccard distances on shared variants", () => {
    const snv = {
      cells: ["a", "b", "c"],
      variants: [{}, {}, {}],
      status: [Int8Array.from([1, 1, 0]), Int8Array.from([1, 1, 1]), Int8Array.from([-1, -1, -1])],
    };
    expect(hasInformativeSnvs(snv)).toBe(true);
    const D = snvDistances(snv);
    expect(D[0 * 3 + 1]).toBe(0);
    expect(D[0 * 3 + 2]).toBe(1);
  });

  it("computes copy-number distances on a genome grid", () => {
    const rows = [cnRowFromGenome(genomeA, chromoBins), cnRowFromGenome(genomeB, chromoBins), null];
    const D = cnDistances(rows, 2000);
    expect(D[1]).toBeGreaterThan(0);
    expect(D[0 * 3 + 2]).toBe(D[1 * 3 + 2]);
  });
});

describe("domain zoom and pan", () => {
  const bounds = [1, 2001];
  it("zooms around an anchor and stays in bounds", () => {
    expect(zoomDomain([1, 2001], 1001, 0.5, bounds)).toEqual([501, 1501]);
    expect(zoomDomain([1, 1001], 1, 0.5, bounds)).toEqual([1, 501]);
    expect(zoomDomain([1, 1001], 500, 10, bounds)).toEqual([1, 2001]);
    expect(zoomDomain([400, 600], 500, 0.01, bounds, 100)).toEqual([450, 550]);
  });

  it("pans without leaving the genome", () => {
    expect(panDomain([100, 200], 50, bounds)).toEqual([150, 250]);
    expect(panDomain([100, 200], -500, bounds)).toEqual([1, 101]);
    expect(panDomain([1900, 2000], 500, bounds)).toEqual([1901, 2001]);
  });
});

describe("expression colours", () => {
  it("separates no RNA, zero and high expression", () => {
    expect(expressionRGB(undefined, 3)).toBeNull();
    expect(expressionRGB(0, 3)).toEqual([0xef, 0xed, 0xf5]);
    expect(expressionRGB(3, 3)).toEqual([0x3f, 0x00, 0x7d]);
    expect(expressionRGB(10, 3)).toEqual([0x3f, 0x00, 0x7d]);
  });
});
