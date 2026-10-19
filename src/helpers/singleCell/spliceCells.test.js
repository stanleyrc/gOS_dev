import { bySummary, cellsInRect, classifyCells, clusterCellSummary, focusJunctions, keysByPatient, orderCells, patientCellTables, pooledCounts, spliceGroupName, stripLayout } from "./spliceCells";

// cluster: junction 0 annotated (long), junction 1 novel acceptor (alt 3' inclusion side)
const cluster = { junctions: [{ annotated: true, type: "annotated" }, { annotated: false, type: "novel_acceptor" }], usage: { A: { counts: [100, 5] }, B: { counts: [50, 0] } } };
const alt3 = { type: "alt3", junctions: { incl: [1], skip: [0] } };
const cassette = { type: "cassette", junctions: { incl: [0, 2], skip: [1] } };

describe("focusJunctions", () => {
  it("uses the side with the non-annotated junction", () => {
    expect(focusJunctions(cluster, alt3)).toMatchObject({ side: "incl", ks: [1], otherKs: [0] });
    expect(focusJunctions({ junctions: [{ type: "annotated" }, { annotated: false, type: "exon_skip" }, { type: "annotated" }] }, cassette)).toMatchObject({ side: "skip", ks: [1], label: "exon skipping" });
  });
  it("falls back to the rarer side", () => {
    const cl = { junctions: [{ type: "annotated" }, { type: "annotated" }, { type: "annotated" }] };
    expect(focusJunctions(cl, cassette, [90, 10, 80]).side).toBe("skip");
    expect(focusJunctions(cl, cassette, [5, 100, 5]).side).toBe("incl");
  });
  it("handles a cluster without an event", () => {
    expect(focusJunctions(cluster, null).ks).toEqual([1]);
  });
  it("pools usage counts", () => {
    expect(pooledCounts(cluster)).toEqual([150, 5]);
  });
});

describe("pinned focus", () => {
  it("uses the pinned junction against its reference, whatever the pooled counts", () => {
    const ev = { type: "junction", variant: "V", focus: [1], junctions: { incl: [1], skip: [0] } };
    expect(focusJunctions(cluster, ev)).toMatchObject({ side: "incl", ks: [1], otherKs: [0] });
  });
});

describe("classifyCells", () => {
  const focus = focusJunctions(cluster, alt3);
  const cells = { u1: [0, 8], u2: [2, 1], cov: [5, 0], thin: [1, 0], none: [0, 0] };
  it("splits using / covered-not-using and drops uncovered cells", () => {
    const rows = classifyCells(cells, focus);
    expect(rows.map((r) => r.id).sort()).toEqual(["cov", "u1", "u2"]);
    expect(rows.find((r) => r.id === "u1")).toMatchObject({ using: true, covered: true, frac: 1 });
    expect(rows.find((r) => r.id === "u2")).toMatchObject({ using: true, covered: true });
    expect(rows.find((r) => r.id === "cov").using).toBe(false);
  });
  it("orders by state then clone then use", () => {
    const rows = classifyCells(cells, focus);
    const meta = { u1: { state: "AC", clone: "c2" }, u2: { state: "AC", clone: "c1" }, cov: { state: "MES" } };
    expect(orderCells(rows, (id) => meta[id]).map((r) => r.id)).toEqual(["u2", "u1", "cov"]);
  });
});

describe("patient tables and summary", () => {
  const focus = focusJunctions(cluster, alt3);
  const data = { A: { cells: { a1: [0, 4], a2: [0, 3], a3: [0, 9], a4: [7, 0] } }, B: { cells: { b1: [0, 3] } }, C: null };
  const clusterOf = (p) => data[p];
  it("builds per-patient rows and flags missing patients", () => {
    const t = patientCellTables(["A", "B", "C"], clusterOf, focus, () => null);
    expect(t[0]).toMatchObject({ using: 3, covered: 4 });
    expect(t[0].rows[0].key).toMatch(/^A::/);
    expect(t[2].rows).toBeNull();
  });
  it("summarises cells using and patients with >= 3 cells", () => {
    expect(clusterCellSummary(["A", "B", "C"], clusterOf, focus)).toEqual({ cellsUsing: 4, patientsWith: 1, missing: 1 });
  });
  it("sorts by patients then cells, missing last", () => {
    const rows = [null, { patientsWith: 1, cellsUsing: 9 }, { patientsWith: 2, cellsUsing: 3 }, { patientsWith: 2, cellsUsing: 5 }];
    expect([...rows].sort(bySummary).map((r) => r && `${r.patientsWith}/${r.cellsUsing}`)).toEqual(["2/5", "2/3", "1/9", null]);
  });
});

describe("strip layout and selection", () => {
  const tables = [
    { patient: "A", rows: Array.from({ length: 5 }, (_, i) => ({ key: `A::${i}` })) },
    { patient: "B", rows: null },
  ];
  const lay = stripLayout(tables, 150 + 3 * 9.5 + 1, { cell: 8, gap: 1.5, labelW: 150 });
  it("wraps cells and stacks patients", () => {
    expect(lay.per).toBe(3);
    expect(lay.blocks[0].cells[3].y).toBeGreaterThan(lay.blocks[0].cells[0].y);
    expect(lay.blocks[1].y).toBeGreaterThan(lay.blocks[0].y + lay.blocks[0].h - 1);
  });
  it("selects cells under a rectangle in any corner order", () => {
    const c0 = lay.blocks[0].cells[0];
    expect(cellsInRect(lay, { x0: c0.x - 1, y0: c0.y - 1, x1: c0.x + 3, y1: c0.y + 3 })).toEqual(["A::0"]);
    expect(cellsInRect(lay, { x0: 0, y0: 0, x1: 1000, y1: 1000 })).toHaveLength(5);
    expect(cellsInRect(lay, { x1: 10, y1: 10, x0: 0, y0: 0 })).toEqual([]);
  });
  it("groups keys by patient and names a group", () => {
    expect(keysByPatient(new Set(["A::x", "A::y", "B::z"]))).toEqual({ A: ["x", "y"], B: ["z"] });
    expect(spliceGroupName("TP53", "exon 10", "incl")).toBe("TP53 exon 10 using");
    expect(spliceGroupName("EGFR", "EGFRvIII", "incl")).toBe("EGFRvIII using");
  });
});
