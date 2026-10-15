import { mergeSiteQc } from "./siteQc";

describe("mergeSiteQc", () => {
  const sparse = { variants: [{ id: "chr1_1_A_C" }, { id: "chr1_2_A_C", sum_logodds: 1 }], cells: {} };
  it("adds QC fields by site id", () => {
    const out = mergeSiteQc(sparse, { sites: { chr1_1_A_C: { sum_logodds: 5.5, n_alt: 3 } } });
    expect(out.variants[0]).toEqual({ id: "chr1_1_A_C", sum_logodds: 5.5, n_alt: 3 });
    expect(out.variants[1].sum_logodds).toBe(1);
    expect(sparse.variants[0].sum_logodds).toBeUndefined();
  });
  it("passes through without QC", () => {
    expect(mergeSiteQc(sparse, null)).toBe(sparse);
    expect(mergeSiteQc(null, { sites: {} })).toBeNull();
  });
});
