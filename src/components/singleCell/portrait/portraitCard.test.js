import { TextDecoder, TextEncoder } from "util";
import React from "react";

if (typeof global.TextDecoder === "undefined") global.TextDecoder = TextDecoder;
if (typeof global.TextEncoder === "undefined") global.TextEncoder = TextEncoder;
import { render, screen } from "@testing-library/react";

// jsdom has no matchMedia (antd Table / Grid)
beforeAll(() => {
  window.matchMedia =
    window.matchMedia ||
    (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
});

// synthetic portrait (no patient data)
const portrait = {
  patient: "P1",
  n_tumour_cells: 100,
  genotype: {
    events: [
      { id: "+7", label: "chr7 gain", cls: "gain", n: 95, frac: 0.95, truncal: true, placed: true, t0: 0, t1: 0 },
      { id: "EGFR amp", label: "EGFR amplification", cls: "amp", n: 20, frac: 0.2, truncal: false, placed: true, t0: 0.31, t1: 0.4 },
    ],
    snvs: [{ gene: "PTEN", variant: "p.R130*", class: "Trunc", tier: 2, n_cells: 99, frac: 0.99, source: "filtered.events", qc_flags: [] }],
    ecdna_walks: [{ label: "EGFR 1", genes: "EGFR", ncells: 20, median_cn: 40, max_cn: 90, span: 1000 }],
    subclonal_qc_pass: [{ gene: "KMT2A", variant: "p.E1*", frac: 0.07, site: "chr11:1:G>T" }],
    flagged_hits: [{ gene: "PRKDC", variant: "splice", frac: 0.1, flags: ["alt at read-block ends"] }],
  },
  evolution: { n_tumour_cells: 100, n_clades: 4, old_tree: false, timing: [{ label: "chr7 gain", t0: 0, truncal: true }], signature_contrasts: [], clade_signature_shifts: [], tmb: null },
  phenotype: { n_rna: 40, counts: { MES: 4, AC: 20, OPC: 6, NPC: 10 }, fractions: { MES: 0.1, AC: 0.5, OPC: 0.15, NPC: 0.25 }, cycling_frac: 0.3, lineage_text: "State differs between lineages.", composition: [{ lineage: "Clone 1", n: 20, counts: { AC: 15, NPC: 5 } }] },
  checks: {
    chr7: { verdict: "consistent", evidence: "chr7 gain truncal: 95 of 100 cells.", link: { scview: "aligned" } },
    egfr_ac: { verdict: "not_testable", evidence: "underpowered: 20 carriers vs 3 non-carriers.", link: { scview: "eventassoc", evassoc: "EGFR amp" } },
  },
  novel: [{ id: "n1", kind: "signature", status: "candidate", title: "Subclonal APOBEC gain", text: "SBS13 rises in clade n1.", caveat: "small fractions", patients: ["P1"], links: [{ label: "Subclonal view", scview: "subclonal" }] }],
};
const features = [
  { key: "chr7", label: "chr7 gain, truncal", canonical: "chr7 gain on the trunk" },
  { key: "egfr_ac", label: "EGFR amp - AC-like", canonical: "Neftel" },
];

describe("PortraitCard", () => {
  it("renders all five sections with verdicts, links and the novel item", () => {
    const PortraitCard = require("./portraitCard").default;
    render(<PortraitCard portrait={portrait} patient="P1" features={features} />);
    expect(screen.getByText(/a\. Genotype/)).toBeTruthy();
    expect(screen.getByText(/e\. Novel/)).toBeTruthy();
    expect(screen.getByText("chr7 gain, truncal")).toBeTruthy();
    expect(screen.getByText(/consistent/)).toBeTruthy();
    expect(screen.getByText(/not testable here/)).toBeTruthy();
    expect(screen.getByText(/Subclonal APOBEC gain/)).toBeTruthy();
    expect(screen.getByText(/Excluded by read-level QC/)).toBeTruthy();
    const link = screen.getByText("Subclonal view").closest("a");
    expect(link.getAttribute("href")).toContain("scview=subclonal");
  });
  it("says why a portrait is missing", () => {
    const PortraitCard = require("./portraitCard").default;
    render(<PortraitCard portrait={null} patient="P2" />);
    expect(screen.getByText(/not available \(no portrait.json exported for P2/)).toBeTruthy();
  });
});
