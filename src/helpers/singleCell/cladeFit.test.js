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
