import { effectiveTracks, hetBlockSummary, hetBlocksToGraph, parseHetMode, storedTrack } from "./hetTracks";

const raw = {
  blocks: [
    { chr: "10", start: 1, end: 100, major_cn: 2, minor_cn: 0, expected_maf: 0, maf: 0.02, maf_lo: 0, maf_hi: 0.08, n_snps_d2: 40 },
    { chr: "1", start: 1, end: 50, major_cn: 1, minor_cn: 1, expected_maf: 0.5, maf: null, maf_lo: null, maf_hi: null, n_snps_d2: 1 },
    { chr: "2", start: 1, end: 50, major_cn: 1, minor_cn: 1, expected_maf: 0.5, maf: 0.47, maf_lo: 0.4, maf_hi: 0.5, n_snps_d2: 30 },
  ],
};

test("parseHetMode only accepts blocks", () => {
  expect(parseHetMode("blocks")).toBe("blocks");
  expect(parseHetMode("x")).toBe("snps");
  expect(parseHetMode(null)).toBe("snps");
});

test("het SNPs map to het blocks only in block mode", () => {
  expect(effectiveTracks(["total", "hetsnps"], "blocks")).toEqual(["total", "hetblocks"]);
  expect(effectiveTracks(["total", "hetsnps"], "snps")).toEqual(["total", "hetsnps"]);
  expect(storedTrack("coverage", "blocks")).toBe("coverage");
});

test("hetBlocksToGraph draws MAF + CI per estimated block and the expected overlay for all", () => {
  const g = hetBlocksToGraph(raw);
  expect(g.intervals).toHaveLength(4 + 1 + 4);
  const chr10 = g.intervals.filter((i) => i.chromosome === "10").map((i) => i.y);
  expect(chr10).toEqual(expect.arrayContaining([0, 0.02, 0.08]));
  expect(g.intervals.filter((i) => i.chromosome === "1")).toHaveLength(1);
  expect(new Set(g.intervals.map((i) => i.iid)).size).toBe(g.intervals.length);
});

test("hetBlocksToGraph tolerates an empty file", () => {
  expect(hetBlocksToGraph(null).intervals).toEqual([]);
});

test("hetBlockSummary counts imbalanced blocks", () => {
  expect(hetBlockSummary(raw)).toEqual({ blocks: 3, estimated: 2, imbalanced: 1 });
});
