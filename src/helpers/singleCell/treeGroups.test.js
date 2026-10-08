import { parseNewick, layoutTree } from "./newick";
import { cutTree, labelRuns } from "./treeGroups";

describe("tree groups", () => {
  const layout = layoutTree(parseNewick("((a:1,b:1):1,(c:1,(d:1,e:1):1):1);"));
  it("cuts the tree into k contiguous clades", () => {
    expect(cutTree(layout, 1).map((c) => [c.first, c.last])).toEqual([[0, 4]]);
    expect(cutTree(layout, 2).map((c) => [c.first, c.last])).toEqual([[0, 1], [2, 4]]);
    expect(cutTree(layout, 3).map((c) => [c.first, c.last])).toEqual([[0, 1], [2, 2], [3, 4]]);
    expect(cutTree(layout, 10)).toHaveLength(5);
  });
  it("finds label runs", () => {
    expect(labelRuns(["A", "A", "B", "A"])).toEqual([
      { label: "A", first: 0, last: 1 },
      { label: "B", first: 2, last: 2 },
      { label: "A", first: 3, last: 3 },
    ]);
  });
});
