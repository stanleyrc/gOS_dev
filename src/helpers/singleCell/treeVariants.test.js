import { BASE_TREE, activeTreeVariant, defaultTreeVariant, serializeVariant, supportKeys, treeVariants, variantFile, variantShortLabel } from "./treeVariants";
import { defaultPair, defaultTreeB, usableTrees } from "./treeCompare";

const index = [
  { name: "gos", label: "Synthetic tree · branch length = substitutions per site", branch_units: "substitutions per site" },
  { name: "gos_mapped", label: "Synthetic tree · branch length = mapped SNVs", branch_units: "mutations", topology_of: "gos", default: true, n_matched: 5 },
  { name: "other", label: "Another tree", n_matched: 5 },
];

describe("treeVariants", () => {
  it("lists the pipeline tree and its same-topology re-scalings only", () => {
    expect(treeVariants(index).map((t) => t.name)).toEqual(["gos", "gos_mapped"]);
    expect(treeVariants([{ name: "gos" }, { name: "other" }])).toEqual([]);
    expect(treeVariants(null)).toEqual([]);
  });
  it("picks the default entry, else the pipeline tree", () => {
    expect(defaultTreeVariant(index)).toBe("gos_mapped");
    expect(defaultTreeVariant([{ name: "gos" }, { name: "x", topology_of: "gos" }])).toBe(BASE_TREE);
    expect(defaultTreeVariant([{ name: "x", default: true }])).toBe(BASE_TREE); // not a re-scaling of gos
  });
  it("honours a valid URL choice only", () => {
    expect(activeTreeVariant(index, "gos")).toBe("gos");
    expect(activeTreeVariant(index, "other")).toBe("gos_mapped");
    expect(activeTreeVariant(index, null)).toBe("gos_mapped");
  });
  it("labels, files, URL values and support keys", () => {
    const [base] = treeVariants(index);
    expect(base.label).toBe("Synthetic tree · branch length = substitutions per site (previous default)");
    expect(variantShortLabel(base)).toBe("Substitutions per site (previous default)");
    expect(variantShortLabel(index[0])).toBe("Substitutions per site");
    expect(variantShortLabel(index[1])).toBe("Mutations");
    expect(variantFile("gos")).toBe("tree.nwk");
    expect(variantFile("gos_mapped")).toBe("trees/gos_mapped.nwk");
    expect(serializeVariant("gos_mapped", index)).toBeNull();
    expect(serializeVariant("gos", index)).toBe("gos");
    expect(supportKeys("gos_mapped", index)).toEqual(["gos_mapped", "gos"]);
    expect(supportKeys("other", index)).toEqual(["other"]);
  });
  it("compare-trees list marks the replaced default", () => {
    expect(usableTrees(index)[0].label.endsWith("(previous default)")).toBe(true);
    expect(usableTrees([{ name: "gos", label: "x" }])[0].label).toBe("x");
  });
  it("compare-trees default pair starts from the drawn tree and avoids its re-scaling as tree B", () => {
    expect(defaultPair(index, "gos_mapped")).toEqual(["gos_mapped", "other"]);
    expect(defaultPair(index)).toEqual(["gos", "other"]);
    expect(defaultTreeB(index.slice(0, 2), "gos_mapped")).toBe("gos");
  });
});
