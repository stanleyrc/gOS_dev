import { crossStratumDE, selectionComposition } from "./cohortContrast";

describe("selectionComposition", () => {
  it("shares and enrichment of each level among selected cells", () => {
    const cells = [
      ...Array.from({ length: 8 }, (_, i) => ({ key: `n${i}`, level: "NPC" })),
      ...Array.from({ length: 8 }, (_, i) => ({ key: `m${i}`, level: "MES" })),
    ];
    const sel = new Set(["n0", "n1", "n2", "n3", "n4", "n5"]);
    const out = selectionComposition(cells, sel);
    const npc = out.find((r) => r.level === "NPC");
    expect(npc.sel).toBe(6);
    expect(npc.fracSel).toBe(1);
    expect(npc.ratio).toBeCloseTo(2);
    expect(npc.p).toBeLessThan(0.05);
  });
});

/** gene-major CSC from a dense [gene][cell] array */
const csc = (dense) => {
  const indptr = [0];
  const indices = [];
  const data = [];
  dense.forEach((row) => {
    row.forEach((v, c) => {
      if (v) {
        indices.push(c);
        data.push(v);
      }
    });
    indptr.push(indices.length);
  });
  return { indptr: Int32Array.from(indptr), indices: Int32Array.from(indices), data: Float32Array.from(data) };
};

describe("crossStratumDE", () => {
  // two patients with different gene orders; UP is higher in A in both, PAT is only a patient effect
  const p1 = { key: "P1", genes: ["UP", "PAT"], matrix: csc([[3, 3.1, 3.2, 3, 0.2, 0.3, 0.2, 0.1], [0, 0, 0, 0, 0, 0, 0, 0]]), rowsA: [0, 1, 2, 3], rowsB: [4, 5, 6, 7] };
  const p2 = { key: "P2", genes: ["PAT", "UP"], matrix: csc([[2, 2, 2, 2, 2, 2, 2, 2], [2.9, 3, 3.3, 3.1, 0.1, 0.2, 0.3, 0.1]]), rowsA: [0, 1, 2, 3], rowsB: [4, 5, 6, 7] };
  it("combines patients by gene name", async () => {
    const { rows, strata } = await crossStratumDE([p1, p2]);
    expect(strata).toHaveLength(2);
    const up = rows.find((r) => r.gene === "UP");
    expect(up.nStrata).toBe(2);
    expect(up.z).toBeGreaterThan(2.5);
    expect(rows.find((r) => r.gene === "PAT").p_val).toBeGreaterThan(0.5);
  });
  it("skips patients without enough cells in each group", async () => {
    const { strata } = await crossStratumDE([p1, { ...p2, rowsA: [0] }]);
    expect(strata.map((s) => s.key)).toEqual(["P1"]);
  });
});
