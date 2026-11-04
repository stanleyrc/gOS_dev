import { namedCladeByCell, ecdnaCallByCell, withCladeEcdnaFields } from "./cellCladeEcdnaFields";

const clades = { named_groups: [{ name: "EC2", cells: ["a", "b", "c"] }, { name: "CI2", cells: ["c"] }] };
const amp = { kind: "amplicon", amplicon: "a1", label: "EGFR", verdict: "mixed", groups: [
  { group: "ALL", n_group: 3, call: "unstable" }, { group: "n1", n_group: 3, call: "unstable" }, { group: "n2", n_group: 1, call: "stable" }] };
const doc = { cells: ["a", "b", "c"], clade_cells: { n1: [0, 1, 2], n2: [2] }, amplicons: [amp] };

describe("clade and ecDNA annotation fields", () => {
  it("smallest named clade wins", () => expect(namedCladeByCell(clades.named_groups).get("c")).toBe("CI2"));
  it("ecDNA call from the smallest clade", () => {
    const m = ecdnaCallByCell(doc, amp);
    expect([m.get("a"), m.get("c")]).toEqual(["ecDNA-like", "stable"]);
  });
  it("adds fields and leaves unknown cells alone", () => {
    const out = withCladeEcdnaFields([{ cell_id: "a" }, { cell_id: "z" }], clades, doc);
    expect(out[0]).toMatchObject({ Clade: "EC2", "ecDNA: EGFR": "ecDNA-like" });
    expect(out[1]).toEqual({ cell_id: "z" });
  });
  it("no sources: same array", () => {
    const cells = [{ cell_id: "a" }];
    expect(withCladeEcdnaFields(cells, null, null)).toBe(cells);
  });
});
