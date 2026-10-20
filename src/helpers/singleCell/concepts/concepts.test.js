import { fitBalance, looseEnds, sideLoads, toyGenome, totalLoose } from "./junctionBalance";
import { changePoints, cnBySegments, disjoin, jointViews, segmentsFrom, snapToBreakends, toyCells, TOY_BREAKENDS } from "./jointBalance";
import { histogram, indicator, inverseDistanceWeights, moransI, pairTransitions, permutationNull, simulateStates, tipDistances, treeFromNested, yuleTree } from "./phyloAutocorr";
import { CONCEPTS, fig2Moran, parseTsv, patientHref } from "./conceptsCatalog";

describe("junction balance (toy)", () => {
  const g = toyGenome({ noise: 0 });
  it("the true toy assignment is balanced: no loose ends", () => {
    expect(looseEnds(g.segments, g.junctions)).toEqual([]);
  });
  it("side loads add up junction CNs (s1.R = r12 1 + deletion 1)", () => {
    const load = sideLoads(g.segments, g.junctions);
    expect(load["s1.R"]).toBe(2);
    expect(load["s4.L"]).toBe(3); // r34 2 + dup 1
    expect(load["s5.R"]).toBe(3); // r56 2 + dup 1
  });
  it("switching a junction off leaves loose ends on both of its sides", () => {
    const off = g.junctions.map((j) => (j.id === "del" ? { ...j, on: false } : j));
    const loose = looseEnds(g.segments, off);
    expect(loose.map((l) => l.key).sort()).toEqual(["s1.R", "s3.L"]);
    expect(totalLoose(loose)).toBe(2);
  });
  it("the brute-force fit recovers the truth from clean coverage, spurious junction at 0", () => {
    const f = fitBalance({ ...g, sd: 0.3, lambda: 1 });
    expect(Object.values(f.segCn)).toEqual([2, 1, 2, 3, 3, 2]);
    expect(f.juncCn).toMatchObject({ r12: 1, r23: 1, r34: 2, r45: 3, r56: 2, del: 1, dup: 1, spur: 0 });
    expect(f.loose).toEqual([]);
    expect(f.n).toBe(5 ** 5 * 4 ** 3);
  });
  it("without the deletion junction the fit keeps coverage and pays two loose copies", () => {
    const off = g.junctions.map((j) => (j.id === "del" ? { ...j, on: false } : j));
    const f = fitBalance({ segments: g.segments, junctions: off, bins: g.bins, sd: 0.3, lambda: 1 });
    expect(f.segCn.s2).toBe(1);
    expect(totalLoose(f.loose)).toBe(2);
  });
  it("noisy coverage still fits the truth at the default seed", () => {
    const n = toyGenome({ noise: 0.35 });
    const f = fitBalance({ ...n, sd: 0.35, lambda: 1 });
    expect(Object.values(f.segCn)).toEqual([2, 1, 2, 3, 3, 2]);
  });
});

describe("joint balance (toy)", () => {
  it("disjoins, segments and snaps by hand", () => {
    expect(disjoin([[3, 10], [5, 10]])).toEqual([3, 5, 10]);
    expect(segmentsFrom([3, 5], 8)).toEqual([{ start: 0, end: 3 }, { start: 3, end: 5 }, { start: 5, end: 8 }]);
    expect(snapToBreakends([13, 15, 29, 36], [14, 28, 44], 3)).toEqual([14, 14, 28, null]);
    expect(cnBySegments([2.1, 1.9, 3.2, 2.8], [{ start: 0, end: 2 }, { start: 2, end: 4 }])).toEqual([2, 2, 3, 3]);
    expect(changePoints([2, 2, 3, 3, 1])).toEqual([2, 4]);
  });
  it("joint view: shared breakends only, no loose ends, the spurious breakpoint dropped", () => {
    const v = jointViews(toyCells());
    expect(v.joint.rows[0].breaks).toEqual(TOY_BREAKENDS);
    expect(v.joint.loose).toBe(0);
    expect(v.joint.dropped).toBe(1);
    expect(v.disjoint.nSegments).toBeGreaterThan(v.joint.nSegments);
    expect(v.perCell.loose).toBeGreaterThan(0);
    // cell 3 has two extra copies 14-28 and one 28-44
    expect(v.joint.rows[2].cn[20]).toBe(4);
    expect(v.joint.rows[2].cn[30]).toBe(3);
  });
});

describe("PATH / Moran's I", () => {
  const t = treeFromNested([["A", "B"], ["C", "D"]]);
  const d = tipDistances(t);
  const w = inverseDistanceWeights(d);
  it("node distances and normalised inverse weights by hand", () => {
    expect(d).toEqual([[0, 2, 4, 4], [2, 0, 4, 4], [4, 4, 0, 2], [4, 4, 2, 0]]);
    expect(w[0][1]).toBeCloseTo(1 / 8);
    expect(w[0][2]).toBeCloseTo(1 / 16);
  });
  it("Moran's I by hand: clade-structured 0, alternating -0.5, constant null", () => {
    expect(moransI([1, 1, 0, 0], w)).toBeCloseTo(0);
    expect(moransI([1, 0, 1, 0], w)).toBeCloseTo(-0.5);
    expect(moransI([1, 1, 1, 1], w)).toBeNull();
  });
  it("transitions: sister pairs only, clade-structured is all diagonal", () => {
    const p = pairTransitions(["AC", "AC", "MES", "MES"], d, ["AC", "MES"], 2);
    expect(p).toEqual([[1, 0], [0, 1]]);
  });
  it("heritable toy states give positive z vs the permutation null, random ones do not", () => {
    const tree = yuleTree(30, 3);
    const W = inverseDistanceWeights(tipDistances(tree));
    const zOf = (h) => {
      const s = simulateStates(tree, h);
      const counts = {};
      s.forEach((x) => { counts[x] = (counts[x] || 0) + 1; });
      const top = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
      return permutationNull(indicator(s, top), W, 200, 5).z;
    };
    expect(zOf(0.9)).toBeGreaterThan(2);
    expect(Math.abs(zOf(0))).toBeLessThan(2.5);
    expect(tree.tips).toHaveLength(30);
  });
  it("histogram counts every value", () => {
    const h = histogram([0, 0.5, 1, 1], 2);
    expect(h.map((b) => b.n)).toEqual([1, 3]);
  });
});

describe("catalog and Figure 2 reader", () => {
  it("lists the two requested explainers as built", () => {
    expect(CONCEPTS.filter((c) => c.status === "built").map((c) => c.id)).toEqual(expect.arrayContaining(["balance", "path"]));
  });
  it("builds patient deep links", () => {
    expect(patientHref("P1", 7, { heatmap: "junctions" })).toBe("?dataset=gbm-sc&report=P1&tab=7&heatmap=junctions");
  });
  it("parses the Moran table (synthetic rows)", () => {
    const rows = parseTsv("patient\tsrc\tstate\tI\tZ\tn\nP1\tNew tree\tAC\t0.1\t2.5\t10\nP1\tJake tree\tAC\tNA\t1\t10\n");
    const m = fig2Moran(rows);
    expect(m.ok).toBe(true);
    expect(m.get("P1", "AC", "New tree").Z).toBe(2.5);
    expect(m.get("P1", "AC", "Jake tree").I).toBeNull();
    expect(fig2Moran([]).ok).toBe(false);
  });
});
