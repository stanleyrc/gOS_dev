import { applyCategoryLabels, normalizeCategoryLabels, snvCategoryLabel } from "./snvCategoryLabels";
import { snvFromSparse } from "./cellFiles";

const t = (k) => `T:${k}`;
const BINS = { 1: { startPlace: 1, endPlace: 1000 } };

describe("normalizeCategoryLabels", () => {
  it("keeps non-empty string labels only", () => {
    expect(normalizeCategoryLabels({ truncal: " Shared trunk ", subclonal: "", private: 3, unmapped: "Trunk, unresolved" })).toEqual({ truncal: "Shared trunk", unmapped: "Trunk, unresolved" });
  });
  it("returns null without a usable map", () => {
    expect(normalizeCategoryLabels(null)).toBeNull();
    expect(normalizeCategoryLabels(["a"])).toBeNull();
    expect(normalizeCategoryLabels({ truncal: "" })).toBeNull();
  });
});

describe("snvCategoryLabel", () => {
  const labels = { truncal: "Shared trunk (A + B)" };
  it("prefers the report override", () => {
    expect(snvCategoryLabel("truncal", t, labels)).toBe("Shared trunk (A + B)");
  });
  it("falls back to the translation, then the key", () => {
    expect(snvCategoryLabel("subclonal", t, labels)).toBe("T:components.single-cell.snv.category-subclonal");
    expect(snvCategoryLabel("subclonal", null, null)).toBe("subclonal");
    expect(snvCategoryLabel(null, t, labels)).toBe("");
  });
});

describe("applyCategoryLabels", () => {
  it("relabels matching legend entries only", () => {
    const entries = [{ value: "truncal", label: "truncal", color: "#000", count: 2 }, { value: "private", label: "private", count: 1 }];
    const out = applyCategoryLabels(entries, { truncal: "Shared" });
    expect(out[0]).toEqual({ value: "truncal", label: "Shared", color: "#000", count: 2 });
    expect(out[1]).toBe(entries[1]);
    expect(applyCategoryLabels(entries, null)).toBe(entries);
  });
});

describe("snvFromSparse carries categoryLabels", () => {
  const sparse = {
    format: "compact",
    categoryLabels: { truncal: "Shared trunk", cn_mapped: "Group B only" },
    variants: [{ id: "chr1_100_C_T", category: "truncal" }, { id: "chr1_200_G_A", category: "cn_mapped" }],
    cells: { c1: [[0, 1, 2], [1, 3, 0]] },
  };
  it("keeps the map on the matrix", () => {
    const snv = snvFromSparse(sparse, ["c1"], BINS);
    expect(snv.categoryLabels).toEqual({ truncal: "Shared trunk", cn_mapped: "Group B only" });
  });
  it("is null when the file has none", () => {
    const snv = snvFromSparse({ ...sparse, categoryLabels: undefined }, ["c1"], BINS);
    expect(snv.categoryLabels).toBeNull();
  });
});
