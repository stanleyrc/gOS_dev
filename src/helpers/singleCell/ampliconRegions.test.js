import { ampliconRegions, parseCoordinates } from "./ampliconRegions";

// synthetic genome and walks only
const chromoBins = { 1: { startPlace: 1, endPlace: 1000000 }, 2: { startPlace: 1000001, endPlace: 3000000 } };
const walk = (coordinates, genes = [], driver_genes = "") => ({ coordinates, genes, driver_genes });

describe("ampliconRegions", () => {
  it("parses coordinate strings", () => {
    expect(parseCoordinates("chr1:10-20;2:5-3")).toEqual([{ chr: "1", start: 10, end: 20 }, { chr: "2", start: 3, end: 5 }]);
    expect(parseCoordinates("")).toEqual([]);
  });
  it("merges overlapping and adjacent intervals, pads, labels with driver genes, orders by genome position", () => {
    const r = ampliconRegions([walk("2:1000-5000;2:4000-9000", ["G1", "G2"], "G2"), walk("1:200000-260000", ["A"]), walk("2:700000-720000")], chromoBins);
    expect(r.regions.map((x) => [x.chr, x.label])).toEqual([["1", "A"], ["2", "G2"], ["2", "chr2:0.7 Mb"]]);
    expect(r.domains).toHaveLength(3);
    expect(r.domains[0][0]).toBeLessThan(200000);
    expect(r.domains[0][1]).toBeGreaterThan(260000);
    expect(r.domains[1][0]).toBeGreaterThanOrEqual(1000001);
    r.domains.forEach(([a, b]) => expect(b).toBeGreaterThan(a));
    expect(r.domains.map((d) => d[0])).toEqual([...r.domains.map((d) => d[0])].sort((a, b) => a - b));
  });
  it("widens the merge gap to stay within maxRegions", () => {
    const segs = Array.from({ length: 10 }, (_, k) => `1:${k * 200000 + 1000}-${k * 200000 + 2000}`).join(";");
    expect(ampliconRegions([walk(segs)], chromoBins, { maxRegions: 12 }).domains.length).toBeGreaterThan(1);
    expect(ampliconRegions([walk(segs)], chromoBins, { maxRegions: 2 }).domains.length).toBeLessThanOrEqual(2);
  });
  it("says why there are no regions", () => {
    expect(ampliconRegions([], chromoBins).reason).toMatch(/no amplicon/);
    expect(ampliconRegions([walk("9:1-5")], chromoBins).reason).toMatch(/no coordinates/);
    expect(ampliconRegions([walk("1:1-5")], null).reason).toMatch(/not loaded/);
  });
});
