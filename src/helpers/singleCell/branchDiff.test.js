import { cisTrans, cladeAndSister, cnaDiff, junctionDiff } from "./branchDiff";
import { buildBinIndex } from "./matrix";

const chromoBins = { 1: { startPlace: 1, endPlace: 10e6 }, 2: { startPlace: 10e6 + 1, endPlace: 20e6 } };
// one CN row from segments [chrom, start, end, value]
const row = (segs) => ({
  binIndex: buildBinIndex({ chromosome: segs.map((s) => s[0]), start: segs.map((s) => s[1]), end: segs.map((s) => s[2]) }, chromoBins),
  values: Float32Array.from(segs.map((s) => s[3])),
});
const flat = row([["1", 0, 10e6, 2], ["2", 0, 10e6, 2]]);
const gained = row([["1", 0, 4e6, 4], ["1", 4e6, 10e6, 2], ["2", 0, 10e6, 1]]);

describe("branch diff", () => {
  // root(0) -> [1, 2]; 1 -> leaves a, b; 2 -> leaves c, d
  const layout = {
    leaves: ["a", "b", "c", "d"],
    nodes: [
      { isLeaf: false, children: [1, 2], firstLeaf: 0, lastLeaf: 3 },
      { isLeaf: false, children: [3, 4], firstLeaf: 0, lastLeaf: 1 },
      { isLeaf: false, children: [5, 6], firstLeaf: 2, lastLeaf: 3 },
      { isLeaf: true, children: [], firstLeaf: 0, lastLeaf: 0 },
      { isLeaf: true, children: [], firstLeaf: 1, lastLeaf: 1 },
      { isLeaf: true, children: [], firstLeaf: 2, lastLeaf: 2 },
      { isLeaf: true, children: [], firstLeaf: 3, lastLeaf: 3 },
    ],
  };

  it("finds the clade and its sister", () => {
    expect(cladeAndSister(layout, 1)).toEqual({ clade: ["a", "b"], sister: ["c", "d"], parent: 0 });
    expect(cladeAndSister(layout, 3)).toEqual({ clade: ["a"], sister: ["b"], parent: 1 });
    expect(cladeAndSister(layout, 0).sister).toEqual([]);
    expect(cladeAndSister(layout, 99)).toBeNull();
  });

  it("merges CN differences into gain / loss segments", () => {
    const cn = { cells: ["a", "b", "c", "d"], rows: [gained, gained, flat, flat] };
    const segs = cnaDiff(cn, ["a", "b"], ["c", "d"], chromoBins);
    expect(segs.map((s) => [s.chromosome, s.type])).toEqual([
      ["1", "gain"],
      ["2", "loss"],
    ]);
    expect(segs[0].start).toBeLessThan(1e6);
    expect(segs[0].end).toBeGreaterThanOrEqual(4e6 - 1);
    expect(segs[0].end).toBeLessThan(5e6 + 2);
    expect(segs[0]).toMatchObject({ cladeCn: 4, sisterCn: 2, frac: 1 });
    expect(cnaDiff(cn, ["a"], [], chromoBins)).toEqual([]);
    // sister without profiles: compare with diploid
    const ref = cnaDiff({ cells: ["a", "b"], rows: [gained, gained] }, ["a", "b"], ["n1"], chromoBins, { referenceCn: 2 });
    expect(ref.map((x) => [x.chromosome, x.type, x.sisterCn])).toEqual([
      ["1", "gain", 2],
      ["2", "loss", 2],
    ]);
  });

  it("finds junctions gained or lost on the branch", () => {
    const junctions = {
      cells: ["a", "b", "c", "d"],
      junctions: [{ id: "j1" }, { id: "j2" }, { id: "j3" }],
      cn: [Float32Array.from([1, 0, 1]), Float32Array.from([1, 0, 1]), Float32Array.from([0, 1, 1]), Float32Array.from([0, 1, NaN])],
    };
    const d = junctionDiff(junctions, ["a", "b"], ["c", "d"]);
    expect(d.map((j) => [j.id, j.change])).toEqual([
      ["j1", "gained"],
      ["j2", "lost"],
    ]);
    expect(junctionDiff(junctions, ["a", "b"], ["zz"])).toEqual([]);
    expect(junctionDiff(junctions, ["a", "b"], ["zz"], { absentWithoutSister: true }).map((j) => j.id)).toEqual(["j1", "j3"]);
  });

  it("splits DE genes into cis and trans", () => {
    const segs = [{ gStart: 0, gEnd: 100, type: "gain" }];
    const out = cisTrans(
      [
        { gene: "A", avg_log2FC: 1 },
        { gene: "B", avg_log2FC: -1 },
        { gene: "C", avg_log2FC: 1 },
      ],
      segs,
      new Map([
        ["A", 50],
        ["B", 60],
        ["C", 500],
      ])
    );
    expect(out.map((g) => [g.gene, g.effect, g.concordant])).toEqual([
      ["A", "cis", true],
      ["B", "cis", false],
      ["C", "trans", null],
    ]);
  });
});
