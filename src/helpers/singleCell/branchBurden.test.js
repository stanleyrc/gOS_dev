import { branchGains, cladeRateTest, privateCountsPerRow } from "./branchBurden";
import { layoutTree, parseNewick } from "./newick";

describe("branchBurden", () => {
  const layout = layoutTree(parseNewick("((a:1,b:1):1,(c:1,d:1):1);"));
  const leafRow = Object.fromEntries(layout.leaves.map((name, i) => [name, i]));
  const rows = layout.leaves.map((name) => leafRow[name]);
  const cells = layout.leaves;
  // site0 truncal (all), site1 in a+b, site2 in c only, site3 in a and c (homoplasy)
  const snv = {
    cells,
    variants: [{ category: "truncal" }, { category: "subclonal" }, { category: "private" }, { category: "subclonal" }],
    status: cells.map((name) => [1, name === "a" || name === "b" ? 1 : 0, name === "c" ? 1 : 0, name === "a" || name === "c" ? 1 : 0]),
  };
  it("assigns sites to the branch where they appear", () => {
    const g = branchGains(layout, snv, rows);
    const ab = layout.nodes.findIndex((n) => !n.isLeaf && n.parent >= 0 && layout.leaves.slice(n.firstLeaf, n.lastLeaf + 1).join("") === "ab");
    expect(g.get(ab).gained).toEqual([1]);
    // homoplasy: site 3 is gained independently on the branches to a and to c
    const c = layout.nodes.findIndex((n) => n.isLeaf && n.name === "c");
    expect(g.get(c).gained).toEqual([2, 3]);
    const a = layout.nodes.findIndex((n) => n.isLeaf && n.name === "a");
    expect(g.get(a).gained).toEqual([3]);
    expect(g.get(ab).gained).not.toContain(3);
  });
  it("counts private sites per row", () => {
    expect(privateCountsPerRow(snv)).toEqual(cells.map((name) => (name === "c" ? 1 : 0)));
  });
  it("tests a clade's rate against the rest", () => {
    const r = cladeRateTest([5, 6, 7, 1, 1, 2, 1], [true, true, true, false, false, false, false]);
    expect(r.medianIn).toBe(6);
    expect(r.fold).toBe(6);
    expect(r.p).toBeLessThan(0.1);
    expect(Number.isNaN(cladeRateTest([1, 2], [true, false]).p)).toBe(true);
  });
});
