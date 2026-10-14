import { parseNewick, layoutTree } from "./newick";
import { cladeFitScore } from "./cladeFit";

describe("cladeFitScore", () => {
  const layout = layoutTree(parseNewick("((a:1,b:1):1,(c:1,(d:1,e:1):1):1);"));
  it("is 1 for an exact clade and lower for scattered carriers", () => {
    expect(cladeFitScore(["d", "e"], layout).score).toBe(1);
    expect(cladeFitScore(["a", "b"], layout).clade).toBe(2);
    const scattered = cladeFitScore(["a", "e"], layout);
    expect(scattered.score).toBeLessThan(0.7); // best match is a single leaf: 2/(1+2)
    expect(cladeFitScore(["a"], layout).score).toBe(1);
    expect(Number.isNaN(cladeFitScore([], layout).score)).toBe(true);
  });
});

describe("cladeFitFromRows", () => {
  const layout = layoutTree(parseNewick("((a:1,b:1):1,(c:1,(d:1,e:1):1):1);"));
  it("matches cladeFitScore for the same carriers", () => {
    const { cladeFitFromRows } = require("./cladeFit");
    ["d,e", "a,e", "a", "c,d,e", "a,b,c,d,e"].forEach((s) => {
      const ids = s.split(",");
      const rows = ids.map((id) => layout.leaves.indexOf(id)).sort((x, y) => x - y);
      expect(cladeFitFromRows(rows, layout)).toEqual(cladeFitScore(ids, layout));
    });
    expect(Number.isNaN(cladeFitFromRows([], layout).score)).toBe(true);
  });
});
