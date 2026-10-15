import { externalLinks, linkGenes, proteinChange } from "./externalLinks";

describe("externalLinks", () => {
  it("builds cBioPortal GBM and pan-cancer links for a gene", () => {
    const l = externalLinks("GENEA");
    expect(l.map((x) => x.key)).toEqual(["cbio-gbm", "cbio-pancan", "oncokb", "cosmic"]);
    expect(l[0].href).toContain("gbm_tcga_pan_can_atlas_2018");
    expect(l[0].href).toContain("gene_list=GENEA");
    expect(l[1].href.split("cancer_study_list=")[1].split("&")[0].split(",")).toHaveLength(32);
  });
  it("adds mutation-level links when a protein change is given", () => {
    const l = externalLinks("GENEA", "p.R12*");
    expect(l.map((x) => x.key)).toContain("oncokb-var");
    expect(l.find((x) => x.key === "oncokb-var").href).toBe("https://www.oncokb.org/gene/GENEA/R12*");
    expect(proteinChange("p.M1?")).toBe("M1?");
    expect(proteinChange("")).toBeNull();
    expect(externalLinks(null)).toEqual([]);
  });
  it("pulls gene symbols out of event labels", () => {
    expect(linkGenes("GENEA::GENEB")).toEqual(["GENEA", "GENEB"]);
    expect(linkGenes("chr7 amp")).toEqual([]);
  });
});
