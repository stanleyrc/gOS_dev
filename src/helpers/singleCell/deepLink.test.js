import { cellsOfGroups, linkAppliesTo, readDeepLink, singleCellStillLoading, walkIdsForLabels } from "./deepLink";

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
