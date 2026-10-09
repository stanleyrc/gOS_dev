import { compressLongBranches, contourSegments, countBy, figureRows, fitLine, kde2d, leavesUnder, logKde, niceLogDomain, niceTicks, pointInPolygon, pruneLayout } from "./figureMath";
import { layoutTree, parseNewick } from "./newick";

describe("figure math", () => {
  it("builds a smooth log-scale density that ends with the data", () => {
    const vals = [10, 12, 15, 20, 22, 25, 30, 40, 50, 55];
    const { x, y, n } = logKde(vals, { lo: 1, hi: 1000, n: 64 });
    expect(n).toBe(10);
    expect(Math.max(...y)).toBeCloseTo(1);
    // nothing near 1 copy or near 1000 copies
    expect(y[0]).toBe(0);
    expect(y[63]).toBe(0);
    const peak = x[y.indexOf(1)];
    expect(10 ** peak).toBeGreaterThan(12);
    expect(10 ** peak).toBeLessThan(45);
  });

  it("picks a nice log domain", () => {
    expect(niceLogDomain([3, 140])).toEqual([1, 200]);
    expect(niceLogDomain([3, 4])).toEqual([1, 10]);
    expect(niceLogDomain([600])).toEqual([1, 1000]);
  });

  it("contours a 2-D density around a cluster", () => {
    const pts = [];
    for (let i = 0; i < 50; i += 1) pts.push([50 + Math.sin(i) * 5, 80 + Math.cos(i * 1.7) * 5]);
    const grid = kde2d(pts, { x0: 0, x1: 150, y0: 0, y1: 200, gx: 40, gy: 40 });
    const segs = contourSegments(grid, 0.5);
    expect(segs.length).toBeGreaterThan(4);
    segs.forEach(([xa, ya]) => {
      expect(Math.abs(xa - 50)).toBeLessThan(30);
      expect(Math.abs(ya - 80)).toBeLessThan(40);
    });
  });

  it("tests points in a lasso polygon", () => {
    const sq = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(pointInPolygon(5, 5, sq)).toBe(true);
    expect(pointInPolygon(15, 5, sq)).toBe(false);
  });

  it("fits a line with R²", () => {
    const f = fitLine([1, 2, 3, 4, 5], [3, 5, 7, 9, 11]);
    expect(f.slope).toBeCloseTo(2);
    expect(f.intercept).toBeCloseTo(1);
    expect(f.r2).toBeCloseTo(1);
    expect(Number.isNaN(fitLine([1, 2], [1, 2]).slope)).toBe(true);
  });

  it("makes nice ticks", () => {
    expect(niceTicks(0, 100, 4)).toEqual([0, 25, 50, 75, 100]);
    expect(niceTicks(0, 9, 3)).toEqual([0, 5]);
  });

  it("prunes a tree layout to kept leaves and collapses unary nodes", () => {
    const layout = layoutTree(parseNewick("((a:1,b:1):1,(c:1,(d:1,e:1):1):1);"));
    const p = pruneLayout(layout, new Set(["a", "d", "e"]));
    expect(p.leaves).toEqual(["a", "d", "e"]);
    // root, a, (d,e) node, d, e: the (c,(d,e)) node collapses into (d,e)
    expect(p.nodes.filter((n) => !n.isLeaf)).toHaveLength(2);
    expect(p.nodes[0].x).toBe(0);
    const de = p.nodes.find((n) => !n.isLeaf && n.parent >= 0);
    expect(leavesUnder(p, de.id)).toEqual(["d", "e"]);
    expect(pruneLayout(layout, new Set(["zz"]))).toBeNull();
  });

  it("orders figure rows by the tree, unplaced cells last", () => {
    const layout = layoutTree(parseNewick("((a,b),c);"));
    expect(figureRows(layout, ["c", "x", "a"])).toEqual({ rows: ["a", "c", "x"], nTree: 2 });
    expect(figureRows(null, ["c", "a"])).toEqual({ rows: ["c", "a"], nTree: 0 });
  });

  it("shortens over-long branches and marks the cut", () => {
    const layout = layoutTree(parseNewick("(n:100,((a:1,b:1):1,(c:1,d:2):1):100);"));
    const { x, broken, maxX } = compressLongBranches(layout);
    expect(maxX).toBeLessThan(30);
    expect(broken.reduce((s, v) => s + v, 0)).toBe(2);
    const leaf = (name) => layout.nodes.findIndex((n) => n.name === name);
    // within the clade the branch lengths are kept
    expect(x[leaf("d")] - x[leaf("c")]).toBeCloseTo(1);
  });

  it("counts levels", () => {
    expect(countBy([{ s: "AC" }, { s: "AC" }, { s: "MES" }, {}], "s")).toEqual([["AC", 2], ["MES", 1], ["NA", 1]]);
  });
});
