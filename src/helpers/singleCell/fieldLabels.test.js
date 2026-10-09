import { fieldLabel } from "./fieldLabels";

describe("fieldLabel", () => {
  it("names known Seurat / pipeline fields", () => {
    expect(fieldLabel("state")).toBe("State");
    expect(fieldLabel("seurat_clusters")).toBe("Seurat cluster");
    expect(fieldLabel("clone_id")).toBe("Clone");
    expect(fieldLabel("nFeature_RNA")).toBe("Genes detected");
  });
  it("tidies unknown names without losing acronyms", () => {
    expect(fieldLabel("Region_Annotation")).toBe("Region annotation");
    expect(fieldLabel("tumor_region")).toBe("Tumor region");
    expect(fieldLabel("RNA_snn_res.0.8")).toBe("RNA snn res 0 8");
    expect(fieldLabel("cellType")).toBe("Cell type");
    expect(fieldLabel("MGH303")).toBe("MGH303");
  });
  it("handles empty input", () => {
    expect(fieldLabel(null)).toBe("");
    expect(fieldLabel("")).toBe("");
  });
});
