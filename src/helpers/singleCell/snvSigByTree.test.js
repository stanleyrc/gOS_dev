import { assignByTreeSet } from "./snvSigByTree";
import { SBS96 } from "./signatures";

const col = (ch) => {
  const c = new Float64Array(96);
  c[SBS96.indexOf(ch)] = 1;
  return c;
};
const reference = { names: ["SBS1", "SBS13"], columns: [col("A[C>T]A"), col("A[C>G]A")] };

test("subclonal sites use the subclonal set, which can include signatures the joint fit lacks", () => {
  const variants = [
    { category: "subclonal", context: "A[C>G]A" },
    { category: "truncal", context: "A[C>T]A" },
    { category: "private", context: "A[C>G]A" },
  ];
  const joint = { signature: ["SBS1", "SBS1", "SBS1"], prob: Float32Array.from([0.5, 1, 0.5]) };
  const sets = [
    { name: "all", activities: [{ signature: "SBS1", activity: 10 }] },
    { name: "subclonal", activities: [{ signature: "SBS13", activity: 5 }, { signature: "SBS1", activity: 1 }] },
  ];
  const out = assignByTreeSet(variants, reference, sets, joint);
  expect(out.signature).toEqual(["SBS13", "SBS1", "SBS1"]); // private has no set: joint fallback
  expect(out.prob[0]).toBeGreaterThan(0.9);
  expect(out.bySet).toEqual(["subclonal"]);
});
