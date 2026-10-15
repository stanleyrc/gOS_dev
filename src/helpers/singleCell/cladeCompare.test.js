import { compareCladeCells, compareValues, compareFraction, resolveSpec, specForNode, cliffsDelta } from "./cladeCompare";

// synthetic: root(0) -> [1, 2]; 1 -> a, b; 2 -> c, d, e
const layout = {
  leaves: ["a", "b", "c", "d", "e"],
  nodes: [
    { isLeaf: false, children: [1, 2], firstLeaf: 0, lastLeaf: 4 },
    { isLeaf: false, children: [3, 4], firstLeaf: 0, lastLeaf: 1 },
    { isLeaf: false, children: [5, 6, 7], firstLeaf: 2, lastLeaf: 4 },
    { isLeaf: true, children: [], firstLeaf: 0, lastLeaf: 0 },
    { isLeaf: true, children: [], firstLeaf: 1, lastLeaf: 1 },
    { isLeaf: true, children: [], firstLeaf: 2, lastLeaf: 2 },
    { isLeaf: true, children: [], firstLeaf: 3, lastLeaf: 3 },
    { isLeaf: true, children: [], firstLeaf: 4, lastLeaf: 4 },
  ],
};
const ctx = {
  layout,
  order: layout.leaves,
  tumorIds: layout.leaves,
  cells: layout.leaves.map((id, i) => ({ cell_id: id, clone_id: i < 2 ? "Clone 1" : "Clone 2" })),
  savedGroups: [{ name: "mine", cells: ["a", "c"] }],
  selection: ["b", "c"],
  cladeNodes: new Map([[2, { clade: { id: "P_n2", n_private_snv: 7 } }]]),
};

describe("resolveSpec", () => {
  it("resolves nodes, clades, sisters, rest, clones, groups and the selection", () => {
    expect(resolveSpec("node:1", ctx).ids).toEqual(["a", "b"]);
    expect(resolveSpec("clade:P_n2", ctx).ids).toEqual(["c", "d", "e"]);
    expect(resolveSpec("sister:node:1", ctx).ids).toEqual(["c", "d", "e"]);
    expect(resolveSpec("sister:clade:P_n2", ctx).ids).toEqual(["a", "b"]);
    expect(resolveSpec("rest:node:1", ctx).ids).toEqual(["c", "d", "e"]);
    expect(resolveSpec("clone:Clone 1", ctx).ids).toEqual(["a", "b"]);
    expect(resolveSpec("group:mine", ctx).ids).toEqual(["a", "c"]);
    expect(resolveSpec("sel", ctx).ids).toEqual(["b", "c"]);
  });
  it("reports why a spec cannot be read", () => {
    expect(resolveSpec("node:0", ctx).ids).toHaveLength(5);
    expect(resolveSpec("sister:node:0", ctx).error).toMatch(/root/);
    expect(resolveSpec("group:none", ctx).error).toMatch(/no saved group/);
    expect(resolveSpec("sel", { ...ctx, selection: [] }).error).toMatch(/nothing is selected/);
    expect(resolveSpec("clade:zzz", ctx).error).toBeTruthy();
    expect(resolveSpec("", ctx).error).toBeTruthy();
  });
  it("names a node by its called clade when it has one", () => {
    expect(specForNode(2, ctx.cladeNodes)).toBe("clade:P_n2");
    expect(specForNode(1, ctx.cladeNodes)).toBe("node:1");
  });
});

describe("statistics", () => {
  it("separates fully ordered values with delta = 1", () => {
    const r = compareValues([5, 6, 7, 8, 9], [1, 2, 3, 4, 0]);
    expect(r.delta).toBeCloseTo(1);
    expect(r.p).toBeLessThan(0.02);
    expect(r.medianA).toBe(7);
  });
  it("refuses a test with fewer than 2 cells per side", () => {
    const r = compareValues([1], [1, 2, 3]);
    expect(r.p).toBeNull();
    expect(r.reason).toMatch(/at least 2/);
  });
  it("cliffsDelta is signed", () => {
    expect(cliffsDelta(0, 5, 5)).toBeCloseTo(-1);
    expect(cliffsDelta(12.5, 5, 5)).toBeCloseTo(0);
  });
  it("Fisher on fractions", () => {
    const f = compareFraction(9, 10, 1, 10);
    expect(f.p).toBeLessThan(0.01);
    expect(f.fracA).toBe(0.9);
    expect(compareFraction(0, 0, 1, 2).p).toBeNull();
  });
});

describe("compareCladeCells", () => {
  const ids = (n, p) => Array.from({ length: n }, (_, i) => `${p}${i}`);
  const A = ids(12, "a");
  const B = ids(12, "b");
  // A: 8 of 12 cycling; B: 1 of 12; the last two A cells and last B cell have DNA only
  const rnaRows = [
    ...A.slice(0, 10).map((id, i) => ({ cell_id: id, Phase: i < 6 ? "S" : i < 8 ? "G2M" : "G1", S_Score: i < 6 ? 0.5 + i / 100 : -0.2 - i / 100, G2M_Score: 0.1, state: "AC" })),
    ...B.slice(0, 11).map((id, i) => ({ cell_id: id, Phase: i === 0 ? "S" : "G1", S_Score: -0.3 - i / 100, G2M_Score: 0.05, state: i < 5 ? "AC" : "MES" })),
  ];
  const dnaCells = [
    ...A.map((id, i) => ({ cell_id: id, pc_rt_cor: i < 6 ? 0.2 : 0.02, "DNA cycle": i < 6 ? "S-phase" : "not S", ploidy: 3 })),
    ...B.map((id, i) => ({ cell_id: id, pc_rt_cor: 0.01 + i / 1000, "DNA cycle": "not S", ploidy: 2 })),
  ];
  const r = compareCladeCells({ idsA: A, idsB: B, rnaRows, dnaCells });
  it("counts cells with RNA", () => {
    expect(r.counts).toMatchObject({ nA: 12, nB: 12, rnaA: 10, rnaB: 11, overlap: 0, ploidyA: 3, ploidyB: 2 });
  });
  it("tests phase composition and the cycling fraction", () => {
    expect(r.phase.test).toBe("chi-square");
    expect(r.phase.p).toBeLessThan(0.01);
    expect(r.phase.cycling.fracA).toBeCloseTo(0.8);
    expect(r.phase.cycling.p).toBeLessThan(0.01);
    expect(r.phase.a.counts.S).toBe(6);
  });
  it("tests S.Score and uses cells without RNA for DNA S-phase", () => {
    expect(r.scores[0].delta).toBeGreaterThan(0.5);
    expect(r.scores[0].nA).toBe(10);
    expect(r.dna.rt.nA).toBe(12);
    expect(r.dna.rt.p).toBeLessThan(0.01);
    expect(r.dna.noRnaA).toBe(2);
    expect(r.dna.sCall.fracA).toBe(0.5);
  });
  it("compares state composition", () => {
    const st = r.fields.find((f) => f.field === "state");
    expect(st.levels).toEqual(["AC", "MES"]);
    expect(st.test).toBe("Fisher exact");
  });
  it("says why sections are missing rather than inventing them", () => {
    const none = compareCladeCells({ idsA: A, idsB: B, rnaRows: [], dnaCells: [] });
    expect(none.phase.reason).toMatch(/no RNA/);
    expect(none.dna.reason).toMatch(/sphase/);
    expect(none.scores[0].reason).toMatch(/no RNA/);
    const noPhase = compareCladeCells({ idsA: A, idsB: B, rnaRows: [{ cell_id: "a0", state: "AC" }], dnaCells });
    expect(noPhase.phase.reason).toMatch(/no Phase/);
  });
});

describe("selectionGroupMap", () => {
  const { selectionGroupMap } = require("./cladeCompare");
  it("splits selection vs rest", () => {
    const m = selectionGroupMap("rest", ["a", "b"], { allIds: layout.leaves, layout });
    expect([...m.entries()]).toEqual([["a", "Tree selection"], ["b", "Tree selection"], ["c", "Rest"], ["d", "Rest"], ["e", "Rest"]]);
  });
  it("splits selection vs sister clade, leaving others out", () => {
    const m = selectionGroupMap("sister", ["a", "b", "c"], { allIds: layout.leaves, tumorIds: layout.leaves, layout });
    expect(m.get("a")).toBe("Tree selection");
    expect(m.get("d")).toBe("Sister clade");
    expect(m.get("e")).toBe("Sister clade");
  });
  it("is empty when nothing is selected", () => {
    expect(selectionGroupMap("rest", [], { allIds: layout.leaves }).size).toBe(0);
  });
});
