import { buildBinIndex } from "./matrix";
import { snvCopyNumber } from "./snvCopyNumber";

describe("snvCopyNumber", () => {
  const chromoBins = { 1: { chromosome: "1", startPoint: 1, endPoint: 1000, startPlace: 1, endPlace: 1000 } };
  const binIndex = buildBinIndex({ chromosome: ["1", "1"], start: [1, 501], end: [500, 1000] }, chromoBins);
  const cn = { cells: ["c1", "c2"], rows: [{ binIndex, values: Float32Array.from([2, 8]) }, { binIndex, values: Float32Array.from([2, 8]) }] };
  const snv = {
    cells: ["c1", "c2"],
    variants: [{ global: 100 }, { global: 700 }],
    status: [[1, 1], [1, 1]],
    alt: [[5, 20], [4, 2]],
    depth: [[10, 40], [10, 40]],
  };
  it("flags SNVs on amplified segments with several mutant copies", () => {
    const out = snvCopyNumber(snv, cn);
    expect(out[0].medianCn).toBe(2);
    expect(out[0].amplified).toBe(false);
    expect(out[1].medianCn).toBe(8);
    // alt copies: c1 20/40*8 = 4, c2 2/40*8 = 0.4 -> median 2.2
    expect(out[1].altCopies).toBeCloseTo(2.2);
    expect(out[1].amplified).toBe(true);
  });
});

describe("amplificationTiming", () => {
  it("splits SNVs on an amplicon by mutant copies", () => {
    const { buildBinIndex } = require("./matrix");
    const { amplificationTiming } = require("./snvCopyNumber");
    const chromoBins = { 1: { chromosome: "1", startPoint: 1, endPoint: 1000, startPlace: 1, endPlace: 1000 } };
    const binIndex = buildBinIndex({ chromosome: ["1", "1"], start: [1, 501], end: [500, 1000] }, chromoBins);
    const cn = { cells: ["c1"], rows: [{ binIndex, values: Float32Array.from([2, 8]) }] };
    const snv = { cells: ["c1"], variants: [{ id: "a", global: 600 }, { id: "b", global: 700 }, { id: "c", global: 100 }], status: [[1, 1, 1]], alt: [[20, 2, 5]], depth: [[40, 40, 10]] };
    const r = amplificationTiming(snv, cn, { globalPosition: 650, carriers: ["c1"] });
    expect(r.nSites).toBe(2);
    expect(r.sites.find((s) => s.id === "a").pre).toBe(true); // 4 copies
    expect(r.sites.find((s) => s.id === "b").pre).toBe(false); // 0.4 copies
    expect(r.preFraction).toBeCloseTo(0.5);
  });
});
