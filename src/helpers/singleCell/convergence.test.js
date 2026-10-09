import { armsFromCytobands, convergentEvents, eventCarriers } from "./convergence";
import { buildBinIndex } from "./matrix";

const chromoBins = { 1: { startPlace: 1, endPlace: 100e6 }, 2: { startPlace: 100e6 + 1, endPlace: 200e6 } };
const cyto = [
  { chromosome: "1", startPoint: 0, endPoint: 40e6, stain: "gneg" },
  { chromosome: "1", startPoint: 40e6, endPoint: 45e6, stain: "acen" },
  { chromosome: "1", startPoint: 45e6, endPoint: 100e6, stain: "gneg" },
  { chromosome: "2", startPoint: 0, endPoint: 100e6, stain: "gneg" },
];
const row = (segs) => ({
  binIndex: buildBinIndex({ chromosome: segs.map((s) => s[0]), start: segs.map((s) => s[1]), end: segs.map((s) => s[2]) }, chromoBins),
  values: Float32Array.from(segs.map((s) => s[3])),
});

describe("convergence", () => {
  it("builds arms from cytobands", () => {
    const arms = armsFromCytobands(cyto, chromoBins);
    expect(arms.map((a) => a.name)).toEqual(["1p", "1q", "2"]);
    expect(arms[1].gStart).toBe(1 + 45e6);
  });

  it("calls arm gains / losses and focal events per cell", () => {
    const arms = armsFromCytobands(cyto, chromoBins);
    const cn = {
      cells: ["a", "b"],
      rows: [
        row([["1", 0, 40e6, 3], ["1", 40e6, 100e6, 2], ["2", 0, 100e6, 2]]),
        row([["1", 0, 100e6, 2], ["2", 0, 50e6, 2], ["2", 50e6, 51e6, 12], ["2", 51e6, 100e6, 2]]),
      ],
    };
    const ev = eventCarriers(cn, arms, new Map([["EGFR", 100e6 + 50.5e6]]), ["EGFR"]);
    expect([...ev.get("1p gain")]).toEqual(["a"]);
    expect([...ev.get("EGFR amp")]).toEqual(["b"]);
    expect(ev.has("2 gain")).toBe(false);
  });

  it("finds independent hits whose ancestor lacks the event", () => {
    // root -> [A (a1 a2 a3 | x1 x2 x3), B (b1 b2 b3 | y1 y2 y3)]; event in a* and b* only
    const leaves = ["a1", "a2", "a3", "x1", "x2", "x3", "b1", "b2", "b3", "y1", "y2", "y3"];
    const nodes = [
      { children: [1, 2], firstLeaf: 0, lastLeaf: 11 },
      { children: [3, 4], firstLeaf: 0, lastLeaf: 5 },
      { children: [5, 6], firstLeaf: 6, lastLeaf: 11 },
      { children: [], firstLeaf: 0, lastLeaf: 2 },
      { children: [], firstLeaf: 3, lastLeaf: 5 },
      { children: [], firstLeaf: 6, lastLeaf: 8 },
      { children: [], firstLeaf: 9, lastLeaf: 11 },
    ];
    const layout = { leaves, nodes };
    const carriers = new Map([
      ["10q loss", new Set(["a1", "a2", "a3", "b1", "b2", "b3"])],
      ["7 gain", new Set(leaves)],
    ]);
    const res = convergentEvents(layout, carriers);
    expect(res).toHaveLength(1);
    expect(res[0].event).toBe("10q loss");
    expect(res[0].hits.map((h) => h.node)).toEqual([3, 5]);
    expect(res[0].lcaNode).toBe(0);
    expect(res[0].lcaFrac).toBeCloseTo(0.5);
    expect(convergentEvents(layout, carriers, { maxLcaFrac: 0.4 })).toHaveLength(0);
  });
});
