import { parseSidecar } from "./paperSidecar";
import { DEPMAP_FILE, depLines, geneAtPoint, geneCardData, genesAtPosition, labelGenes, parseDepmap } from "./paperGenes";

const SYMS = new Set(["GENEA", "GENEB", "FUSA", "FUSB", "HLA-A", "ZNF1"]);
const isGene = (s) => SYMS.has(s);

const sidecar = parseSidecar({
  regions: [
    {
      id: "P1", panel: "a", kind: "plot", x: 100, y: 20, w: 60, h: 30,
      xscale: { discrete: false, range: [0, 2] },
      yscale: { discrete: true, range: [0.4, 3.6], labels: ["P1 GENEA", "FUSA::FUSB (P2) e1 > e2", "other"] },
      marks: [{ type: "points", x: [1, 1.5], y: [3, 1], fields: { gene: ["GENEB", "notagene"], patient: ["P1", "P2"] } }],
    },
    {
      id: "X1", panel: "b", kind: "plot", x: 200, y: 20, w: 40, h: 30,
      xscale: { discrete: true, range: [0.4, 2.6], labels: ["ZNF1 loss", "Depth"] },
      yscale: { discrete: false, range: [0, 1] },
      marks: [],
    },
    {
      id: "T1", panel: "c", kind: "rows", x: 20, y: 100, w: 100, h: 20, rows: ["c1", "c2"],
      axis: { type: "genome", chr: "7", from: 1000000, to: 2000000 },
    },
  ],
});

describe("labelGenes", () => {
  it("splits fusion and patient-prefixed labels and keeps exact symbols only", () => {
    expect(labelGenes("FUSA::FUSB (P2) e1 > e2", isGene).map((g) => g.gene)).toEqual(["FUSA", "FUSB"]);
    expect(labelGenes("P1 GENEA", isGene).map((g) => g.gene)).toEqual(["GENEA"]);
    expect(labelGenes("HLA-A, geneb", isGene).map((g) => g.gene)).toEqual(["HLA-A"]);
    expect(labelGenes("", isGene)).toEqual([]);
    expect(labelGenes("GENEA", null)).toEqual([]);
  });
});

describe("geneAtPoint", () => {
  it("reads the gene field of the point under the cursor", () => {
    const r = sidecar.regions[0];
    const px = r.x + (1 / 2) * r.w; // x data 1
    const py = r.y + (1 - (3 - 0.4) / 3.2) * r.h; // y data 3
    const g = geneAtPoint(sidecar, px, py, { isGene });
    expect(g).toMatchObject({ gene: "GENEB", kind: "mark" });
  });
  it("ignores a gene field that is not a known symbol", () => {
    const r = sidecar.regions[0];
    const px = r.x + (1.5 / 2) * r.w;
    const py = r.y + (1 - (1 - 0.4) / 3.2) * r.h;
    expect(geneAtPoint(sidecar, px, py, { isGene })).toBeNull();
  });
  it("finds the symbol in the y axis label of the row and picks the one under x for a fusion", () => {
    const r = sidecar.regions[0];
    const rowY = (v) => r.y + (1 - (v - 0.4) / 3.2) * r.h;
    expect(geneAtPoint(sidecar, r.x - 10, rowY(1), { isGene })).toMatchObject({ gene: "GENEA", kind: "axis label" });
    const lab = "FUSA::FUSB (P2) e1 > e2";
    const end = r.x - 2;
    const left = geneAtPoint(sidecar, end - (lab.length - 1) * 3.3, rowY(2), { isGene });
    const mid = geneAtPoint(sidecar, end - (lab.length - 7) * 3.3, rowY(2), { isGene });
    expect(left.gene).toBe("FUSA");
    expect(mid.gene).toBe("FUSB");
    expect(left.genes).toEqual(["FUSA", "FUSB"]);
    expect(geneAtPoint(sidecar, r.x - 10, rowY(3), { isGene })).toBeNull();
  });
  it("reads discrete x labels under the plot", () => {
    const r = sidecar.regions[1];
    const g = geneAtPoint(sidecar, r.x + (1 - 0.4) / 2.2 * r.w, r.y + r.h + 6, { isGene });
    expect(g.gene).toBe("ZNF1");
  });
  it("resolves genome tracks through the spans only when asked", () => {
    const spans = [
      { gene: "GENEA", chromosome: "7", start: 1400000, end: 1600000, coding: true },
      { gene: "LNC1", chromosome: "7", start: 1490000, end: 1510000, coding: false },
      { gene: "GENEB", chromosome: "8", start: 1400000, end: 1600000, coding: true },
    ];
    const x = 20 + 50; // 1.5 Mb
    expect(geneAtPoint(sidecar, x, 110, { isGene, spans })).toBeNull();
    const g = geneAtPoint(sidecar, x, 110, { isGene, spans, genome: true });
    expect(g).toMatchObject({ gene: "GENEA", kind: "genome" });
    expect(g.position.chr).toBe("7");
    expect(geneAtPoint(sidecar, 20 + 5, 110, { isGene, spans, genome: true })).toBeNull();
  });
  it("uses a zoomed window for the genome position", () => {
    const spans = [{ gene: "ZNF1", chromosome: "7", start: 1900000, end: 1950000, coding: true }];
    const g = geneAtPoint(sidecar, 20 + 50, 110, { isGene, spans, genome: true, zoomWin: () => ({ from: 1800000, to: 2000000 }) });
    expect(g.gene).toBe("ZNF1");
  });
  it("is null without a sidecar or a symbol test", () => {
    expect(geneAtPoint(null, 1, 1, { isGene })).toBeNull();
    expect(geneAtPoint(sidecar, 1, 1, {})).toBeNull();
  });
});

describe("genesAtPosition", () => {
  it("prefers coding genes, then the narrowest span", () => {
    const spans = [
      { gene: "WIDE", chromosome: "1", start: 0, end: 1000, coding: true },
      { gene: "NARROW", chromosome: "1", start: 400, end: 500, coding: true },
      { gene: "NC", chromosome: "1", start: 450, end: 460, coding: false },
    ];
    expect(genesAtPosition(spans, "chr1", 455)).toEqual(["NARROW", "WIDE"]);
    expect(genesAtPosition(spans, "2", 455)).toEqual([]);
  });
});

describe("DepMap card data", () => {
  const doc = {
    format: "depmap_amplicon_genes_v1",
    release: { release: "DepMap Public 26Q3" },
    rows: [
      { gene: "GENEA", patient: "P1", max_walk_cells: 12, in_driver_walk: "FALSE", in_depmap: "TRUE", n_lines: 100, n_glioma: 10, chronos_pan_median: -0.4, chronos_glioma_median: -0.6, "frac_pan_lt_0.5": 0.3, "frac_glioma_lt_0.5": 0.7, dep_class: "selective_or_variable", n_amp_lines: 5, effect_amp_median: -1, effect_nonamp_median: -0.3, p_amp_vs_not: 0.0001 },
      { gene: "GENEA", patient: "P2", max_walk_cells: 30, in_driver_walk: "TRUE", in_depmap: "TRUE", n_lines: 100 },
      { gene: "GENEB", patient: "P2", max_walk_cells: 4, in_depmap: "FALSE" },
    ],
  };
  it("rejects other schemas", () => {
    expect(parseDepmap({ format: "x", rows: [] })).toBeNull();
    expect(parseDepmap(null)).toBeNull();
    expect(DEPMAP_FILE).toBe("depmap_amplicon_genes.json");
  });
  it("lists patients by cell count and the Chronos block", () => {
    const dm = parseDepmap(doc);
    const d = geneCardData(dm, "GENEA");
    expect(d.patients.map((p) => [p.patient, p.cells, p.driverWalk])).toEqual([["P2", 30, true], ["P1", 12, false]]);
    expect(d.dep.glioma).toBe(-0.6);
    const lines = depLines(d.dep, dm.release);
    expect(lines[0].text).toContain("glioma median -0.60 (70% of 10 lines");
    expect(lines.map((l) => l.key)).toEqual(["chr", "cls", "amp"]);
  });
  it("gives patients but no Chronos for a gene absent from DepMap, and nothing for an unknown gene", () => {
    const dm = parseDepmap(doc);
    expect(geneCardData(dm, "GENEB")).toMatchObject({ dep: null });
    expect(geneCardData(dm, "GENEB").patients).toHaveLength(1);
    expect(geneCardData(dm, "NOPE")).toEqual({ patients: [], dep: null });
    expect(geneCardData(null, "GENEA")).toEqual({ patients: [], dep: null });
    expect(depLines(null)).toEqual([]);
  });
});
