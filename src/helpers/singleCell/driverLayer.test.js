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
  entryFits,
  f1HiddenCount,
  noF1Keys,
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
    expect(rec.some((l) => /^ecDNA/.test(l))).toBe(true);
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
    expect(parseSelection(`?${q}`)).toEqual({ ...sel, clinical: true });
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

import { collapseColumns, recommendedOrder } from "./driverLayer";
describe("collapseColumns / recommendedOrder", () => {
  const mk = (gene, cls, extra = {}) => ({ key: gene, cls, genes: [gene], label: `${gene} del`, n: 5, subclonal: false, event: { seqnames: "17" }, ...extra });
  it("collapses CN events with the same per-cell pattern, keeps different ones", () => {
    const a = new Float32Array([0, 0, 0, 2, 2]);
    const b = new Float32Array([0, 0, 0, 2, 2]);
    const c = new Float32Array([2, 2, 0, 0, 0]);
    const { columns, collapsed } = collapseColumns([mk("TP53", "homdel"), mk("FANCA", "homdel"), mk("PTEN", "homdel")], [a, b, c]);
    expect(collapsed).toBe(1);
    expect(columns.map((x) => x.label)).toEqual(["chr17 del (TP53, +1)", "PTEN del"]);
    expect(columns[0].genes).toEqual(["TP53", "FANCA"]);
  });
  it("orders hotspot SNVs / fusions, then subclonal, then clonal", () => {
    const e = [mk("A", "homdel"), mk("B", "amp", { subclonal: true }), mk("C", "fusion"), mk("D", "snv", { hotspot: true })];
    expect(recommendedOrder(e).map((d) => d.key)).toEqual(["C", "D", "B", "A"]);
  });
});

describe("Clade F1 filter", () => {
  // leaves a..h; clade nodes: root, left half (a-d), right half (e-h)
  const mk = (first, last, parent) => ({ firstLeaf: first, lastLeaf: last, parent });
  const layout = { nodes: [mk(0, 7, -1), mk(0, 3, 0), mk(4, 7, 0), ...cells.map((_, i) => mk(i, i, i < 4 ? 1 : 2))], leaves: cells };
  const entries = [
    { key: "tight", cls: "snv", genes: ["A"], n: 4, tier: 1, carriers: ["c1", "c2", "c3", "c4"] }, // exactly the left clade: F1 = 1
    { key: "scatter", cls: "snv", genes: ["B"], n: 4, tier: 1, carriers: ["c1", "c3", "c5", "c7"] }, // best clade is the root: F1 = 2*4/(8+4) = 2/3
    { key: "none", cls: "snv", genes: ["C"], n: 1, tier: 1, carriers: [] }, // no score
  ];
  const fits = entryFits(entries, layout);
  const sel = (minF1) => ({ preset: "all", add: [], remove: [], filters: { ...DEFAULT_SELECTION.filters, minF1 } });
  it("scores entries and leaves carrier-less ones without a score", () => {
    expect(fits.get("tight")).toBeCloseTo(1);
    expect(fits.get("scatter")).toBeCloseTo(2 / 3);
    expect(Number.isNaN(fits.get("none"))).toBe(true);
    expect([...noF1Keys(entries, fits)]).toEqual(["none"]);
  });
  it("is off by default and keeps unscored entries when on", () => {
    expect(selectDrivers(entries, sel(0), fits).map((d) => d.key)).toEqual(["tight", "scatter", "none"]);
    expect(selectDrivers(entries, sel(0.8), fits).map((d) => d.key)).toEqual(["tight", "none"]);
    expect(selectDrivers(entries, sel(0.6), fits).map((d) => d.key)).toEqual(["tight", "scatter", "none"]);
    expect(selectDrivers(entries, sel(0.8), null).length).toBe(3);
  });
  it("counts what only the F1 filter hides and round-trips in the URL", () => {
    expect(f1HiddenCount(entries, sel(0), fits)).toBe(0);
    expect(f1HiddenCount(entries, sel(0.9), fits)).toBe(1);
    expect(serializeSelection(sel(0)).drvf).toBeUndefined();
    const q = new URLSearchParams(serializeSelection(sel(0.8))).toString();
    expect(q).toContain("f1%3A0.8");
    expect(parseSelection(`?drvpreset=all&${q}`).filters.minF1).toBe(0.8);
  });
  it("toggleKey respects the filter", () => {
    const next = toggleKey(entries, sel(0.8), "scatter", fits);
    expect(selectDrivers(entries, next, fits).map((d) => d.key)).toEqual(["tight", "none", "scatter"].sort((a, b) => entries.findIndex((e) => e.key === a) - entries.findIndex((e) => e.key === b)));
  });
});

describe("site-evidence warn passes driverQc", () => {
  it("weak and artefact verdicts differ: only artefact / germline fail QC", () => {
    const mk = (verdict) =>
      buildDriverEntries([ev({ gene: "PRKDC", vartype: "SNV", type: "Nonsense", Variant: "p.Y779*", Tier: 2, role: "Tumor Suppressor", seqnames: "8", start: "47927276", end: "47927276", Genome_Location: "8:47927276-47927276", cell_ids: "c1,c2,c3" })], {
        tumorIds: cells,
        verdicts: new Map([["8:47927276", verdict]]),
      })[0];
    expect(mk("weak").qc.pass).toBe(true);
    expect(mk("artefact").qc.pass).toBe(false);
    expect(mk("germline").qc.pass).toBe(false);
  });
});

describe("broad CN-0 homdels fail driverQc", () => {
  it("a HOMDEL flagged broad_cn0 is not Recommended; a focal one is", () => {
    const hd = (gene, extra) => ev({ gene, vartype: "HOMDEL", type: "SCNA", Tier: 2, role: "Tumor Suppressor", cell_ids: "c1,c2,c3", ...extra });
    const entries = buildDriverEntries([hd("CDKN2A", { broad_cn0: false, seqnames: "9", Genome_Location: "9:21967753-21995301" }), hd("NF2", { broad_cn0: true, cn0_segment_mb_median: 50.8, seqnames: "22", Genome_Location: "22:29603556-29698598" })], { tumorIds: cells });
    const nf2 = entries.find((d) => d.genes[0] === "NF2");
    expect(nf2.qc.pass).toBe(false);
    expect(nf2.qc.reasons.join(" ")).toMatch(/50.8 Mb/);
    expect(selectDrivers(entries, DEFAULT_SELECTION).map((d) => d.genes[0])).toEqual(["CDKN2A"]);
  });
});

describe("tier limit: <= 2 + damaging missense", () => {
  const dmg = "SIFT deleterious (0.01); PolyPhen probably damaging (0.99)";
  const snvEv = (gene, extra) => ev({ gene, vartype: "SNV", type: "Missense", Tier: 3, seqnames: "3", start: "5000", end: "5000", Genome_Location: "3:5000-5000", cell_ids: "c1,c2,c3", ...extra });
  const entries = (verdict) =>
    buildDriverEntries(
      [snvEv("ZZZ3", { driver_evidence: dmg }), snvEv("YYY1", { start: "6000", end: "6000", driver_evidence: "SIFT tolerated; PolyPhen benign" }), snvEv("QQQ2", { start: "7000", end: "7000", driver_evidence: dmg, cell_ids: "c1" })],
      { tumorIds: cells, verdicts: verdict ? new Map([["3:5000", verdict]]) : null }
    );
  const rec = (e, filters) => selectDrivers(e, { ...DEFAULT_SELECTION, filters: { ...DEFAULT_SELECTION.filters, ...filters } }).map((d) => d.genes[0]);
  it("Recommended includes damaging tier-3 missense in non-cancer genes if they pass QC", () => {
    expect(rec(entries(null))).toEqual(["ZZZ3"]); // YYY1 not damaging, QQQ2 only 1 cell
    expect(rec(entries("weak"))).toEqual(["ZZZ3"]);
    expect(rec(entries("artefact"))).toEqual([]);
  });
  it("tier limit options: <= 2 drops them, <= 3 adds every tier-3 SNV that passes QC, other presets unaffected", () => {
    const e = entries(null);
    expect(rec(e, { maxTier: 2 })).toEqual([]);
    expect(rec(e, { maxTier: 3 }).sort()).toEqual(["YYY1", "ZZZ3"]);
    expect(selectDrivers(e, { ...DEFAULT_SELECTION, preset: "all" })).toHaveLength(3);
    expect(selectDrivers(e, { ...DEFAULT_SELECTION, preset: "all", filters: { ...DEFAULT_SELECTION.filters, maxTier: 2 } })).toHaveLength(0);
  });
  it("URL round trip, default not serialized", () => {
    expect(serializeSelection(DEFAULT_SELECTION)).toEqual({});
    const sel = { ...DEFAULT_SELECTION, filters: { ...DEFAULT_SELECTION.filters, maxTier: "2d" } };
    const q = serializeSelection(sel);
    expect(q.drvf).toBe("maxtier:2d");
    expect(parseSelection(`?drvf=${q.drvf}`).filters.maxTier).toBe("2d");
    expect(parseSelection("?drvf=maxtier:3").filters.maxTier).toBe(3);
  });
});
