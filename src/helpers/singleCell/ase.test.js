import { aseHeadline, aseIgvView, cellPattern, cellsByClone, filterGenes, foldShares, geneCells, parseAse, qText, scatterGenes, wilson } from "./ase";

const RAW = {
  format: "gos-sc-ase-v1",
  summary: { n_cells: 3, n_genes: 3, n_genes_dna: 2, n_imbalanced_q05: 2, by_class: { monoallelic: 1, dosage: 1 }, n_switch: 1, median_reads_per_cell: 40 },
  cells: [
    { cell_id: "c1", rna_id: "r1", clone: "Clone1" },
    { cell_id: "c2", rna_id: "r2", clone: "Clone2" },
    { cell_id: "c3", rna_id: "r3", clone: null },
  ],
  genes: [
    { gene: "G1", rna: 0.05, dna: 0.5, delta: -0.45, q: 0.001, q_imb: 0.001, class: "monoallelic", reads: 100, cells: 3, cell_values: [[0, 0, 10, 0.5, 1, 1], [1, 1, 20, 0.5, 1, 1], [2, 0, 0, 0.5, 1, 1]] },
    { gene: "G2", rna: 0.9, dna: 0.9, delta: 0, q: 0.9, q_imb: 0.01, class: "dosage", reads: 50, cells: 3, switch: null },
    { gene: "G3", rna: 0.5, dna: null, q: null, class: null, reads: 30, cells: 4, switch: { hi: "Clone1", lo: "Clone2" } },
  ],
  findings: [
    { id: "a", gene: "G2", score: 1, severity: "low", loci: [{ chromosome: "1", position: 5 }], cells: ["r1"] },
    { id: "b", gene: "G1", score: 5, severity: "high", loci: [{ chromosome: "7", position: 10 }], cells: ["r1", "r2"] },
  ],
  ase_reads: { r2: "rna/ase_reads/r2.bam", r1: "rna/ase_reads/r1.bam" },
};

describe("ase helpers", () => {
  const ase = parseAse(RAW);

  test("parseAse sorts findings and indexes genes", () => {
    expect(parseAse(null)).toBeNull();
    expect(parseAse({})).toBeNull();
    expect(ase.findings[0].id).toBe("b");
    expect(ase.byGene.get("G1").cls).toBe("monoallelic");
    expect(Number.isNaN(ase.byGene.get("G3").dna)).toBe(true);
    expect(ase.byGene.get("G2").hasCells).toBe(false);
  });

  test("geneCells expands compact rows and drops cells without reads", () => {
    const cells = geneCells(ase, "G1");
    expect(cells).toHaveLength(2);
    expect(cells[0]).toMatchObject({ cellId: "c1", rnaId: "r1", clone: "Clone1", a: 0, b: 10, n: 10, frac: 0, exp: 0.5 });
    expect(geneCells(ase, "G2")).toEqual([]);
    expect(geneCells(ase, "nope")).toEqual([]);
  });

  test("cellsByClone pools reads per clone and puts Unassigned last", () => {
    const cells = [
      { clone: "Unassigned", a: 5, b: 5, n: 10, frac: 0.5, exp: 0.5 },
      { clone: "Clone1", a: 9, b: 1, n: 10, frac: 0.9, exp: 0.5 },
      { clone: "Clone1", a: 10, b: 0, n: 10, frac: 1, exp: 0.5 },
      { clone: "Clone2", a: 0, b: 10, n: 10, frac: 0, exp: NaN },
    ];
    const { order, groups } = cellsByClone(cells);
    expect(groups.map((g) => g.clone)).toEqual(["Clone1", "Clone2", "Unassigned"]);
    expect(groups[0]).toMatchObject({ from: 0, to: 1, a: 19, b: 1, cells: 2 });
    expect(groups[0].rna).toBeCloseTo(0.95);
    expect(groups[0].dna).toBeCloseTo(0.5);
    expect(Number.isNaN(groups[1].dna)).toBe(true);
    expect(order.map((c) => c.x)).toEqual([0, 1, 2, 3]);
  });

  test("wilson interval brackets the share", () => {
    const [lo, hi] = wilson(5, 10);
    expect(lo).toBeLessThan(0.5);
    expect(hi).toBeGreaterThan(0.5);
    expect(wilson(0, 0).every(Number.isNaN)).toBe(true);
    expect(wilson(0, 20)[0]).toBe(0);
  });

  test("cellPattern counts monoallelic and biallelic cells", () => {
    const p = cellPattern([
      { n: 10, frac: 1 },
      { n: 10, frac: 0 },
      { n: 10, frac: 0.5 },
      { n: 1, frac: 1 },
    ]);
    expect(p).toEqual({ onlyA: 1, onlyB: 1, both: 1, total: 3 });
  });

  test("scatter and table filters", () => {
    const sc = scatterGenes(ase);
    expect(sc.map((g) => g.gene)).toEqual(["G1", "G2"]);
    // G1: balanced DNA, RNA mostly B -> folded onto B
    expect(sc[0].x).toBeCloseTo(0.5);
    expect(sc[0].y).toBeCloseTo(0.95);
    expect(foldShares(0.2, 0.3)).toEqual({ x: 0.8, y: 0.7 });
    expect(foldShares(0.8, 0.3)).toEqual({ x: 0.8, y: 0.3 });
    expect(foldShares(NaN, 0.3)).toBeNull();
    expect(filterGenes(ase.genes, { cls: "called" }).map((g) => g.gene)).toEqual(["G1", "G2", "G3"]);
    expect(filterGenes(ase.genes, { cls: "switch" }).map((g) => g.gene)).toEqual(["G3"]);
    expect(filterGenes(ase.genes, { cls: "dosage" }).map((g) => g.gene)).toEqual(["G2"]);
    expect(filterGenes(ase.genes, { cls: "all", query: "g1" }).map((g) => g.gene)).toEqual(["G1"]);
  });

  test("IGV view uses slices of the gene's cells, most reads first", () => {
    const v = aseIgvView(ase.findings[0], ase, "P1");
    expect(v.rnaTracks.map((t) => t.rna_id)).toEqual(["r2", "r1"]);
    expect(v).toMatchObject({ chromosome: "7", position: 10, label: "G1 ASE" });
    expect(aseIgvView({ gene: "G1", loci: [] }, ase, "P1")).toBeNull();
    expect(aseIgvView(ase.findings[1], { ...ase, aseReads: {} }, "P1")).toBeNull();
  });

  test("text helpers", () => {
    expect(qText(0.0123)).toBe("q 0.012");
    expect(qText(2e-6)).toBe("q 2e-6");
    expect(qText(NaN)).toBe("–");
    expect(aseHeadline(ase)).toMatchObject({ cells: 3, genes: 3, beyond: 1, dosage: 1, switches: 1 });
  });
});
