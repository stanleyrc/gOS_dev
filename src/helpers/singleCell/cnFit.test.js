import {
  allelicFit, blockMeanCn, blockMedian, cladePloidyRows, evenSample, fitCurve, histogram, integerFit, normalise,
  ploidySummary, poolByPosition, poolNormalised, segmentMeans, solutionOf, stateMean, weightedHistogram, cnAt,
} from "./cnFit";

describe("cnFit", () => {
  it("solution maps mean 1 to the ploidy and inverts through stateMean", () => {
    const sol = solutionOf(3, 1);
    expect(cnAt(sol, 1)).toBeCloseTo(3);
    expect(stateMean(sol, 3)).toBeCloseTo(1);
    const imp = solutionOf(3, 0.5);
    expect(cnAt(imp, 1)).toBeCloseTo(3);
    expect(imp.intercept).toBeCloseTo(-2);
    expect(stateMean(imp, 2)).toBeCloseTo((2 + 2) / 5);
    expect(solutionOf(0, 1)).toBeNull();
    expect(solutionOf(2, 1.2)).toBeNull();
  });

  it("normalises to mean 1 and drops invalid bins", () => {
    const { m, mean } = normalise([2, 4, NaN, -1, 0, 6]);
    expect(mean).toBeCloseTo(4);
    expect(m).toEqual([0.5, 1, 1.5]);
    expect(normalise([NaN]).mean).toBeNull();
  });

  it("block median, histogram", () => {
    expect(blockMedian([1, 9, 5, 2, 2, 8], 3)).toEqual([5, 2]);
    expect(blockMedian([1, 2, 3], 1)).toEqual([1, 2, 3]);
    const h = histogram([0.1, 0.2, 0.9, 5], 0, 1, 2);
    expect(h.counts).toEqual([2, 1]);
  });

  it("integer fit is 1 on an exact lattice and the ploidy curve peaks at the true scale", () => {
    // synthetic diploid-like cell: CN states 1, 2, 3 at ploidy 2 -> m = cn / mean
    const cn = [];
    for (let i = 0; i < 40; i += 1) cn.push(1, 2, 2, 2, 3);
    const mean = cn.reduce((a, b) => a + b, 0) / cn.length;
    const m = cn.map((v) => v / mean);
    expect(integerFit(m, solutionOf(mean, 1))).toBe(1);
    const curve = fitCurve(m, 1, 1, 4, 0.05);
    const best = curve.reduce((a, b) => (b.fit > a.fit ? b : a));
    expect(best.fit).toBe(1);
    expect(integerFit(m, solutionOf(mean * 1.5, 1))).toBeLessThan(1);
    expect(integerFit([], solutionOf(2, 1))).toBeNull();
  });

  it("allelic fit penalises totals that cannot give the observed MAF", () => {
    const blocks = [
      { x0: 1, x1: 100, maf: 0.5, n_snps_d2: 100 },
      { x0: 101, x1: 200, maf: 0.01, n_snps_d2: 100 },
      { x0: 201, x1: 300, maf: 0.4, n_snps_d2: 5 },
    ];
    const good = allelicFit(blocks, (b) => (b.maf > 0.1 ? 2 : 2));
    expect(good.blocks).toBe(2);
    expect(good.gap).toBeCloseTo(0.005);
    const odd = allelicFit(blocks, () => 3); // 3 -> minor 0 or 1/3: 0.5 is 0.167 away
    expect(odd.gap).toBeGreaterThan(good.gap);
    expect(odd.within).toBeCloseTo(0.5);
    expect(allelicFit([], () => 2)).toBeNull();
  });

  it("block mean cn over a coordinate window", () => {
    expect(blockMeanCn([1, 2, 3, 4], [1, 2, 3, 4], 2, 3)).toBe(2.5);
    expect(blockMeanCn([1, 2], [1, 2], 5, 9)).toBeNull();
  });

  it("segment means and weighted histogram", () => {
    const sol = solutionOf(2, 1);
    const pts = segmentMeans([{ y: 2, startPoint: 1, endPoint: 100 }, { y: 4, startPoint: 1, endPoint: 100 }, { y: NaN }], sol);
    expect(pts).toEqual([{ m: 1, w: 100 }, { m: 2, w: 100 }]);
    expect(weightedHistogram(pts, 0, 4, 4)).toEqual([0, 0.5, 0.5, 0]);
  });

  it("pools equal-length cells and reports skipped ones", () => {
    const p = poolNormalised([[1, 3], [3, 1], [1, 1, 1], null]);
    expect(p.m).toEqual([2, 2]);
    expect(p.used).toBe(2);
    expect(p.skipped).toBe(2);
    expect(evenSample([1, 2, 3, 4, 5, 6], 3)).toEqual([1, 3, 5]);
    expect(evenSample([1, 2], 5)).toEqual([1, 2]);
  });

  it("pools cells with different bin sets by position", () => {
    const a = { x: [1, 2, 3, 4], y: [2, 2, 2, 2] };
    const b = { x: [1, 2, 3, 4], y: [1, NaN, 3, 4] };
    const c = { x: [1, 2, 3, 4], y: [4, 4, NaN, 4] };
    const p = poolByPosition([a, b, c], 0.6);
    expect(p.used).toBe(3);
    expect(p.x).toEqual([1, 2, 3, 4]); // each bin is in at least 2 of 3 cells
    expect(p.m.reduce((s, v) => s + v, 0) / p.m.length).toBeCloseTo(1);
    expect(poolByPosition([a, b, c], 1).x).toEqual([1, 4]);
    expect(poolByPosition([{ x: [1], y: [NaN] }]).m).toEqual([]);
  });

  it("summarises ploidy and ranks clades", () => {
    const cells = [];
    for (let i = 0; i < 10; i += 1) cells.push({ cell_id: `a${i}`, ploidy: 2 });
    for (let i = 0; i < 5; i += 1) cells.push({ cell_id: `b${i}`, ploidy: 3 });
    expect(ploidySummary(cells).median).toBe(2);
    expect(ploidySummary([]).n).toBe(0);
    const rows = cladePloidyRows(
      [{ id: "lo", cells: cells.slice(0, 6).map((c) => c.cell_id) }, { id: "hi", cells: cells.slice(10).map((c) => c.cell_id) }, { id: "tiny", cells: ["b0"] }],
      cells
    );
    expect(rows.map((r) => r.id)).toEqual(["hi", "lo"]);
    expect(rows[0].summary.median).toBe(3);
    expect(rows[0].rest.median).toBe(2);
    expect(rows[0].summary.fracHigh).toBe(1);
  });
});
