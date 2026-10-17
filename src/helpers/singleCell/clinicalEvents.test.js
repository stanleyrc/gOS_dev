import { clinicalCounts, clinicalMatchKey, clinicalSummary, clinicalTooltipLines, clinvarLine, countsAsSomatic, gnomadLine, isHighlighted, mergeClinicalEvents } from "./clinicalEvents";
import { DEFAULT_SELECTION, buildDriverEntries, classLabel, collapseColumns, entryStates, parseSelection, selectDrivers, serializeSelection } from "./driverLayer";
import { driverKey, subclonalDrivers } from "./driverContrast";

const cells = Array.from({ length: 10 }, (_, i) => `c${i + 1}`);
const ev = (o) => ({ id: "P", seqnames: "7", start: "100", end: "200", Genome_Location: "7:100-200", ...o });
const events = [
  ev({ gene: "TP53", vartype: "SNV", type: "Missense", Variant: "p.R175H", Tier: 2, seqnames: "17", start: "100", end: "100", Genome_Location: "17:100-100", cell_ids: "c1,c2,c3,c4,c5" }),
  ev({ gene: "EGFR", vartype: "AMP", type: "SCNA", Tier: 2, role: "Oncogene", cell_ids: "c1,c2,c3,c4,c5,c6,c7,c8,c9,c10" }),
];
const row = (o) => ({ source: "clinical assay", fusion_genes: "", n_cells: 0, cell_ids: "", germline_like: false, matches_event: null, tumour_cells: 10, ...o });
const clinical = {
  events: [
    // already in the filtered events: attach, do not duplicate
    row({ gene: "TP53", vartype: "SNV", type: "Missense", Variant: "p.R175H", Genome_Location: "17:100-100", clinical_key: "clinical|P|TP53|a", matches_event: "TP53 SNV|17:100-100", n_cells: 5,
      clinical: { kind: "SNV", status: "recovered", raw: "TP53 c.524G>A (p.R175H)", tier: 2, assay: "oncopanel" } }),
    // germline-like SNV, not in the filtered events
    row({ gene: "BRCA1", vartype: "SNV", type: "Missense", Variant: "p.A322T", seqnames: "17", start: "500", end: "500", Genome_Location: "17:500-500", clinical_key: "clinical|P|BRCA1|b", n_cells: 9,
      cell_ids: "c1,c2,c3,c4,c5,c6,c7,c8,c9", covered_tumour_cells: 10, germline_like: true, VAF: 0.56,
      clinical: { kind: "SNV", status: "recovered", raw: "BRCA1 c.964G>A (p.A322T)", tier: 4, assay: "oncopanel", germline_like: true, sc_vaf: 0.56, normal_alt: 77, normal_dp: 150, clinvar: { found: true, significance: "Pathogenic", stars: 2, review_status: "criteria provided", condition: "Breast cancer", release: "2026-10-11", link: "https://x/1/" },
        gnomad: { found: true, af: 0.00003, af_popmax: 0.0001, popmax: "nfe", ac: 2, an: 1000, nhomalt: 0, link: "https://g/1" }, highlight: ["ClinVar P/LP"] } }),
    // not recovered
    row({ gene: "CBL", vartype: "SNV", type: "Missense", Variant: "p.L380P", clinical_key: "clinical|P|CBL|c", covered_tumour_cells: 10,
      clinical: { kind: "SNV", status: "not_recovered", raw: "CBL c.1139T>C (p.L380P)", clinical_vaf: 0.05, reason: "covered with no tumour alt read" } }),
    // CN gene with a gain class, matching the AMP event
    row({ gene: "EGFR", vartype: "AMP", type: "SCNA", cn_kind: "gain", Genome_Location: "7:100-200", clinical_key: "clinical|P|EGFR|Gain", matches_event: "EGFR AMP|7:100-200", n_cells: 10,
      clinical: { kind: "CNV", status: "recovered", raw: "7 Gain EGFR" } }),
    // CN gene loss with no filtered event
    row({ gene: "PTEN", vartype: "HOMDEL", type: "SCNA", cn_kind: "loss", Genome_Location: "10:5-90", seqnames: "10", start: "5", end: "90", clinical_key: "clinical|P|PTEN|Loss", n_cells: 8, cell_ids: "c1,c2,c3,c4,c5,c6,c7,c8",
      clinical: { kind: "CNV", status: "recovered", raw: "10 Loss PTEN" } }),
  ],
};
const merged = mergeClinicalEvents(events, clinical);
const entries = buildDriverEntries(merged, { tumorIds: cells });
const by = (g) => entries.find((d) => d.genes[0] === g);

describe("mergeClinicalEvents", () => {
  it("does not duplicate alterations already in the filtered events and attaches the clinical info", () => {
    expect(merged).toHaveLength(2 + 3); // TP53 and EGFR attached, BRCA1 / CBL / PTEN added
    expect(merged.filter((e) => e.gene === "TP53")).toHaveLength(1);
    expect(merged.find((e) => e.gene === "TP53").clinical.raw).toMatch(/R175H/);
    expect(merged.find((e) => e.gene === "TP53").cell_ids).toBe("c1,c2,c3,c4,c5"); // the filtered event's own cells are kept
  });
  it("leaves events unchanged without a clinical file", () => {
    expect(mergeClinicalEvents(events, null)).toBe(events);
    expect(mergeClinicalEvents(events, { events: [] })).toBe(events);
  });
  it("match keys equal driverKey", () => {
    events.forEach((e) => expect(clinicalMatchKey(e)).toBe(driverKey(e)));
  });
});

describe("clinical driver entries", () => {
  it("every clinical finding is selected by default, whatever its tier", () => {
    const shown = selectDrivers(entries, DEFAULT_SELECTION).map((d) => d.genes[0]);
    ["TP53", "EGFR", "BRCA1", "CBL", "PTEN"].forEach((g) => expect(shown).toContain(g));
    expect(selectDrivers(entries, { ...DEFAULT_SELECTION, clinical: false }).map((d) => d.genes[0])).not.toContain("CBL");
  });
  it("germline-like and not-recovered rows are not somatic; matched ones keep counting", () => {
    expect(by("BRCA1").somatic).toBe(false);
    expect(by("CBL").somatic).toBe(false);
    expect(by("TP53").somatic).toBe(true);
    expect(by("PTEN").somatic).toBe(true);
    expect(countsAsSomatic({ gene: "X" })).toBe(true);
  });
  it("labels: germline-like, not found, copy-number class", () => {
    expect(by("BRCA1").label).toBe("BRCA1 p.A322T (germline-like)");
    expect(by("CBL").label).toBe("CBL p.L380P (not found)");
    expect(by("PTEN").label).toBe("PTEN loss");
    expect(classLabel(by("PTEN"))).toMatch(/Loss/);
  });
  it("not-recovered rows have no carrier cells and no invented cell states", () => {
    const d = by("CBL");
    expect(d.n).toBe(0);
    expect(Array.from(entryStates(d, { order: cells }))).toEqual(cells.map(() => 0));
  });
  it("germline-like carriers are real cells", () => {
    expect(by("BRCA1").n).toBe(9);
    expect(by("BRCA1").clinicalOnly).toBe(true);
    expect(by("TP53").clinicalOnly).toBe(false);
  });
  it("clinical-only entries get the clinical key and do not collapse with different CN classes", () => {
    expect(by("BRCA1").key).toBe("clinical|P|BRCA1|b");
    const sel = ["EGFR", "PTEN"].map(by);
    expect(collapseColumns(sel, sel.map((d) => entryStates(d, { order: cells }))).columns).toHaveLength(2);
  });
  it("the Clinical findings switch is in the URL", () => {
    expect(serializeSelection(DEFAULT_SELECTION).drvclin).toBeUndefined();
    const off = serializeSelection({ ...DEFAULT_SELECTION, clinical: false });
    expect(off.drvclin).toBe("0");
    expect(parseSelection("?drvclin=0").clinical).toBe(false);
    expect(parseSelection("?drvpreset=all").clinical).toBe(true);
  });
  it("germline-like rows are not subclonal drivers", () => {
    const list = subclonalDrivers(merged, cells, null, { minCells: 3 }).map((d) => d.event.gene);
    expect(list).not.toContain("BRCA1");
    expect(list).toContain("TP53");
  });
});

describe("clinical text", () => {
  it("summarises recovered, germline-like and not-recovered findings", () => {
    expect(clinicalSummary(by("BRCA1").event)).toMatch(/in 9\/10 cells, VAF 0\.56.*germline/);
    expect(clinicalSummary(by("CBL").event)).toMatch(/present at VAF 0\.05; not found in single cells \(possible clonal haematopoiesis\)/);
    expect(clinicalTooltipLines(by("BRCA1").event)[0]).toMatch(/oncopanel, tier 4: BRCA1 c\.964G>A/);
  });
  it("ClinVar and gnomAD lines and highlight", () => {
    const e = by("BRCA1").event;
    expect(clinvarLine(e).text).toMatch(/Pathogenic \(★★, criteria provided\); Breast cancer; release 2026-10-11/);
    expect(clinvarLine(e).link).toBe("https://x/1/");
    expect(gnomadLine(e).text).toMatch(/AF 3\.0e-5, popmax 1\.0e-4 \(nfe\), AC 2 of 1000, homozygotes 0/);
    expect(isHighlighted(e)).toBe(true);
    expect(isHighlighted(by("CBL").event)).toBe(false);
    expect(clinvarLine(by("CBL").event)).toBeNull();
  });
  it("counts per patient", () => {
    expect(clinicalCounts(clinical)).toEqual({ findings: 5, germlineLike: 1, notRecovered: 1 });
  });
});
