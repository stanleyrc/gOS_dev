import { parseNewick, layoutTree } from "./newick";
import { collapseTree, dominantValue, placeLabels } from "./collapsedTree";

describe("collapseTree", () => {
  // root: z (outlier), A = (a,b,c), B = (d,(e,f,g))
  const layout = layoutTree(parseNewick("(z:5,((a:1,b:1):1,c:2):1,(d:1,(e:1,f:1,g:1):1):2);"));
  it("keeps clades of at least minSize and gives each tip one row", () => {
    const c = collapseTree(layout, 3);
    const root = c.nodes.get(0);
    expect(root.children.length).toBe(2);
    expect(root.folded).toBe(1);
    const tips = [...c.nodes.values()].filter((n) => n.tip);
    expect(tips.map((n) => n.size)).toEqual([3, 3]);
    expect(c.rows).toBe(2); // B keeps one child (e,f,g) and folds d
    // B is merged into its only kept child: the root's children are A and (e,f,g)
    const efg = tips.find((n) => layout.nodes[n.id].children.length === 3);
    expect(root.children).toContain(efg.id);
    expect(efg.folded).toBe(4); // its own leaves e,f,g plus d from the merged B
    const b = layout.nodes[efg.id].parent;
    expect(c.nodes.has(b)).toBe(false);
    expect(c.shownOf(b)).toBe(efg.id);
    expect(efg.top).toBe(b);
    expect(tips.map((n) => n.row).sort()).toEqual([0, 1]);
  });
  it("maps folded nodes to their nearest kept ancestor", () => {
    const c = collapseTree(layout, 3);
    const z = layout.nodes.findIndex((n) => n.name === "z");
    expect(c.shownOf(z)).toBe(0);
    const tipA = [...c.nodes.values()].find((n) => n.tip && n.size === 3 && layout.nodes[n.id].children.length === 2);
    expect(tipA.tipX).toBe(3); // deepest leaf a/b at 1+1+1
  });
  it("dominantValue needs a clear majority", () => {
    const v = ["x", "x", "x", "y"];
    expect(dominantValue(0, 3, (r) => v[r], 0.7)).toBe("x");
    expect(dominantValue(0, 3, (r) => v[r], 0.8)).toBe(null);
  });
});

describe("placeLabels", () => {
  it("pushes overlapping boxes apart and leaves separate ones alone", () => {
    const out = placeLabels([
      { key: "a", x: 0, y: 0, w: 50, h: 10 },
      { key: "b", x: 10, y: 5, w: 50, h: 10 },
      { key: "c", x: 100, y: 5, w: 20, h: 10 },
      { key: "d", x: 20, y: 30, w: 20, h: 10, dir: -1 },
    ]);
    const by = Object.fromEntries(out.map((b) => [b.key, b]));
    expect(by.a.y).toBe(0);
    expect(by.b.y).toBe(12);
    expect(by.c.shifted).toBe(0);
    expect(by.d.y).toBe(30);
    // a later-priority box pushed upward clears an earlier one
    const up = placeLabels([{ key: "line", x: 0, y: 20, w: 40, h: 10 }, { key: "chips", x: 0, y: 15, w: 40, h: 10, prio: 1, dir: -1 }]);
    expect(up.find((b) => b.key === "chips").y).toBe(8);
  });
});
