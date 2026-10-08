import { SBS96 } from "./signatures";
import { assignSignatures, channelPosteriors, signatureBurden } from "./signatureAssign";

describe("signature assignment", () => {
  const a = new Float64Array(96).fill(0);
  const b = new Float64Array(96).fill(0);
  a[0] = 0.9;
  a[1] = 0.1;
  b[0] = 0.1;
  b[1] = 0.9;
  const reference = { names: ["A", "B"], columns: [a, b] };

  it("assigns by posterior and counts burden", () => {
    const post = channelPosteriors(reference, [{ signature: "A", activity: 50 }, { signature: "B", activity: 50 }]);
    expect(post.perChannel[0][0].signature).toBe("A");
    expect(post.perChannel[1][0].signature).toBe("B");
    const variants = [{ context: SBS96[0] }, { context: SBS96[1] }, { context: SBS96[1] }, { context: null }];
    const asg = assignSignatures(variants, post);
    expect(asg.signature).toEqual(["A", "B", "B", null]);
    expect(signatureBurden([0, 1, 2, 3], asg)).toEqual({ counts: { A: 1, B: 2 }, assigned: 3, total: 4 });
  });

  it("weights by activity", () => {
    const post = channelPosteriors(reference, [{ signature: "A", activity: 95 }, { signature: "B", activity: 5 }]);
    // channel 1 favours B per profile, but A dominates the exposure: 0.1*95 vs 0.9*5
    expect(post.perChannel[1][0].signature).toBe("A");
  });
});
