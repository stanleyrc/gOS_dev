import {
  DEFAULT_SELECTION,
  buildDriverEntries,
  driverBranchMarks,
  entryStates,
  parseSelection,
  selectDrivers,
  selectionForKeys,
  serializeSelection,
  snvSiteIndex,
  toggleKey,
  classLabel,
  DM_HELP,
} from "./driverLayer";

const cells = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"];
const ev = (o) => ({ id: "P", seqnames: "7", start: "100", end: "200", Genome_Location: "7:100-200", ...o });
const events = [
  ev({ gene: "EGFR", vartype: "AMP", type: "SCNA", Tier: 1, role: "Oncogene", cell_ids: "c1,c2,c3,c4,c5,c6,c7,c8" }),
  ev({ gene: "TP53", vartype: "SNV", type: "Missense", Variant: "p.R175H", Tier: 1, seqnames: "17", start: "7675088", end: "7675088", Genome_Location: "17:7675088-7675088", cell_ids: "c5,c6,c7" }),
  ev({ gene: "PTEN", vartype: "HOMDEL", type: "SCNA", Tier: 2, role: "Tumor Suppressor", cell_ids: "c7,c8" }),
  ev({ gene: "ZZZ3", vartype: "SNV", type: "Missense", Tier: 3, seqnames: "3", start: "50", end: "50", Genome_Location: "3:50-50", cell_ids: "c1,c2,c3" }),
  ev({ gene: "upstream of A::B", fusion_genes: "upstream of A::B", vartype: "fusion", type: "Fusion", Tier: 1, role: "Oncogene", upstream_only: true, cell_ids: "c1,c2,c3,c4" }),
  ev({ gene: "C::D", fusion_genes: "C::D", vartype: "fusion", type: "Fusion", Tier: 1, role: "Oncogene", cell_ids: "c1,c2,c3,c4" }),
  ev({ gene: "", vartype: "DM", type: "Complex SV", Genome_Location: "12:1-9", cell_ids: "c1,c2,c3,c4" }),
];
const snv = {
  variants: [{ id: "chr17_7675088_C_T", driver: true }, { id: "chr3_50_A_G" }],
  status: Array.from({ length: 8 }, (_, p) => [p >= 4 && p <= 6 ? 1 : p === 7 ? -1 : 0, 0]),
  cells,
};
const rnaFusionCells = (e) => (e.fusion_genes === "C::D" ? new Set(["c3", "c4", "c5"]) : null);
const build = () => buildDriverEntries(events, { tumorIds: cells, snv, rnaFusionCells });

describe("buildDriverEntries", () => {
  it("classifies events, drops nothing and flags upstream-only fusions", () => {
    const e = build();
    expect(e.map((d) => d.cls).sort()).toEqual(["amp", "complex", "fusion", "fusion", "homdel", "snv", "snv"]);
    expect(e.find((d) => d.upstreamOnly).qc.pass).toBe(false);
    expect(e.find((d) => d.cls === "snv" && d.genes[0] === "TP53").snvColumn).toBe(0);
    expect(e.find((d) => d.cls === "snv" && d.genes[0] === "TP53").hotspot).toBe(true);
    expect(e.find((d) => d.genes[0] === "EGFR").subclonal).toBe(false);
  });
  it("labels DM in full without a question mark", () => {
    const dm = build().find((d) => d.cls === "complex");
    expect(classLabel(dm)).toBe(DM_HELP);
    expect(DM_HELP).not.toMatch(/\?/);
  });
});

describe("selection", () => {
  it("recommended = tier 1-2, cancer gene, QC pass, no upstream-only fusion; All keeps them", () => {
    const e = build();
    const rec = selectDrivers(e, DEFAULT_SELECTION).map((d) => d.label);
    expect(rec).toContain("EGFR amp");
    expect(rec).toContain("C::D");
    expect(rec).not.toContain("upstream of A::B");
    expect(rec).not.toContain("ZZZ3");
    expect(rec.some((l) => /^DM/.test(l))).toBe(true);
    const all = selectDrivers(e, { ...DEFAULT_SELECTION, preset: "all" });
    expect(all).toHaveLength(7);
    expect(all.some((d) => d.upstreamOnly)).toBe(true);
  });
  it("subclonal and hotspots presets", () => {
    const e = build();
    const sub = selectDrivers(e, { ...DEFAULT_SELECTION, preset: "subclonal" });
    expect(sub.every((d) => d.subclonal)).toBe(true);
    expect(sub.find((d) => d.genes[0] === "EGFR")).toBeUndefined();
    const hot = selectDrivers(e, { ...DEFAULT_SELECTION, preset: "hotspots" });
    expect(hot.map((d) => d.genes[0])).toEqual(["TP53"]);
  });
  it("filters: class, clonality, min cells, fusion support", () => {
    const e = build();
    const sel = (filters, preset = "all") => selectDrivers(e, { ...DEFAULT_SELECTION, preset, filters: { ...DEFAULT_SELECTION.filters, ...filters } });
    expect(sel({ classes: ["amp", "homdel"] }).map((d) => d.cls).sort()).toEqual(["amp", "homdel"]);
    expect(sel({ clonality: "clonal" }).map((d) => d.cls)).toEqual(["amp"]);
    expect(sel({ minCells: 4 }).every((d) => d.n >= 4)).toBe(true);
    expect(sel({ fusionSupport: "both", classes: ["fusion"] }).map((d) => d.label)).toEqual(["C::D"]);
    expect(sel({ fusionSupport: "rna", classes: ["fusion"] }).map((d) => d.label)).toEqual(["C::D"]);
    expect(sel({ genes: ["pten"] }).map((d) => d.genes[0])).toEqual(["PTEN"]);
    expect(sel({ tiers: [3] }).map((d) => d.genes[0])).toEqual(["ZZZ3"]);
  });
  it("add / remove / toggle", () => {
    const e = build();
    const zzz = e.find((d) => d.genes[0] === "ZZZ3").key;
    const egfr = e.find((d) => d.genes[0] === "EGFR").key;
    let sel = toggleKey(e, DEFAULT_SELECTION, zzz);
    expect(selectDrivers(e, sel).some((d) => d.key === zzz)).toBe(true);
    sel = toggleKey(e, sel, egfr);
    expect(selectDrivers(e, sel).some((d) => d.key === egfr)).toBe(false);
    expect(sel.add).toEqual([zzz]);
    expect(sel.remove).toEqual([egfr]);
    const exact = selectionForKeys(e, DEFAULT_SELECTION, [zzz]);
    expect(selectDrivers(e, exact).map((d) => d.key)).toEqual([zzz]);
  });
});

describe("URL", () => {
  it("round-trips a selection and is empty for the default", () => {
    expect(serializeSelection(DEFAULT_SELECTION)).toEqual({});
    expect(parseSelection("?tab=7")).toBeNull();
    const sel = { preset: "subclonal", add: ["EGFR amp|7:1-2"], remove: ["x|y"], filters: { ...DEFAULT_SELECTION.filters, tiers: [1, 2], lists: ["gbm"], genes: ["EGFR"], classes: ["snv", "amp"], clonality: "subclonal", minCells: 5, fusionSupport: "both" } };
    const q = new URLSearchParams(serializeSelection(sel)).toString();
    expect(parseSelection(`?${q}`)).toEqual(sel);
  });
});

describe("entryStates", () => {
  const order = cells;
  const e = build();
  const ctx = {
    order,
    snv,
    snvRows: Int32Array.from(order.map((_, i) => i)),
    chromoBins: { 7: { startPlace: 1000, startPoint: 1 } },
    cn: { rows: order.map((_, i) => ({ binIndex: { sorted: [0], sortedStarts: [1000], gEnd: [2000] }, values: [i === 0 ? 8 : 2] })) },
    cnRows: Int32Array.from(order.map((_, i) => i)),
  };
  it("SNV genotype: mutant / WT / no coverage", () => {
    const s = entryStates(e.find((d) => d.genes[0] === "TP53"), ctx);
    expect(Array.from(s)).toEqual([1, 1, 1, 1, 2, 2, 2, 0]);
  });
  it("fusion support bits and complex carriers", () => {
    expect(Array.from(entryStates(e.find((d) => d.label === "C::D"), ctx))).toEqual([1, 1, 3, 3, 2, 0, 0, 0]);
    expect(Array.from(entryStates(e.find((d) => d.cls === "complex"), ctx))).toEqual([1, 1, 1, 1, 0, 0, 0, 0]);
  });
});

describe("driverBranchMarks", () => {
  const nodes = [
    { parent: -1, isLeaf: false, firstLeaf: 0, lastLeaf: 3 },
    { parent: 0, isLeaf: false, firstLeaf: 0, lastLeaf: 1 },
    { parent: 0, isLeaf: false, firstLeaf: 2, lastLeaf: 3 },
    ...[0, 1, 2, 3].map((r) => ({ parent: r < 2 ? 1 : 2, isLeaf: true, firstLeaf: r, lastLeaf: r })),
  ];
  const layout = { nodes, leaves: ["a", "b", "c", "d"] };
  it("places a driver on the branch of its clade, skips the root stem", () => {
    const marks = driverBranchMarks([{ key: "k", label: "X amp", carriers: ["a", "b"] }, { key: "r", label: "root", carriers: ["a", "b", "c", "d"] }], layout);
    expect([...marks.keys()]).toEqual([1]);
    expect(marks.get(1)[0].label).toBe("X amp");
  });
});

describe("snvSiteIndex", () => {
  it("indexes variants by chrom:pos", () => {
    expect(snvSiteIndex(snv).get("17:7675088")).toBe(0);
  });
});
