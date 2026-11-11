import { BASE_TREE, activeTreeVariant, defaultTreeVariant, hasOtherTopologies, sameTopologyAsBase, serializeVariant, supportKeys, treeVariants, variantFile, variantShortLabel } from "./treeVariants";
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
  it("drawable trees of another topology can be listed and be the default", () => {
    const adopted = [
      { name: "gos", label: "Synthetic pipeline tree" },
      { name: "gos_mapped", branch_units: "mutations", topology_of: "gos", n_matched: 5 },
      { name: "alt_mut", short_label: "Alt · mutations", branch_units: "mutations", drawable: true, default: true, n_matched: 4 },
      { name: "alt_sps", branch_units: "substitutions per site", drawable: true, topology_of: "alt_mut", n_matched: 4 },
      { name: "other", label: "Another tree", n_matched: 5 },
    ];
    expect(treeVariants(adopted).map((t) => t.name)).toEqual(["gos", "gos_mapped", "alt_mut", "alt_sps"]);
    expect(defaultTreeVariant(adopted)).toBe("alt_mut");
    expect(activeTreeVariant(adopted, "gos")).toBe("gos");
    expect(hasOtherTopologies(adopted)).toBe(true);
    expect(hasOtherTopologies(index)).toBe(false);
    const [base, mapped, mut, sps] = treeVariants(adopted);
    expect(variantShortLabel(base, adopted)).toBe("Our tree (previous default)");
    expect(variantShortLabel(mapped, adopted)).toBe("Our tree · Mutations");
    expect(variantShortLabel(mut, adopted)).toBe("Alt · mutations");
    expect(variantShortLabel(sps, adopted)).toBe("Substitutions per site");
    expect(sameTopologyAsBase("gos", adopted)).toBe(true);
    expect(sameTopologyAsBase("gos_mapped", adopted)).toBe(true);
    expect(sameTopologyAsBase("alt_mut", adopted)).toBe(false);
    expect(sameTopologyAsBase("alt_sps", adopted)).toBe(false);
    expect(supportKeys("alt_sps", adopted)).toEqual(["alt_sps", "alt_mut"]);
  });
});
