import {
  carrierCount,
  cellWalkLines,
  cloneSummary,
  columnMax,
  columnValue,
  columnWidths,
  familyLabel,
  groupValues,
  walkColumnBlocks,
} from "./walkCopies";

const ids = ["a", "b", "c", "d", "e", "f"];
const sEGFR = { id: "1", label: "sEGFR", genes: ["EGFR"], driver_genes: ["EGFR"], cells: { a: 40, b: 50, c: 30, d: 20, e: 10 } };
const wEGFR = { id: "2", label: "wEGFR", genes: ["EGFR", "LANCL2"], cells: { a: 10, b: 0, c: 5, d: 8 } };
const rec1 = { id: "3", label: "recombine1", genes: [], cells: { a: 36 } };
const rec2 = { id: "4", label: "recombine2", genes: [], cells: { b: 27, c: 3 } };
const MAP3K1 = { id: "5", label: "MAP3K1", genes: ["MAP3K1"], cells: { e: 13, f: 12 } };

describe("walk copies panel helpers", () => {
  it("counts carriers ignoring zeros and missing cells", () => {
    expect(carrierCount(wEGFR, ids)).toBe(3);
    expect(carrierCount(rec1, ids)).toBe(1);
  });

  it("names a family by its most prevalent walk's gene", () => {
    expect(familyLabel([rec1, sEGFR], (w) => carrierCount(w, ids))).toBe("EGFR");
    expect(familyLabel([rec1], () => 1)).toBe("recombine1");
    expect(familyLabel([{ id: "x", label: "Other 1", cells: {} }, { id: "y", label: "MDM2 1", cells: {} }], () => 1)).toBe("MDM2 1");
    // the gene shared most widely wins over one walk's first gene
    expect(familyLabel([{ id: "x", label: "a", genes: ["GLI1", "CDK4"] }, { id: "y", label: "b", genes: ["CDK4"] }], () => 1)).toBe("CDK4");
  });

  it("builds a total, common and rare column per family", () => {
    const blocks = walkColumnBlocks([[sEGFR, wEGFR, rec1, rec2], [MAP3K1]], ids, { rareMax: 2 });
    expect(blocks).toHaveLength(2);
    expect(blocks[0].label).toBe("EGFR");
    expect(blocks[0].columns.map((c) => c.type)).toEqual(["total", "walk", "walk", "rare"]);
    expect(blocks[0].columns[1].walks[0].label).toBe("sEGFR");
    expect(blocks[0].columns[3].walks.map((w) => w.label)).toEqual(["recombine2", "recombine1"]);
    expect(blocks[0].columns[0].carriers).toBe(5);
    // a single-walk family: no total column; a family of only rare walks keeps one as a column
    expect(blocks[1].columns.map((c) => c.type)).toEqual(["walk"]);
    const onlyRare = walkColumnBlocks([[rec1, rec2]], ids, { rareMax: 3 });
    expect(onlyRare[0].columns.map((c) => c.type)).toEqual(["total", "walk", "rare"]);
  });

  it("computes cell and group values", () => {
    const [egfr] = walkColumnBlocks([[sEGFR, wEGFR, rec1, rec2]], ids, { rareMax: 2 });
    const [total, , , rare] = egfr.columns;
    expect(columnValue(total, "a")).toBe(86);
    expect(columnValue(rare, "c")).toBe(1);
    expect(columnValue(rare, "f")).toBe(0);
    const g = groupValues(total, ["a", "b"]);
    expect(g.total).toBeCloseTo((86 + 77) / 2);
    expect(groupValues(rare, ["a", "b", "e", "f"]).total).toBe(0.5);
    expect(columnMax(total, ids.map((id) => ({ ids: [id] })))).toBe(86);
  });

  it("sizes columns by prevalence with a minimum and fixed rare columns", () => {
    const blocks = walkColumnBlocks([[sEGFR, wEGFR, rec1, rec2], [MAP3K1]], ids, { rareMax: 2 });
    const w = columnWidths(blocks, 600, ids.length, { min: 44, gap: 0, blockGap: 0 });
    expect(w).toHaveLength(5);
    expect(w[3]).toBe(26); // two rare walks: max(26, 2 * 9)
    w.forEach((x) => expect(x).toBeGreaterThanOrEqual(26));
    expect(w[0]).toBeGreaterThan(w[2]); // total (5 carriers) wider than wEGFR (3)
    expect(w.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(600);
    // tiny width: everything at its minimum
    const tight = columnWidths(blocks, 50, ids.length, { min: 44, gap: 0, blockGap: 0 });
    expect(tight.filter((x, i) => i !== 3).every((x) => x === 44)).toBe(true);
  });

  it("summarises clones over measured cells", () => {
    const blocks = walkColumnBlocks([[sEGFR, wEGFR]], ids, { rareMax: 0 });
    const clone = { a: "1", b: "1", c: "1", d: "2", e: "2", f: "2" };
    const rows = cloneSummary(blocks, ids, (id) => clone[id], (id) => id !== "f");
    expect(rows.map((r) => [r.clone, r.n, r.measured])).toEqual([["1", 3, 3], ["2", 3, 2]]);
    const s1 = rows[0].stats.find((s) => s.key === "walk:1");
    expect(s1.fraction).toBe(1);
    expect(s1.median).toBe(40);
    const w2 = rows[1].stats.find((s) => s.key === "walk:2");
    expect(w2.fraction).toBe(0.5);
    expect(w2.median).toBe(8);
  });

  it("lists a cell's walks by copies", () => {
    expect(cellWalkLines([sEGFR, wEGFR, rec1], "a").map((r) => r.label)).toEqual(["sEGFR", "recombine1", "wEGFR"]);
    expect(cellWalkLines([sEGFR], "f")).toEqual([]);
  });
});
