import { alteredFraction, noiseFloor, normalLikeness, normalNeighbourFraction } from "./controls";
import { buildBinIndex } from "./matrix";

describe("non-tumour controls", () => {
  const chromoBins = { 1: { startPlace: 1, endPlace: 10e6 }, 2: { startPlace: 10e6 + 1, endPlace: 20e6 } };
  const row = (segs) => ({
    binIndex: buildBinIndex({ chromosome: segs.map((s) => s[0]), start: segs.map((s) => s[1]), end: segs.map((s) => s[2]) }, chromoBins),
    values: Float32Array.from(segs.map((s) => s[3])),
  });

  it("measures the altered fraction of the genome against the cell's baseline", () => {
    const cn = {
      cells: ["n", "t"],
      rows: [row([["1", 0, 10e6, 2], ["2", 0, 10e6, 2]]), row([["1", 0, 10e6, 2], ["2", 0, 5e6, 2], ["2", 5e6, 10e6, 3]])],
    };
    const f = alteredFraction(cn, chromoBins);
    expect(f.get("n")).toBe(0);
    expect(f.get("t")).toBeCloseTo(0.25, 1);
  });

  it("summarises metrics in normal and tumour cells", () => {
    const cells = [
      { cell_id: "a", clone_id: "Normal", x: 1 },
      { cell_id: "b", clone_id: "Normal", x: 3 },
      { cell_id: "c", clone_id: "C1", x: 10 },
    ];
    const r = noiseFloor(cells, [{ key: "x" }], (c) => c.clone_id === "Normal");
    expect(r[0]).toMatchObject({ normal: 2, tumour: 10, nNormal: 2, nTumour: 1 });
  });

  it("scores cells by similarity to the normal vs tumour centroid", () => {
    // 3 genes; normals high on gene 0, tumour high on gene 2; query row 4 looks normal
    const X = Float32Array.from([5, 0, 0, 5, 1, 0, 0, 1, 5, 0, 0, 6, 4, 1, 0]);
    const out = normalLikeness(X, 3, [0, 1], [2, 3], [2, 4]);
    expect(out[0].score).toBeLessThan(0);
    expect(out[1].score).toBeGreaterThan(0);
  });

  it("counts normal cells among each query cell's nearest neighbours", () => {
    // 1-D: normals at 0, 0.1, 0.2; tumour at 5, 5.1, 5.2; query 0.15 (tumour by DNA) sits among normals
    const P = [Float64Array.from([0, 0.1, 0.2, 5, 5.1, 5.2, 0.15])];
    const out = normalNeighbourFraction(P, [0, 1, 2], [3, 4, 5, 6], [6, 3], 2);
    expect(out[0].fraction).toBe(1);
    expect(out[1].fraction).toBe(0);
  });
});
