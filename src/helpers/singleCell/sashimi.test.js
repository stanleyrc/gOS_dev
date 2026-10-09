import {
  byGroupEvidence,
  sashimiGroups,
  cellPsiByGroup,
  cohortOverview,
  cohortVariantRows,
  junctionType,
  mostVariableJunction,
  rankClustersByGroup,
  sashimiArcs,
  sashimiAxis,
  variantLoci,
  variantSliceCells,
  variantVsCopyNumber,
} from "./sashimi";

const cluster = {
  id: "clu_7_100_900_+",
  gene: "G",
  chromosome: "7",
  junctions: [
    { start: 201, end: 499, annotated: true, type: "annotated" },
    { start: 201, end: 799, annotated: false, type: "exon_skip", n_skipped: 1 },
    { start: 601, end: 799, annotated: true },
  ],
  exons: [
    [100, 200],
    [500, 600],
    [800, 900],
  ],
};

describe("sashimi axis", () => {
  const ax = sashimiAxis(cluster, 0, 600);
  it("spans exons and junction ends, monotone, inside the panel", () => {
    expect(ax.lo).toBe(100);
    expect(ax.hi).toBe(901);
    const xs = [100, 150, 200, 300, 500, 700, 850, 901].map(ax.x);
    expect(xs.every((v, i) => i === 0 || v >= xs[i - 1])).toBe(true);
    expect(xs[0]).toBe(0);
    expect(xs[xs.length - 1]).toBeCloseTo(600);
    expect(ax.exons).toHaveLength(3);
  });
  it("compresses introns relative to exons", () => {
    const exonW = ax.x(201) - ax.x(100);
    const intronW = ax.x(500) - ax.x(201);
    // the 299 bp intron is not ~3x the 101 bp exon
    expect(intronW / exonW).toBeLessThan(2.5);
  });
  it("adds a foot for anchors outside every exon", () => {
    const a = sashimiAxis({ exons: [[100, 200]], junctions: [{ start: 201, end: 5000 }] }, 0, 300);
    expect(a.exons.some((e) => e.pseudo)).toBe(true);
    expect(a.x(5001)).toBeGreaterThan(a.x(201));
  });
  it("puts arcs on alternating sides from the anchors", () => {
    const arcs = sashimiArcs(cluster.junctions, ax.x);
    expect(arcs[1].xa).toBeCloseTo(ax.x(200));
    expect(arcs[1].xb).toBeCloseTo(ax.x(800));
    expect(arcs[1].above).toBe(true);
    expect(arcs.filter((a) => a.above)).toHaveLength(2);
    expect(arcs[2].type).toBe("annotated");
  });
  it("falls back to the annotated flag for the type", () => {
    expect(junctionType({ annotated: false })).toBe("novel");
    expect(junctionType({})).toBe("annotated");
  });
});

const cohort = {
  patients: ["A", "B", "C"],
  clusters: [
    { id: "x", gene: "G", q: 0.001, max_dpsi: 0.6, junctions: [{ start: 1, end: 9 }, { start: 1, end: 20 }], usage: { A: { counts: [90, 10] }, B: { counts: [30, 70] }, C: { counts: [1, 1] } } },
    { id: "y", gene: "H", q: 0.01, max_dpsi: 0.2, junctions: [{ start: 1, end: 9 }, { start: 1, end: 20 }], usage: { A: { counts: [50, 50] }, B: { counts: [40, 60] } } },
  ],
  variants: [{ id: "EGFRvIII", gene: "EGFR", usage: { A: { alt: 3, ref: 1, n_cells_alt: 2, n_cells: 3 } } }],
};

describe("cohort overview", () => {
  it("picks the most variable junction and masks low-coverage patients", () => {
    const rows = cohortOverview(cohort, { minReads: 20, minPatients: 2 });
    expect(rows.map((r) => r.id)).toEqual(["x", "y"]);
    expect(rows[0].psi[0]).toBeCloseTo(0.9);
    expect(rows[0].psi[1]).toBeCloseTo(0.3);
    expect(Number.isNaN(rows[0].psi[2])).toBe(true);
    expect(mostVariableJunction([[0.5, 0.5], [0.1, 0.9]])).toBe(0);
  });
  it("tabulates known variants per patient", () => {
    const v = cohortVariantRows(cohort)[0];
    expect(v.rows[0]).toMatchObject({ patient: "A", alt: 3, nAlt: 2, frac: 0.75 });
    expect(Number.isNaN(v.rows[1].frac)).toBe(true);
  });
});

describe("clusters by group", () => {
  const cells = {};
  for (let i = 0; i < 12; i += 1) cells[`a${i}`] = [9, 1];
  for (let i = 0; i < 12; i += 1) cells[`b${i}`] = [1, 9];
  cells.z = [1, 1];
  const c = { id: "c", gene: "G", junctions: [{}, {}], cells };
  const flat = { id: "f", gene: "F", junctions: [{}, {}], cells: Object.fromEntries(Object.keys(cells).map((k) => [k, [5, 5]])) };
  const groupOf = (id) => (id.startsWith("a") ? "1" : id.startsWith("b") ? "2" : "NA");
  it("collects per-cell PSI per group, NA left out", () => {
    const m = cellPsiByGroup(c, groupOf, 0);
    expect([...m.keys()]).toEqual(["1", "2"]);
    expect(m.get("1")[0]).toBeCloseTo(0.9);
  });
  it("ranks differential clusters with a small q", () => {
    const rows = rankClustersByGroup([c, flat], groupOf);
    expect(rows[0].q).toBeLessThan(1e-3);
    expect(rows[0].dpsi).toBeCloseTo(0.8);
    expect(rows[1].p).toBeGreaterThan(0.5);
  });
});

describe("variant helpers", () => {
  const variant = { alt_junction: { chromosome: "7", start: 55019366, end: 55155829 }, cells: { r1: [3, 0], r2: [0, 4], r3: [1, 1], r4: [0, 0] } };
  it("compares copy number of carriers and other covered cells", () => {
    const cellOf = new Map([["r1", "c1"], ["r2", "c2"], ["r3", "c3"], ["r4", "c4"]]);
    const cn = new Map([["c1", 40], ["c2", 3], ["c3", 30], ["c4", 2]]);
    const r = variantVsCopyNumber(variant, cellOf, cn);
    expect(r.carriers.sort()).toEqual([30, 40]);
    expect(r.others).toEqual([3]);
    expect(r.medianCarriers).toBe(35);
  });
  it("gives IGV loci and slice cells", () => {
    expect(variantLoci(variant)).toEqual([{ chromosome: "7", position: 55019365 }, { chromosome: "7", position: 55155830 }]);
    const s = variantSliceCells(variant, { r1: "rna/splice_reads/r1.bam", r2: "rna/splice_reads/r2.bam", r3: "x.bam" }, 6);
    expect(s.carriers.map((r) => r.rna_id)).toEqual(["r1", "r3"]);
    expect(s.default.map((r) => r.rna_id)).toEqual(["r1", "r3", "r2"]);
  });
});

describe("table order and track pooling", () => {
  it("puts significant, substantial clusters first", () => {
    const rows = [{ id: "a", q: 1e-6, dpsi: 0.02 }, { id: "b", q: 0.01, dpsi: 0.4 }, { id: "c", q: NaN, dpsi: 0.9 }];
    expect(rows.sort(byGroupEvidence).map((r) => r.id)).toEqual(["b", "c", "a"]);
  });
  it("pools small groups into one track", () => {
    const groups = [1, 2, 3, 4].map((i) => ({ group: `${i}`, counts: [i, 1], nCells: i, total: i + 1 }));
    const out = sashimiGroups(groups, 3, "other");
    expect(out.map((g) => g.group)).toEqual(["3", "4", "other (2)"]);
    expect(out[2].counts).toEqual([3, 2]);
    expect(sashimiGroups(groups, 8)).toHaveLength(4);
  });
});
