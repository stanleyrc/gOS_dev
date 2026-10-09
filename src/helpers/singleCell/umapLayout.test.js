import { embeddingDomain, layoutEmbedding, quantileSorted } from "./umapLayout";

describe("umapLayout", () => {
  it("interpolates quantiles", () => {
    expect(quantileSorted([0, 10], 0.5)).toBe(5);
    expect(quantileSorted([], 0.5)).toBeNaN();
  });
  it("keeps the full extent without outliers or when not robust", () => {
    const v = Array.from({ length: 100 }, (_, i) => i);
    expect(embeddingDomain(v)).toEqual([0, 99]);
    expect(embeddingDomain([...v, 1000], { robust: false })).toEqual([0, 1000]);
  });
  it("clips a far outlier and pins it to the edge", () => {
    const pts = Array.from({ length: 300 }, (_, i) => ({ x: i % 10, y: Math.floor(i / 10) % 10 }));
    pts.push({ x: 500, y: 5 });
    const d = embeddingDomain(pts.map((p) => p.x));
    expect(d[1]).toBeLessThan(20);
    const out = layoutEmbedding(pts, { width: 400, height: 200, margin: 10 });
    expect(out[out.length - 1].clipped).toBe(true);
    expect(out[out.length - 1].px).toBeCloseTo(390);
    expect(out.filter((p) => p.clipped).length).toBe(1);
    // the bulk spans the box
    const xs = out.slice(0, 300).map((p) => p.px);
    expect(Math.min(...xs)).toBeCloseTo(10);
    expect(Math.max(...xs)).toBeGreaterThan(300);
  });
  it("pins a small far island (a few % of cells beyond a big gap)", () => {
    const bulk = Array.from({ length: 500 }, (_, i) => (i % 50) / 10); // 0..4.9
    const island = Array.from({ length: 20 }, () => 20); // 4% of cells, far right
    const d = embeddingDomain([...bulk, ...island]);
    expect(d[1]).toBeLessThan(6);
  });
});
