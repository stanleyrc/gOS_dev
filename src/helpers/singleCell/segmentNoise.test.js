import { buildBinIndex } from "./matrix";
import { segmentNoise } from "./segmentNoise";

describe("segmentNoise", () => {
  const chromoBins = { 1: { chromosome: "1", startPoint: 1, endPoint: 10e6, startPlace: 1, endPlace: 10e6 } };
  const binIndex = buildBinIndex({ chromosome: ["1", "1", "1", "1"], start: [1, 4e6, 4.2e6, 6e6], end: [4e6 - 1, 4.2e6 - 1, 6e6 - 1, 10e6] }, chromoBins);
  it("flags a single narrow dip between normal flanks", () => {
    const cn = { cells: ["c1"], rows: [{ binIndex, values: Float32Array.from([2, 0, 2, 2]) }] };
    const r = segmentNoise(cn, { globalPosition: 4.1e6, carriers: ["c1"] });
    expect(r.medianWidthBp).toBe(2e5);
    expect(r.medianFlankCn).toBe(2);
    expect(r.narrow).toBe(true);
  });
  it("merges adjacent segments of the same state", () => {
    const cn = { cells: ["c1"], rows: [{ binIndex, values: Float32Array.from([2, 0, 0, 2]) }] };
    const r = segmentNoise(cn, { globalPosition: 4.1e6, carriers: ["c1"] });
    expect(r.medianWidthBp).toBe(2e6);
    expect(r.narrow).toBe(false);
  });
});
