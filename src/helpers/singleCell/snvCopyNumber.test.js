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

describe("snvCopyNumber allelic", () => {
  it("reports LOH and the allele carrying the mutation", () => {
    const { buildBinIndex } = require("./matrix");
    const { snvCopyNumber } = require("./snvCopyNumber");
    const chromoBins = { 1: { chromosome: "1", startPoint: 1, endPoint: 1000, startPlace: 1, endPlace: 1000 } };
    const binIndex = buildBinIndex({ chromosome: ["1"], start: [1], end: [1000] }, chromoBins);
    const cn = { cells: ["c1", "c2"], rows: [{ binIndex, values: Float32Array.from([3]) }, { binIndex, values: Float32Array.from([3]) }] };
    const allelic = { cells: ["c1", "c2"], rows: [{ binIndex, major: Float32Array.from([3]), minor: Float32Array.from([0]) }, { binIndex, major: Float32Array.from([2]), minor: Float32Array.from([1]) }] };
    const snv = { cells: ["c1", "c2"], variants: [{ id: "a", global: 500 }], status: [[1], [1]], alt: [[30], [20]], depth: [[30], [30]] };
    const [r] = snvCopyNumber(snv, cn, { allelic });
    expect(r.allelic.n).toBe(2);
    expect(r.allelic.nLoh).toBe(1);
    expect(r.allelic.nOnMajor).toBe(2); // 3 of 3 copies and 2 of 3 copies
    expect(r.allelic.mutantAmplified).toBe(true);
  });
});
