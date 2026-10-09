import { parseNewick, layoutTree, treeForCells } from "./newick";
import { branchVariants, lca, resolveAnchors } from "./branchSnvs";

const NWK = "((a:1,b:1):1,(c:1,(d:1,e:1):1):1);";

describe("branch SNVs", () => {
  const full = layoutTree(parseNewick(NWK));
  const nodeOf = (layout, names) => {
    const want = names.join(",");
    return layout.nodes.findIndex((n) => layout.leaves.slice(n.firstLeaf, n.lastLeaf + 1).sort().join(",") === want);
  };

  it("resolves anchors to nodes", () => {
    const [ab, cde, d, root] = resolveAnchors(["a|b", "c|e", "d", "a|e"], full);
    expect(ab).toBe(nodeOf(full, ["a", "b"]));
    expect(cde).toBe(nodeOf(full, ["c", "d", "e"]));
    expect(d).toBe(nodeOf(full, ["d"]));
    expect(root).toBe(0);
    expect(lca(full, nodeOf(full, ["d"]), nodeOf(full, ["c"]))).toBe(cde);
  });

  it("places clades on a pruned tree and counts per branch", () => {
    const pruned = treeForCells(NWK, ["a", "b", "d", "e"]).layout;
    const snv = { variants: [{ anchor: "c|e" }, { anchor: "c|d" }, { anchor: "a|b" }, { anchor: null }, { anchor: "c" }] };
    const byNode = branchVariants(snv, [0, 1, 2, 3, 4], pruned, full);
    expect(byNode.get(nodeOf(pruned, ["d", "e"]))).toEqual([0, 1]);
    expect(byNode.get(nodeOf(pruned, ["a", "b"]))).toEqual([2]);
    expect([...byNode.values()].flat()).toHaveLength(3);
  });

  it("moves a site whose anchors disagree with its clade size onto a node of that size on the same lineage", () => {
    // ((a,b),(c,(d,e))): anchors d|e (2 cells) for a site mapped to a 3-cell clade -> (c,d,e);
    // anchors a|e (root) for a 2-cell site -> the first 2-cell node below it, (a,b)
    const snv = { variants: [{ anchor: "d|e", clade_cells: 3 }, { anchor: "a|b", clade_cells: 2 }, { anchor: "a|e", clade_cells: 2 }] };
    const byNode = branchVariants(snv, [0, 1, 2], full);
    expect(byNode.get(nodeOf(full, ["c", "d", "e"]))).toEqual([0]);
    expect(byNode.get(nodeOf(full, ["a", "b"]))).toEqual([1, 2]);
  });
});
