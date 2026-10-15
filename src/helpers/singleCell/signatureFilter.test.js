import { allowedSites, restrictSets, siteCountNote, snvFiltersOn } from "./signatureFilter";

const snv = {
  variants: [
    { id: "chr1_1_A_C", category: "truncal", cellphyInput: true, driver: false },
    { id: "chr1_2_A_C", category: "subclonal", cellphyInput: true, driver: true },
    { id: "chr1_3_A_C", category: "private", cellphyInput: false, driver: false },
    { id: "chr1_4_A_C", category: "private", cellphyInput: true, driver: false },
  ],
  cells: {},
};

describe("signatureFilter", () => {
  it("toggle defaults to on", () => {
    expect(snvFiltersOn({})).toBe(true);
    expect(snvFiltersOn({ sigUseSnvFilters: false })).toBe(false);
  });
  it("is inactive without filters or when switched off", () => {
    expect(allowedSites(snv, {}).active).toBe(false);
    const off = allowedSites(snv, { snvCellphyOnly: true, sigUseSnvFilters: false });
    expect(off.allowed).toBeNull();
    expect(off.n).toBe(4);
  });
  it("collects the sites passing the shared filter", () => {
    const r = allowedSites(snv, { snvCellphyOnly: true });
    expect(r).toMatchObject({ n: 3, m: 4, active: true });
    expect([...r.allowed]).toEqual([0, 1, 3]);
    expect([...allowedSites(snv, { snvSiteIds: ["chr1_2_A_C"] }).allowed]).toEqual([1]);
  });
  it("restricts sets and reports N of M", () => {
    const sets = [
      { key: "all", name: "all", kind: "tree", columns: [0, 1, 3] },
      { key: "clone:1", name: "clone: 1", kind: "clone", columns: [1, 2, 3] },
      { key: "filtered", name: "heatmap filter", kind: "filter", columns: [0] },
    ];
    const { allowed } = allowedSites(snv, { snvDriversOnly: true });
    const out = restrictSets(sets, allowed);
    expect(out.map((s) => s.key)).toEqual(["all", "clone:1"]);
    expect(out[1].columns).toEqual([1]);
    expect(siteCountNote(out[1])).toBe("1 of 3 sites");
    expect(restrictSets(sets, null)).toHaveLength(3);
  });
});
