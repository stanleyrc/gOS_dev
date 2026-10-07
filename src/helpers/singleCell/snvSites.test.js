import { eventSnvSiteId, filterSnvColumns } from "./snvSites";

describe("eventSnvSiteId", () => {
  it("builds the SNV matrix id from Variant_g", () => {
    expect(eventSnvSiteId({ vartype: "SNV", Variant_g: "18:63588822-63588822 A>T" })).toBe("chr18_63588822_A_T");
    expect(eventSnvSiteId({ vartype: "SNV", Variant_g: "chrX:100-100 c>g" })).toBe("chrX_100_C_G");
  });
  it("is null for non-SNV events", () => {
    expect(eventSnvSiteId({ vartype: "scna", Variant_g: "" })).toBeNull();
    expect(eventSnvSiteId({ vartype: "fusion" })).toBeNull();
  });
});

describe("filterSnvColumns", () => {
  const snv = {
    variants: [
      { id: "chr1_1_A_C", category: "truncal", cellphyInput: true, driver: false },
      { id: "chr1_2_A_C", category: "private", cellphyInput: true, driver: true },
      { id: "chr1_3_A_C", category: "private", cellphyInput: false, driver: true },
    ],
  };
  const all = [0, 1, 2];
  it("keeps everything without filters", () => expect(filterSnvColumns(snv, all, {})).toEqual(all));
  it("restricts to picked site ids", () => expect(filterSnvColumns(snv, all, { snvSiteIds: ["chr1_3_A_C"] })).toEqual([2]));
  it("combines category, CellPhy and driver filters", () => {
    expect(filterSnvColumns(snv, all, { snvCategories: ["private"] })).toEqual([1, 2]);
    expect(filterSnvColumns(snv, all, { snvCategories: ["private"], snvCellphyOnly: true })).toEqual([1]);
    expect(filterSnvColumns(snv, all, { snvDriversOnly: true })).toEqual([1, 2]);
  });
});

describe("clade score filter", () => {
  it("keeps sites at or above the minimum clade score", () => {
    const snv = { variants: [{ id: "a", cladeScore: 0.95 }, { id: "b", cladeScore: 0.4 }, { id: "c", cladeScore: null }] };
    expect(filterSnvColumns(snv, [0, 1, 2], { snvMinCladeScore: 0.7 })).toEqual([0]);
    expect(filterSnvColumns(snv, [0, 1, 2], { snvMinCladeScore: null })).toEqual([0, 1, 2]);
  });
});
