import { profileSimilarity, setProfile, signatureSiteSets } from "./signatureSets";
import { SBS96 } from "./signatures";

describe("signature site sets", () => {
  const snv = {
    cells: ["c1", "c2", "c3"],
    variants: [
      { category: "truncal", cellphyInput: true, context: SBS96[0] },
      { category: "subclonal", cellphyInput: true, context: SBS96[1] },
      { category: "private", cellphyInput: true, context: SBS96[2] },
      { category: "truncal", cellphyInput: false, context: SBS96[3] },
    ],
    status: [
      [1, 1, 0, 1],
      [1, 0, 1, 0],
      [1, 0, 0, 0],
    ],
  };
  const cells = [{ cell_id: "c1", clone_id: "A" }, { cell_id: "c2", clone_id: "A" }, { cell_id: "c3", clone_id: "Normal" }];

  it("builds tree, clone and selection sets from CellPhy-input sites", () => {
    const sets = signatureSiteSets(snv, { cells, selectedCellIds: ["c3"] });
    const byKey = Object.fromEntries(sets.map((s) => [s.key, s.columns]));
    expect(byKey.all).toEqual([0, 1, 2]);
    expect(byKey.truncal).toEqual([0]);
    expect(byKey["clone:A"]).toEqual([0, 1, 2]);
    expect(byKey.selection).toEqual([0]);
  });

  it("profiles and compares sets", () => {
    const p1 = { key: "a", ...setProfile(snv, [0, 1]) };
    const p2 = { key: "b", ...setProfile(snv, [0, 1]) };
    const p3 = { key: "c", ...setProfile(snv, [2]) };
    expect(p1.used).toBe(2);
    const sim = profileSimilarity([p1, p2, p3]);
    expect(sim.matrix[0][1]).toBeCloseTo(1);
    expect(sim.matrix[0][2]).toBeCloseTo(0);
  });
});
