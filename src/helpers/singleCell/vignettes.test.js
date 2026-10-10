import { boxStats, cohortVignetteRows, evidenceAction, extent, groupCells, jitter, linear, normalizeVignettes, splitLead, VIGNETTES_FORMAT } from "./vignettes";
import { peekEvidence, requestEvidence, subscribeEvidence, takeEvidence } from "./evidenceFocus";

const raw = {
  format: VIGNETTES_FORMAT,
  generated: "2026-10-10",
  patients: {
    P1: {
      patient: "P1",
      n_cells: 12,
      n_tumor: 10,
      n_normal: 2,
      n_rna_linked: 8,
      tree: "snv",
      has_clones: true,
      findings: [
        {
          id: "P1-2",
          rank: 2,
          kind: "fusion",
          category: "subclonal",
          short: "A::B",
          text: "Subclonal A::B in-frame fusion (DNA junction): 5/10 tumor cells, defines Clone 2.",
          genes: ["A", "B"],
          evidence: [
            { kind: "driver", label: "Drivers tab", key: "A::B|1:10-20" },
            { kind: "igv", label: "DNA reads", chromosome: "1", position: 15, cells: "g2", loci: [{ chromosome: "1", position: 15 }, { chromosome: "2", position: 99 }] },
            { kind: "bogus", label: "x" },
            { kind: "cn", label: "broken" },
          ],
        },
        {
          id: "P1-1",
          rank: 1,
          kind: "amp",
          category: "truncal",
          short: "MDM2 ecDNA",
          text: "Truncal MDM2 ecDNA amplification (12q): 10/10 tumor cells, median 40 copies.",
          plot: { type: "scatter", points: [[1, 2]], rho: 0.6, p: 0.001, n: 1 },
          evidence: [
            { kind: "walk", label: "ecDNA walks", walks: ["MDM2 1", "MDM2 2"] },
            { kind: "cn", label: "CN heatmap", chromosome: "12", start: 68000000, end: 70000000, cells: "g1" },
            { kind: "expr", label: "MDM2 expression" },
            { kind: "event", label: "Event detail", key: "MDM2 AMP|12:1-2" },
            { kind: "tab", tab: "8", label: "RNA tab" },
            { kind: "splice", label: "RNA reads", finding: "f1", gene: "TP53" },
            { kind: "cells", label: "Select", cells: "g2" },
          ],
        },
        { id: "bad", text: "" },
      ],
      clones: { text: "Clone 2 (5): A::B", clones: [{ clone: "Clone 2", n: 5, defining: ["A::B"], cells: "g2" }] },
      caveat: "RNA linked for 8/10 tumor cells.",
      groups: { g1: ["c1", "c2"], g2: ["c3", 4] },
    },
    P0: { findings: [], clones: {}, caveat: "", groups: {} },
  },
};

describe("normalizeVignettes", () => {
  it("rejects other files", () => {
    expect(normalizeVignettes(null)).toBeNull();
    expect(normalizeVignettes({ format: "x" })).toBeNull();
  });
  it("keeps valid findings in rank order and drops broken evidence", () => {
    const v = normalizeVignettes(raw).patients.P1;
    expect(v.findings.map((f) => f.id)).toEqual(["P1-1", "P1-2"]);
    expect(v.findings[1].evidence.map((e) => e.kind)).toEqual(["driver", "igv"]);
    expect(v.tree).toBe("snv");
    expect(v.clones.list[0]).toEqual({ clone: "Clone 2", n: 5, defining: ["A::B"], cells: "g2" });
    expect(groupCells(v, "g2")).toEqual(["c3", "4"]);
    expect(groupCells(v, "nope")).toEqual([]);
    expect(groupCells(v, ["a", 1])).toEqual(["a", "1"]);
  });
});

describe("evidenceAction", () => {
  const v = normalizeVignettes(raw).patients.P1;
  const [amp, fusion] = v.findings;
  const act = (f, kind) => evidenceAction(f.evidence.find((e) => e.kind === kind), f, v);
  it("maps each kind to a descriptor", () => {
    expect(act(amp, "walk")).toEqual({ type: "walks", tab: "14", walks: ["MDM2 1", "MDM2 2"] });
    expect(act(amp, "cn")).toEqual({ type: "zoom", tab: "7", location: "12:68000000-70000000", select: ["c1", "c2"] });
    expect(act(amp, "expr").type).toBe("plot");
    expect(act(amp, "event")).toEqual({ type: "event", key: "MDM2 AMP|12:1-2" });
    expect(act(amp, "tab")).toEqual({ type: "tab", tab: "8" });
    expect(act(amp, "splice")).toEqual({ type: "splice", findingId: "f1", gene: "TP53" });
    expect(act(amp, "cells")).toEqual({ type: "select", tab: "7", select: ["c3", "4"] });
    expect(act(fusion, "driver")).toEqual({ type: "driver", tab: "17", key: "A::B|1:10-20" });
    const igv = act(fusion, "igv");
    expect(igv.type).toBe("igv");
    expect(igv.view.cellIds).toEqual(["c3", "4"]);
    expect(igv.view.loci).toHaveLength(2);
  });
  it("returns null when the evidence cannot be shown", () => {
    expect(evidenceAction(null)).toBeNull();
    expect(evidenceAction({ kind: "expr" }, { plot: null }, v)).toBeNull();
    expect(evidenceAction({ kind: "igv", chromosome: "1", position: 1, cells: "missing" }, {}, v)).toBeNull();
  });
});

describe("plot helpers", () => {
  it("boxStats", () => {
    expect(boxStats([])).toBeNull();
    expect(boxStats([4, 1, 3, 2, 5])).toEqual({ n: 5, min: 1, q1: 2, median: 3, q3: 4, max: 5 });
  });
  it("extent pads flat data", () => {
    expect(extent([2, 2])).toEqual([1.5, 2.5]);
    expect(extent([])).toEqual([0, 1]);
    expect(extent([3, 1, "x"])).toEqual([1, 3]);
  });
  it("linear and jitter", () => {
    expect(linear([0, 10], [0, 100])(5)).toBe(50);
    expect(jitter(3)).toBeGreaterThanOrEqual(-1);
    expect(jitter(3)).toBeLessThanOrEqual(1);
    expect(jitter(3)).toBe(jitter(3));
  });
  it("splitLead", () => {
    expect(splitLead("Truncal MDM2 ecDNA amplification (12q): 10/10 cells")).toEqual({ lead: "Truncal MDM2 ecDNA amplification (12q)", rest: "10/10 cells" });
    expect(splitLead("no separator here")).toEqual({ lead: "", rest: "no separator here" });
  });
});

describe("cohortVignetteRows", () => {
  it("follows the cohort order and skips patients without a vignette", () => {
    const v = normalizeVignettes(raw);
    expect(cohortVignetteRows(v, ["P1", "X", "P0"]).map((r) => r.id)).toEqual(["P1", "P0"]);
    expect(cohortVignetteRows(v).map((r) => r.id)).toEqual(["P0", "P1"]);
    expect(cohortVignetteRows(null)).toEqual([]);
  });
});

describe("evidenceFocus", () => {
  it("hands a request to one taker of the right kind and patient", () => {
    const seen = [];
    const unsub = subscribeEvidence((r) => seen.push(r?.kind));
    requestEvidence({ kind: "walks", patient: "P1", walks: ["a"] });
    expect(peekEvidence().kind).toBe("walks");
    expect(takeEvidence("other")).toBeNull();
    expect(takeEvidence("walks", "P2")).toBeNull();
    expect(takeEvidence("walks", "P1").walks).toEqual(["a"]);
    expect(takeEvidence("walks", "P1")).toBeNull();
    unsub();
    requestEvidence(null);
    expect(seen).toEqual(["walks"]);
  });
});
