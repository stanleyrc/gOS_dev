import { layoutTree, parseNewick } from "./newick";
import { treeMarks } from "./treeMarks";

describe("treeMarks", () => {
  // ((a,b),(c,(d,e))): a, b lost (group 0); c, d retained (group 1); e unmarked
  const layout = layoutTree(parseNewick("((a:1,b:1):1,(c:1,(d:1,e:1):1):1);"));
  const idx = (name) => layout.nodes.findIndex((n) => n.name === name);
  const groups = [
    { color: "red", cells: new Set(["a", "b"]) },
    { color: "green", cells: new Set(["c", "d"]) },
  ];
  it("marks tips, colours the first group's branches and rings the transition", () => {
    const m = treeMarks(layout, groups);
    expect(m.tip.get(idx("a"))).toBe("red");
    expect(m.tip.get(idx("c"))).toBe("green");
    expect(m.tip.has(idx("e"))).toBe(false);
    expect(m.branch.has(idx("a"))).toBe(true);
    expect(m.branch.has(idx("c"))).toBe(false);
    const ab = layout.nodes[idx("a")].parent;
    expect(m.ring.get(ab)).toBe("red");
    expect(m.ring.size).toBe(1);
  });
  it("is empty without groups", () => {
    expect(treeMarks(layout, []).tip.size).toBe(0);
  });
});

describe("rotateByLeafRank", () => {
  it("puts the wanted clones first", () => {
    const { rotateByLeafRank } = require("./newick");
    const root = parseNewick("((a:1,b:1):1,(c:1,d:1):1);");
    const rank = { c: 0, d: 0, a: 1, b: 1 };
    const out = layoutTree(rotateByLeafRank(root, (n) => rank[n]));
    expect(out.leaves).toEqual(["c", "d", "a", "b"]);
  });
});
