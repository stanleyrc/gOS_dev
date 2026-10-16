import { DEFAULT_SELECTION, STATE, buildDriverEntries, entryStates, entryVafs, selectDrivers, snvVafCell } from "./driverLayer";
import { driverLayoutFromSearch, driverLayoutToSearch } from "./driverColumns";

// synthetic fixtures only
const cells = ["c1", "c2", "c3", "c4", "c5", "c6"];
const ev = (o) => ({ id: "P", seqnames: "7", start: "100", end: "100", Genome_Location: "7:100-100", ...o });
// one tree-site column (chr17:500): c1 alt 3 / depth 10, c2 alt 0 / depth 8 (VAF 0), c3 no coverage, c4-c6 alt 5 / depth 10
const snv = {
  cells,
  variants: [{ id: "chr17_500_C_T" }],
  status: [[1], [0], [-1], [1], [1], [1]],
  alt: [[3], [0], [NaN], [5], [5], [5]],
  depth: [[10], [8], [NaN], [10], [10], [10]],
};
const treeSnv = ev({ gene: "TP53", vartype: "SNV", type: "Missense", Variant: "p.R1H", Tier: 1, seqnames: "17", start: "500", Genome_Location: "17:500-500", cell_ids: "c1,c4,c5,c6" });
const calledTrunc = ev({ gene: "RELN", vartype: "SNV", type: "Trunc", Variant: "p.R2945*", Tier: 3, seqnames: "7", start: "300", Genome_Location: "7:300-300", cell_ids: "c1,c2,c3,c4", source: "called SNV (not a tree site)", rescued: true, covered_ref_cell_ids: "c5,c6" });
const ctx = { order: cells, snv, snvRows: Int32Array.from([0, 1, 2, 3, 4, 5]) };
const build = (events) => buildDriverEntries(events, { tumorIds: cells, snv });

describe("VAF state of Drivers SNV columns", () => {
  it("gives alt / depth for a tree-site SNV, 0 for covered without alt, NaN for no coverage", () => {
    const [e] = build([treeSnv]);
    const v = entryVafs(e, ctx);
    expect(v[0]).toBeCloseTo(0.3);
    expect(v[1]).toBe(0);
    expect(Number.isNaN(v[2])).toBe(true);
    expect(v[3]).toBeCloseTo(0.5);
    expect(entryStates(e, ctx)[2]).toBe(STATE.NONE);
  });
  it("distinguishes no coverage from VAF 0 when colouring", () => {
    expect(snvVafCell(STATE.WT, 0)).toBe("vaf");
    expect(snvVafCell(STATE.NONE, NaN)).toBe("none");
    expect(snvVafCell(STATE.MUT, 0.4)).toBe("vaf");
  });
  it("keeps call colours for second-hit cells and rows without per-cell counts", () => {
    expect(snvVafCell(STATE.BOTH, 0.5)).toBe("call");
    expect(snvVafCell(STATE.LOSS, NaN)).toBe("call");
    expect(snvVafCell(STATE.MUT, undefined)).toBe("call");
    const [r] = build([calledTrunc]);
    expect(entryVafs(r, ctx)).toBeNull();
  });
  it("round-trips the SNV view in the URL (vaf is the default)", () => {
    expect(driverLayoutToSearch({ heatmapType: "drivers", driverSnvView: "vaf" })).toEqual({});
    expect(driverLayoutToSearch({ heatmapType: "drivers", driverSnvView: "call" })).toEqual({ drvsnv: "call" });
    expect(driverLayoutFromSearch("?drvsnv=call")).toEqual({ driverSnvView: "call" });
  });
});

describe("Recommended preset and read-QC SNVs", () => {
  const names = (events, sel = DEFAULT_SELECTION) => selectDrivers(build(events), sel).map((d) => d.event.gene);
  it("includes a called-not-tree tier-3 truncating SNV with no cancer-gene flag", () => {
    expect(names([calledTrunc])).toEqual(["RELN"]);
  });
  it("excludes it when QC fails (too few cells, or artefact verdict)", () => {
    expect(names([{ ...calledTrunc, cell_ids: "c1,c2", covered_ref_cell_ids: "c3,c4" }])).toEqual([]);
    const art = { ...calledTrunc, hotspot_evidence: { verdict: { level: "artefact" } } };
    expect(names([art])).toEqual([]);
  });
  it("still leaves out a tier-3 tree-site truncating SNV in a non-TSG, and takes it in a tumour suppressor", () => {
    const tree = (o) => ev({ vartype: "SNV", type: "Trunc", Tier: 3, seqnames: "17", start: "500", Genome_Location: "17:500-500", cell_ids: "c1,c4,c5", ...o });
    expect(names([tree({ gene: "ZZZ3" })])).toEqual([]);
    expect(names([tree({ gene: "NF9", role: "Tumor Suppressor" })])).toEqual(["NF9"]);
  });
});
