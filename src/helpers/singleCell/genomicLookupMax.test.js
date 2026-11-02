import { buildBinIndex, genomicColumnLookup, genomicColumnLookupMax } from "./matrix";

// synthetic segments of one cell on one chromosome: CN 2 background, a 90 bp CN 72 spike and a 55 kb CN 77 piece
const chromoBins = { 1: { startPlace: 1, endPlace: 1000000 } };
const bins = { chromosome: ["1", "1", "1", "1", "1"], start: [0, 100000, 100090, 400000, 455000], end: [99999, 100089, 399999, 454999, 1000000] };
const values = Float32Array.from([2, 72, 2, 77, 2]);

describe("genomicColumnLookupMax", () => {
  const bi = buildBinIndex(bins, chromoBins);
  it("keeps a focal segment narrower than a pixel that the centre rule misses", () => {
    const centre = genomicColumnLookup(bi, [[1, 1000000]], 100).cols; // 10 kb per pixel
    const max = genomicColumnLookupMax(bi, values, [[1, 1000000]], 100).cols;
    const valuesAt = (cols) => Array.from(cols, (b) => (b < 0 ? null : values[b]));
    expect(valuesAt(centre)).not.toContain(72);
    expect(valuesAt(max)).toContain(72);
    expect(valuesAt(max)).toContain(77);
  });
  it("agrees with the centre rule where segments are wider than a pixel", () => {
    const centre = genomicColumnLookup(bi, [[1, 1000000]], 100).cols;
    const max = genomicColumnLookupMax(bi, values, [[1, 1000000]], 100).cols;
    const same = Array.from(centre).filter((b, x) => b === max[x]).length;
    expect(same).toBeGreaterThan(95);
  });
});
