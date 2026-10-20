import { buildDriverEntries } from "./driverLayer";
import { notableSvs, cohortNotableSvs, genesInFootprint } from "./notableSvs";

const cx = (o) => ({ type: "Complex SV", gene: "", cell_fraction: 0.5, ...o });
const events = [
  cx({ vartype: "DM", Variant: "DM (7)", Genome_Location: "7:40000000-60000000", cell_ids: "a,b,c,d,e,f", n_cells: 6, family_id: "P:F1" }),
  cx({ vartype: "DM", Variant: "DM (1,7)", Genome_Location: "7:40000000-60000000,1:176000000-181000000", cell_ids: "a,b", n_cells: 2, family_id: "P:F1" }),
  cx({ vartype: "rDelDup", Variant: "rDelDup (1,7)", Genome_Location: "1:178000000-179000000,7:54000000-55000000", cell_ids: "a,b,c,d", n_cells: 4, family_id: "P:F2" }),
  cx({ vartype: "TIC", Variant: "TIC (1,7)", Genome_Location: "1:178000000-179000000,7:54000000-55000000", cell_ids: "a,b,c,d", n_cells: 4, family_id: "P:F2" }),
  cx({ vartype: "rDel", Variant: "rDel (3)", Genome_Location: "3:1000-2000", cell_ids: "x,y", n_cells: 2 }),
  cx({ vartype: "Cpxdm", Variant: "Cpxdm (9)", Genome_Location: "9:1-10", cell_ids: "x" }),
];
const genes = [
  { title: "EGFR", chromosome: "7", startPoint: 54500000, endPoint: 54600000, importance: 10, bioType: "protein-coding" },
  { title: "ZZZ1", chromosome: "7", startPoint: 54100000, endPoint: 54200000, importance: 99, bioType: "protein-coding" },
  { title: "LNC1", chromosome: "7", startPoint: 54300000, endPoint: 54310000, importance: 999, bioType: "lncRNA" },
  { title: "OTHER", chromosome: "8", startPoint: 54500000, endPoint: 54600000, importance: 5, bioType: "protein-coding" },
];

describe("notable SVs", () => {
  test("genes in footprint: coding only, driver genes first", () => {
    const g = genesInFootprint(genes, "1:1-10,7:54000000-55000000");
    expect(g.genes).toEqual(["EGFR", "ZZZ1"]);
    expect(g.total).toBe(2);
    expect(genesInFootprint([], "7:1-10").genes).toEqual([]);
  });
  test("ecDNA families first, then the rest, with label, members, genes and ecDNA flag", () => {
    const rows = notableSvs(buildDriverEntries(events), { genesList: genes });
    expect(rows.map((r) => r.label)).toEqual(["ecDNA chr7 (+chr1 in subsets)", "complex ecDNA chr9", "rDelDup chr1↔chr7", "rDel chr3"]);
    expect(rows.map((r) => r.isEcdna)).toEqual([true, true, false, false]);
    const f2 = rows.find((r) => r.entry.family?.id === "P:F2");
    expect(f2.n).toBe(4);
    expect(f2.members).toBe("rDelDup (1,7) in 4 cells, TIC (1,7) in 4 cells");
    expect(f2.chromosomes).toEqual(["chr1", "chr7"]);
    expect(f2.genes).toEqual(["EGFR", "ZZZ1"]);
    expect(f2.ecdna).toMatchObject({ label: "ecDNA (7)", overlap: 4, carriers: 4 });
  });
  test("no gene annotation: genes null (not available), not empty", () => {
    expect(notableSvs(buildDriverEntries(events))[0].genes).toBeNull();
  });
  test("cohort lines sort by cell fraction", () => {
    const lo = cx({ vartype: "rDup", Variant: "rDup (2)", Genome_Location: "2:1-10", cell_ids: "a", n_cells: 1, cell_fraction: 0.1 });
    const out = cohortNotableSvs({ P1: buildDriverEntries([lo]), P2: buildDriverEntries(events) });
    expect(out[0].patient).toBe("P2");
    expect(out[out.length - 1].patient).toBe("P1");
  });
});

describe("ecDNA families in notable SVs", () => {
  const { NOTABLE_KINDS, isEcdnaKind } = require("./notableSvs");
  it("DM is a notable kind and is flagged ecDNA", () => {
    expect(NOTABLE_KINDS.test("DM")).toBe(true);
    expect(isEcdnaKind("DM")).toBe(true);
    expect(isEcdnaKind("rDelDup")).toBe(false);
  });
  test("gene spans (whole GENCODE) take precedence over the gene track and are labelled", () => {
    const entries = buildDriverEntries(events);
    const spans = [
      { gene: "EGFR", chromosome: "7", start: 54500000, end: 54600000, coding: true },
      { gene: "SEC61G", chromosome: "7", start: 54700000, end: 54750000, coding: true },
    ];
    const withSpans = notableSvs(entries, { geneSpans: spans, genesList: genes }).find((r) => /rDelDup/.test(r.label));
    expect(withSpans.genes).toEqual(["EGFR", "SEC61G"]);
    expect(withSpans.genesSource).toBe("spans");
    const track = notableSvs(entries, { genesList: genes }).find((r) => /rDelDup/.test(r.label));
    expect(track.genesSource).toBe("track");
    expect(notableSvs(entries).find((r) => /rDelDup/.test(r.label)).genesSource).toBeNull();
  });
});
