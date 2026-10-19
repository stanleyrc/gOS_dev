import { cdsBases, hg38GeneToSplice, mergeSpliceModels, modelCounts } from "./spliceModels";

const hg = (name, canon, exons, chromosome = "1") => ({ name, chromosome, strand: "+", transcripts: [{ id: canon, canonical: true, exons, cds: [exons[0][0] + 10, exons[exons.length - 1][1] - 10] }] });
const splice = { format: "x", genes: { A: { chrom: "1", strand: "+", transcripts: [{ id: "T1.2", canonical: true, exons: [[1, 100], [200, 300]] }] }, B: { chrom: "1", strand: "+", transcripts: [{ id: "TB", canonical: true, exons: [[1, 50], [90, 120]] }] } } };

describe("mergeSpliceModels", () => {
  const h = [hg("A", "T1", [[1, 100], [200, 300]]), hg("B", "OTHER", [[5, 60], [90, 120]]), hg("C", "TC", [[1, 10], [20, 30]])];
  const m = mergeSpliceModels(splice, h);
  it("prefers hg38 where the canonical transcripts agree (version ignored)", () => {
    expect(m.genes.A.source).toBe("hg38_models");
    expect(m.genes.A.transcripts[0].cds).toEqual([11, 290]);
  });
  it("keeps splice_exons where the models disagree", () => {
    expect(m.genes.B.source).toBeUndefined();
  });
  it("adds genes splice_exons lacks, only the wanted ones when asked", () => {
    expect(m.genes.C.transcripts).toHaveLength(1);
    expect(mergeSpliceModels(splice, h, ["A"]).genes.C).toBeUndefined();
  });
  it("falls back to splice_exons without hg38 genes and tolerates no splice_exons", () => {
    expect(mergeSpliceModels(splice, []).genes.A.source).toBeUndefined();
    expect(mergeSpliceModels(null, h).genes.C).toBeTruthy();
  });
  it("counts clusters' genes with a model", () => {
    const c = [{ gene: "A" }, { gene: "C" }, { gene: "Z" }];
    expect(modelCounts(splice, c)).toEqual({ total: 3, withModel: 1, fromHg38: 0 });
    expect(modelCounts(m, c)).toEqual({ total: 3, withModel: 2, fromHg38: 2 });
  });
  it("converts one gene and counts CDS bases", () => {
    expect(hg38GeneToSplice(h[0]).chrom).toBe("1");
    expect(cdsBases(hg38GeneToSplice(h[0]).transcripts[0], 1, 1000)).toBe(280 - 99);
    expect(cdsBases({ exons: [[1, 2]] }, 1, 2)).toBeNull();
  });
});
