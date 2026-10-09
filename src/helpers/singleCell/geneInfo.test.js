import { GBM_GENES, gbmPrograms, gliomaQuery, parseCancerGeneList, parseMyGene, searchAliases } from "./geneInfo";

describe("gene info", () => {
  it("knows the core GBM drivers", () => {
    ["EGFR", "PTEN", "CDKN2A", "MDM2", "CDK4", "TERT"].forEach((g) => expect(GBM_GENES[g].kind).toBe("driver"));
  });

  it("finds Neftel and glioma 3CA programs containing a gene", () => {
    const gmt = [
      { term: "3CA_16_MES_GLIOMA", genes: ["CD44", "VIM"] },
      { term: "3CA_12_EMT_1", genes: ["VIM"] },
    ];
    expect(gbmPrograms("VIM", gmt)).toEqual(["MES-like (Neftel)", "3CA MES GLIOMA"]);
    expect(gbmPrograms("MARS1", gmt)).toEqual([]);
  });

  it("searches PubMed with the symbol and gene-like aliases only", () => {
    expect(searchAliases("MARS1", ["MARS", "MetRS", "ILLD", "a"])).toEqual(["MARS1"]);
    expect(searchAliases("MDM2", ["HDM2", "MGC5370", "ACTFS"])).toEqual(["MDM2", "HDM2", "MGC5370", "ACTFS"]);
    expect(gliomaQuery("MDM2", ["HDM2"])).toBe('("MDM2"[tiab] OR "HDM2"[tiab]) AND (glioblastoma[tiab] OR glioma[tiab])');
  });

  it("parses a MyGene.info hit", () => {
    const info = parseMyGene({ _id: "4141", symbol: "MARS1", name: "methionyl-tRNA synthetase 1", alias: "MARS", genomic_pos: [{ chr: "12", start: 57475436 }] });
    expect(info).toMatchObject({ symbol: "MARS1", aliases: ["MARS"], entrez: "4141", locus: "chr12:57,475,436" });
    expect(parseMyGene(undefined)).toBeNull();
  });

  it("parses the OncoKB cancer gene list", () => {
    const text = "Hugo Symbol\tEntrez Gene ID\tGene Type\t# of occurrence within resources (Column K-P)\tCOSMIC CGC (v99)\nMDM2\t4193\tONCOGENE\t6\tYes\nFOO\t1\tINSUFFICIENT_EVIDENCE\t1\tNo\n";
    const m = parseCancerGeneList(text);
    expect(m.get("MDM2")).toEqual({ type: "oncogene", sources: 6, cgc: true });
    expect(m.get("FOO").type).toBe("");
  });
});
