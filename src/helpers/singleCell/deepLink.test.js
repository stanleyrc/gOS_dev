import { cellsOfGroups, linkAppliesTo, readDeepLink, readViewLink, singleCellStillLoading, walkIdsForLabels, withCloneOverrides } from "./deepLink";

describe("readDeepLink", () => {
  it("parses groups, heatmap, walks and umap colouring", () => {
    const link = readDeepLink("?report=BWH70&scsel=Long%20only,Short%20clade&heatmap=junctions&walk=wEGFR,sEGFR&umap=cn:EGFR");
    expect(link).toEqual({
      report: "BWH70",
      groups: ["Long only", "Short clade"],
      heatmap: "junctions",
      walks: ["wEGFR", "sEGFR"],
      umap: { kind: "cn", gene: "EGFR" },
    });
  });

  it("ignores unknown heatmap types and reads plain umap fields", () => {
    const link = readDeepLink("?heatmap=foo&umap=state");
    expect(link.heatmap).toBeNull();
    expect(link.umap).toEqual({ kind: "field", field: "state" });
    expect(link.groups).toEqual([]);
  });

  it("drops gene colouring without a gene", () => {
    expect(readDeepLink("?umap=gene:").umap).toBeNull();
  });
});

describe("linkAppliesTo", () => {
  it("matches the report or applies when none is named", () => {
    expect(linkAppliesTo({ report: "BWH70" }, "BWH70")).toBe(true);
    expect(linkAppliesTo({ report: "BWH70" }, "BWH69")).toBe(false);
    expect(linkAppliesTo({ report: null }, "BWH69")).toBe(true);
  });
});

describe("cellsOfGroups", () => {
  const groups = [
    { name: "A", cells: ["c3", "c1"] },
    { name: "B", cells: ["c2", "x"] },
  ];
  it("returns the union in tree order, known cells only", () => {
    expect(cellsOfGroups(groups, ["A", "B"], ["c1", "c2", "c3"])).toEqual(["c1", "c2", "c3"]);
    expect(cellsOfGroups(groups, ["B"], ["c1", "c2", "c3"])).toEqual(["c2"]);
    expect(cellsOfGroups(groups, [], ["c1"])).toEqual([]);
  });
});

describe("walkIdsForLabels", () => {
  const walks = [
    { id: "36", label: "wEGFR" },
    { id: "8", label: "sEGFR" },
    { id: "93", label: "MYCN 3" },
  ];
  it("finds walks by label, case-insensitive, then id, keeping order", () => {
    expect(walkIdsForLabels(walks, ["sEGFR", "wegfr", "93", "nope"])).toEqual(["8", "36", "93"]);
  });
});

describe("singleCellStillLoading", () => {
  it("is true while loading or before the patient resolves", () => {
    expect(singleCellStillLoading({ loading: true })).toBe(true);
    expect(singleCellStillLoading({ loading: false, patient: null, missing: false, error: null })).toBe(true);
    expect(singleCellStillLoading({ loading: false, patient: { caseReportId: "P" } })).toBe(false);
    expect(singleCellStillLoading({ loading: false, patient: null, missing: true })).toBe(false);
  });
});

describe("readViewLink", () => {
  it("parses palette, clone colours, tracks and figure/composition/dosage params", () => {
    const link = readViewLink(
      "?cnpal=deck&clonecolors=Clone1:3b53a4,Clone%202:%232CA6A4,bad:xyz&tracks=total,coverage&figpatient=BWH69&figwalk=MYCN%203&figgenes=CDK4,MDM2,X&comp=Region&compby=groups&compcount=1&cngene=EGFR&exprgenes=EGFR,SOX4"
    );
    expect(link.cnPalette).toBe("deck");
    expect(link.cloneColors).toEqual({ Clone1: "#3B53A4", "Clone 2": "#2CA6A4" });
    expect(link.tracks).toEqual(["total", "coverage"]);
    expect(link.figPatient).toBe("BWH69");
    expect(link.figWalk).toBe("MYCN 3");
    expect(link.figGenes).toEqual(["CDK4", "MDM2"]);
    expect(link.composition).toBe("Region");
    expect(link.compositionBy).toBe("groups");
    expect(link.compositionCounts).toBe(true);
    expect(link.cnGene).toBe("EGFR");
    expect(link.exprGenes).toEqual(["EGFR", "SOX4"]);
  });

  it("defaults to nothing", () => {
    const link = readViewLink("");
    expect(link.cnPalette).toBeNull();
    expect(link.cloneColors).toEqual({});
    expect(link.cloneLabels).toEqual({});
    expect(readViewLink("?clonelabels=Clone%204:CI,Clone%201:EC1").cloneLabels).toEqual({ "Clone 4": "CI", "Clone 1": "EC1" });
    expect(link.compositionCounts).toBe(false);
  });
});

describe("withCloneOverrides", () => {
  it("replaces only known clones", () => {
    expect(withCloneOverrides({ A: "#000000", B: "#111111" }, { B: "#222222", C: "#333333" })).toEqual({ A: "#000000", B: "#222222" });
  });
});
