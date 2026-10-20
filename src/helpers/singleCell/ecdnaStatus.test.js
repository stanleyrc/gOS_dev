import {
  combineVerdicts,
  statusForFootprint,
  statusForEvent,
  isEcdnaEvent,
  footprintOf,
  cladeRows,
  cladeSummary,
  statusLines,
  statusHoverText,
  dotPlotLayout,
  VERDICT_TEXT,
} from "./ecdnaStatus";

// synthetic fixture (no patient data)
const g = (group, call, extra = {}) => ({ group, call, n_group: 20, n_carriers: 12, median: 40, cv: 0.3, D: 5, D_lo: 2, D_hi: 9, D_sib: 4, loss_frac: 0, ...extra });
const doc = {
  format: "gos-sc-ecdna-status/1",
  cells: ["c0", "c1", "c2", "c3", "c4", "c5"],
  sphase: [0, 0, 0, 0, 0, 1],
  clade_cells: { P_n2: [0, 1, 2], P_n3: [3, 4, 5] },
  amplicons: [
    { id: "amp1", kind: "amplicon", chrom: "12", start: 1000000, end: 2000000, label: "MDM2", verdict: "mixed", groups: [g("ALL", "unstable"), g("P_n2", "unstable", { D: 30 }), g("P_n3", "stable", { D: 0, D_lo: -0.2, D_hi: 0.2 }), g("P_n9", "not enough")], values: [10, 40, 90, 50, 51, 300] },
    { id: "amp1:MDM2", kind: "gene", chrom: "12", start: 1500000, end: 1600000, verdict: "mixed", groups: [] },
    { id: "amp2", kind: "amplicon", chrom: "7", start: 5000000, end: 6000000, label: "EGFR", verdict: "ecDNA-like", groups: [g("ALL", "unstable")] },
    { id: "amp3", kind: "amplicon", chrom: "7", start: 9000000, end: 9500000, label: "", verdict: "not enough", groups: [] },
  ],
};

describe("ecdnaStatus", () => {
  it("combines verdicts", () => {
    expect(combineVerdicts(["ecDNA-like", "not enough"])).toBe("ecDNA-like");
    expect(combineVerdicts(["ecDNA-like", "chromosomal / integrated"])).toBe("mixed");
    expect(combineVerdicts(["nested"])).toBe("mixed");
    expect(combineVerdicts(["indeterminate", "not enough"])).toBe("indeterminate");
    expect(combineVerdicts(["not enough"])).toBe("not enough");
    expect(combineVerdicts([])).toBeNull();
  });

  it("matches amplicons by footprint overlap, ignoring gene rows", () => {
    const s = statusForFootprint(doc, "12:1200000-1300000");
    expect(s.verdict).toBe("mixed");
    expect(s.text).toBe("mixed");
    expect(s.amplicons.map((a) => a.id)).toEqual(["amp1"]);
    const s7 = statusForFootprint(doc, "7:1-159000000");
    expect(s7.amplicons).toHaveLength(2);
    expect(s7.verdict).toBe("ecDNA-like");
    expect(statusForFootprint(doc, "3:1-100")).toBeNull();
    expect(statusForFootprint(null, "12:1-1000000000")).toBeNull();
  });

  it("only labels gGnome DM / Cpxdm events", () => {
    const dm = { event: { vartype: "DM", Genome_Location: "12:1-1500000" } };
    const tic = { event: { vartype: "TIC", Genome_Location: "12:1-1500000" } };
    const fam = { event: { vartype: "rDup" }, family: { dominant: { vartype: "Cpxdm", Genome_Location: "7:5500000-5600000" }, footprint: "7:5500000-5600000" } };
    expect(isEcdnaEvent(dm)).toBe(true);
    expect(isEcdnaEvent(tic)).toBe(false);
    expect(isEcdnaEvent(fam)).toBe(true);
    expect(footprintOf(fam)).toBe("7:5500000-5600000");
    expect(statusForEvent(doc, dm).verdict).toBe("mixed");
    expect(statusForEvent(doc, tic)).toBeNull();
    expect(statusForEvent(doc, fam).text).toBe(VERDICT_TEXT["ecDNA-like"]);
    expect(VERDICT_TEXT["chromosomal / integrated"]).toBe("stable (chromosomal/integrated)");
  });

  it("orders clade rows and summarises", () => {
    const rows = cladeRows(doc.amplicons[0]);
    expect(rows[0].key).toBe("ALL");
    expect(rows.map((r) => r.key)).not.toContain("P_n9");
    expect(rows.find((r) => r.key === "P_n3").clade).toBe("n3");
    expect(cladeSummary(doc.amplicons[0])).toBe("ecDNA-like in n2; stable in n3");
    const lines = statusLines(statusForFootprint(doc, "12:1-1000000000"));
    expect(lines[0]).toBe("ecDNA status (CN dispersion): mixed");
    expect(lines[1]).toMatch(/chr12:1\.0-2\.0 Mb \(MDM2\): mixed; ecDNA-like in n2; stable in n3; all cells D 5/);
    expect(statusHoverText(null)).toBe("");
  });

  it("lays out the per-clade dot plot without S-phase cells", () => {
    const L = dotPlotLayout(doc, doc.amplicons[0], { width: 300, height: 200 });
    expect(L.available).toBe(true);
    expect(L.groups.map((x) => x.key)).toEqual(["ALL", "P_n2", "P_n3"]);
    expect(L.groups[0].points).toHaveLength(5); // c5 is S-phase
    expect(L.groups[2].points.map((p) => p.cell)).toEqual(["c3", "c4"]);
    const ys = L.groups[1].points.map((p) => p.y);
    expect(ys[0]).toBeGreaterThan(ys[2]); // CN 10 drawn below CN 90
    expect(L.yTicks.length).toBeGreaterThan(1);
    expect(dotPlotLayout(doc, doc.amplicons[2]).available).toBe(false);
    expect(dotPlotLayout({ amplicons: [] }, doc.amplicons[0]).reason).toMatch(/not in this/);
  });
});

describe("ecdnaHoverLines", () => {
  it("dedupes by amplicon set and skips non-DM", () => {
    const { ecdnaHoverLines } = require("./ecdnaStatus");
    const items = [{ event: { vartype: "DM", Genome_Location: "12:1-1500000" } }, { event: { vartype: "DM", Genome_Location: "12:1200000-1300000" } }, { event: { vartype: "TIC", Genome_Location: "7:5000000-5100000" } }];
    const lines = ecdnaHoverLines(items, doc);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^ecDNA status \(CN dispersion\): mixed/);
    expect(ecdnaHoverLines(items, null)).toEqual([]);
  });
});
