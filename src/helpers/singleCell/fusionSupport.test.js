import { compareSupport, fusionSupport, indexDnaEvents, indexRnaFusions, supportText } from "./fusionSupport";

const rna = { gene1: "EGFR", gene2: "SEC61G", n_cells: 30, reads: 1200, dna_match: null };
const rna2 = { gene1: "EGFR(100)", gene2: "X", n_cells: 5, reads: 10, dna_match: { kind: "gene_pair", event_gene: "SEC61G::EGFR" } };
const ev = { gene: "EGFR::SEC61G", vartype: "fusion", n_cells: 12 };
const up = { gene: "upstream of A::upstream of B", fusion_genes: "A::B", upstream_only: true, n_cells: 9 };

describe("fusion support", () => {
  it("indexes RNA fusions by gene pair, either order, plus dna_match", () => {
    const idx = indexRnaFusions([rna2, rna]);
    expect(idx.get("EGFR::SEC61G").map((f) => f.n_cells)).toEqual([30, 5]);
  });
  it("indexes DNA events keeping the largest", () => {
    const idx = indexDnaEvents([{ ...ev, n_cells: 3 }, ev, { gene: "KRAS" }]);
    expect(idx.get("EGFR::SEC61G").n_cells).toBe(12);
    expect(idx.size).toBe(1);
  });
  it("classifies both / DNA / upstream-only / RNA", () => {
    expect(fusionSupport({ dna: ev, rna }).kind).toBe("both");
    expect(fusionSupport({ dna: ev }).kind).toBe("dna");
    expect(fusionSupport({ dna: up }).kind).toBe("dna-upstream");
    expect(fusionSupport({ dna: up, rna }).kind).toBe("both");
    expect(fusionSupport({ rna }).kind).toBe("rna");
    expect(fusionSupport({ rna: rna2 }).kind).toBe("both"); // dna_match without an event record
    expect(fusionSupport({}).kind).toBe("none");
  });
  it("treats an unloaded RNA file as unknown, not zero", () => {
    expect(fusionSupport({ dna: ev, rnaKnown: false }).rnaCells).toBeNull();
    expect(fusionSupport({ dna: ev }).rnaCells).toBe(0);
  });
  it("sorts both above RNA above DNA above upstream-only and formats text", () => {
    const s = [fusionSupport({ dna: up }), fusionSupport({ rna }), fusionSupport({ dna: ev }), fusionSupport({ dna: ev, rna })];
    expect([...s].sort(compareSupport).map((x) => x.kind)).toEqual(["dna-upstream", "dna", "rna", "both"]);
    expect(supportText(s[3])).toBe("both · DNA 12 cells · RNA 30 cells, 1,200 reads");
    expect(supportText(s[0])).toContain("upstream-only DNA");
  });
});
