// Hotspots rescued from site evidence (exporter gos_sc_hotspot_rescue): synthetic fixtures only.
import { buildDriverEntries, entryStates, selectDrivers, rescueText, snvStateLabel, STATE, DEFAULT_SELECTION } from "./driverLayer";
import { cellStatus, markSnvPending, sharedLabel } from "./cohortDriverTrees";
import { eventClass, isRescued, oncoprintMatrix } from "./cohortStats";
import { buildPatientReport } from "./patientReport";
import { cohortHeadline, tertHeadline } from "./cohortHeadline";

const cells = Array.from({ length: 10 }, (_, i) => `c${i + 1}`);
const tert = (o = {}) => ({
  id: "P", gene: "TERT", fusion_genes: "", vartype: "Hotspot", type: "Promoter", Variant: "C228T (promoter, -124 C>T)", Variant_g: "5:1295113-1295113 G>A",
  Tier: 1, role: "Oncogene", seqnames: "5", start: "1295113", end: "1295113", Genome_Location: "5:1295113-1295113",
  cell_ids: "c1,c2,c3,c4", n_cells: 4, cells: "4/6", cell_fraction: 0.667, source: "site evidence (not in SNV calls)", rescued: true,
  covered_ref_cell_ids: "c5,c6", tumour_cells: 10, covered_tumour_cells: 6, coverage_fraction: 0.6, low_coverage: true,
  hotspot_evidence: { preset: "all", tumor: { alt_f: 5, alt_r: 3, ref_f: 2, ref_r: 1 }, normal: { alt_f: 0, alt_r: 0, ref_f: 1, ref_r: 0 }, verdict: { level: "supported", label: "Supported", reasons: [] } },
  ...o,
});

describe("rescued hotspot entries", () => {
  const entries = buildDriverEntries([tert()], { tumorIds: cells });
  const d = entries[0];

  it("is an SNV hotspot driver with the covered-cell fraction and no clonality call", () => {
    expect(isRescued(tert())).toBe(true);
    expect(eventClass(tert())).toBe("missense");
    expect(d).toMatchObject({ cls: "snv", rescued: true, hotspot: true, n: 4, subclonal: false, verdict: "supported", snvColumn: null });
    expect(d.fraction).toBeCloseTo(0.667, 3);
    expect(d.label).toBe("TERT C228T (rescued)");
    expect(d.rescue.covered).toBe(6);
    expect(d.rescue.coverage).toBeCloseTo(0.6);
    expect(d.qc.pass).toBe(true);
  });

  it("appears under Recommended (tier 1 hotspot)", () => {
    expect(selectDrivers(entries, DEFAULT_SELECTION).map((x) => x.label)).toEqual(["TERT C228T (rescued)"]);
  });

  it("separates mutant, no alt read (covered) and no coverage", () => {
    const states = entryStates(d, { order: cells, snv: { variants: [], status: [] }, snvRows: null });
    expect(Array.from(states)).toEqual([2, 2, 2, 2, 1, 1, 0, 0, 0, 0]);
    expect(states[0]).toBe(STATE.MUT);
    expect(cellStatus(d, 2).status).toBe("mutant");
    expect(cellStatus(d, 1).status).toMatch(/no alt read/);
    expect(cellStatus(d, 0).status).toBe("no coverage");
    expect(snvStateLabel(d, 1)).not.toBe("wild type");
    expect(snvStateLabel({ rescued: false }, 1)).toBe("wild type");
  });

  it("states and tooltip text carry the read evidence", () => {
    const text = rescueText(d);
    expect(text).toContain("8 alt / 3 ref reads");
    expect(text).toContain("4 carrier cells");
    expect(text).toContain("6 of 10 tumour cells (60%)");
  });

  it("does not wait for the SNV matrix in the cohort trees", () => {
    const aligned = markSnvPending([{ entry: d }, { entry: { cls: "snv", rescued: false } }], true);
    expect(aligned.map((a) => Boolean(a.pending))).toEqual([false, true]);
    expect(sharedLabel(d)).toBe("TERT promoter (rescued)");
  });

  it("an artefact-like verdict keeps it out of Recommended", () => {
    const bad = buildDriverEntries([tert({ hotspot_evidence: { tumor: {}, normal: {}, verdict: { level: "artefact" } } })], { tumorIds: cells });
    expect(selectDrivers(bad, DEFAULT_SELECTION)).toEqual([]);
  });
});

describe("well covered rescued SNV (PTEN in a clonal tumour)", () => {
  const pten = tert({ gene: "PTEN", vartype: "SNV", type: "Trunc", Variant: "p.R130*", cell_ids: cells.join(","), n_cells: 10, cells: "10/10", cell_fraction: 1, covered_ref_cell_ids: "", covered_tumour_cells: 10, coverage_fraction: 1, low_coverage: false });
  it("is clonal and keeps the standard clonality call", () => {
    const d = buildDriverEntries([pten], { tumorIds: cells })[0];
    expect(d).toMatchObject({ rescued: true, subclonal: false, n: 10 });
    const r = buildPatientReport({ patient: "P", events: [pten], cells: cells.map((id) => ({ cell_id: id, clone_id: "Clone 1" })) });
    expect(r.clonal).toHaveLength(1);
  });
});

describe("cohort counting", () => {
  it("counts a rescued event once per patient in the oncoprint and marks it", () => {
    const m = oncoprintMatrix({ A: [tert()], B: [], C: [tert({ id: "C" })] }, { maxTier: 2 });
    expect(m.genes[0].gene).toBe("TERT");
    expect(m.genes[0].nPatients).toBe(2);
    expect(m.genes[0].cells.A.all).toHaveLength(1);
    expect(m.genes[0].cells.A.rescued).toBe(true);
  });

  it("patient report keeps rescued hotspots apart from clonal / subclonal", () => {
    const r = buildPatientReport({ patient: "P", events: [tert()], cells: cells.map((id) => ({ cell_id: id, clone_id: "Clone 1" })) });
    expect(r.rescued.map((x) => x.gene)).toEqual(["TERT"]);
    expect(r.clonal.length + r.subclonal.length + r.rare.length).toBe(0);
    expect(r.rescued[0].clonality).toBe("unassessed");
  });
});

describe("tert headline", () => {
  const site = (name, called, alt, dp, ca, cc, level = "supported") => ({ name, called, level, tumor: { alt_f: alt - 1, alt_r: 1, ref_f: dp - alt, ref_r: 0, cells_alt: ca, cells_cov: cc } });
  const doc = {
    patients: {
      A: { assessed: true, sites: [site("TERT C228T", true, 50, 84, 49, 77), site("TERT C250T", false, 0, 10, 0, 9, "absent")] },
      B: { assessed: true, sites: [site("TERT C228T", false, 0, 10, 0, 9, "absent"), site("TERT C250T", true, 21, 37, 16, 24)] },
      C: { assessed: true, sites: [site("TERT C228T", false, 0, 10, 0, 9, "absent")] },
      D: { assessed: false, sites: [] },
    },
  };
  it("N of M with C228T / C250T split, evidence counts and the unassessed", () => {
    const h = tertHeadline(doc, ["A", "B", "C", "D"]);
    expect(h).toMatchObject({ key: "tert", value: 2, total: 4, patients: ["A", "B"], view: "drivers" });
    expect(h.title).toBe("TERT promoter mutated in 2 of 4 tumors: C228T in 1, C250T in 1");
    expect(h.detail).toContain("A C228T 50/84 reads, 49/77 cells");
    expect(h.detail).toContain("No alt reads: C");
    expect(h.detail).toContain("Not assessed (site evidence not computed): D");
  });
  it("is absent without the file and does not disturb the other findings", () => {
    expect(tertHeadline(null, ["A"])).toBeNull();
    expect(cohortHeadline([{ id: "A", report: { clonal: [], subclonal: [] } }]).map((x) => x.key)).not.toContain("tert");
  });
});
