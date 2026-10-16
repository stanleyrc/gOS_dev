import { eventF1ByPatient, f1Style, f1Summary, f1Tooltip, filterEventsByF1, geneF1, hiddenByF1 } from "./cladeF1View";

// tree layout with 4 leaves: nodes cover leaf ranges
const tree = { leaves: ["a", "b", "c", "d"], nodes: [{ firstLeaf: 0, lastLeaf: 3 }, { firstLeaf: 0, lastLeaf: 1 }, { firstLeaf: 2, lastLeaf: 3 }, { firstLeaf: 0, lastLeaf: 0 }, { firstLeaf: 1, lastLeaf: 1 }, { firstLeaf: 2, lastLeaf: 2 }, { firstLeaf: 3, lastLeaf: 3 }] };
const ev = (gene, ids) => ({ gene, vartype: "AMP", type: "SCNA", cell_ids: ids });

describe("Clade F1 view helpers", () => {
  it("scores carriers that are one clade as 1 and scattered carriers lower", () => {
    expect(geneF1([ev("SOX2", "a,b")], tree, "SOX2", "amp")).toBeCloseTo(1);
    expect(geneF1([ev("SOX2", "a,c")], tree, "SOX2", "amp")).toBeLessThan(0.7);
    expect(geneF1([ev("EGFR", "a,b")], tree, "SOX2", "amp")).toBeNull();
    expect(geneF1([ev("SOX2", "a,b")], null, "SOX2", "amp")).toBeNull();
  });
  it("by patient skips patients without carriers", () => {
    const files = { P1: { events: [ev("SOX2", "a,b")], tree }, P2: { events: [], tree } };
    expect(eventF1ByPatient(files, ["P1", "P2"], "SOX2", "amp")).toEqual([{ patient: "P1", f1: 1 }]);
  });
  it("colour scale and summary", () => {
    expect(f1Style(0.3).color).toBe("#cf1322");
    expect(f1Style(0.85).fontWeight).toBe(600);
    expect(f1Style(0.6).color).toBeUndefined();
    expect(f1Summary([0.2, 1, NaN])).toEqual({ n: 2, median: 0.6, min: 0.2, max: 1 });
    expect(f1Summary([])).toBeNull();
  });
  it("counts events hidden by the filter and says so in the tooltip", () => {
    const raw = { P1: { events: [1, 2, 3] }, P2: { events: [1] } };
    const kept = { P1: { events: [1] }, P2: { events: [1] } };
    expect(hiddenByF1(raw, kept)).toEqual({ perPatient: { P1: 2 }, total: 2 });
    expect(f1Tooltip(0.4, { on: true, min: 0.5, hidden: 2 })).toMatch(/hidden in every cohort view \(2 hidden now\)/);
    expect(f1Tooltip(0.4, { on: false, min: 0.5, hidden: 0 })).toMatch(/no event is hidden/);
    expect(f1Tooltip(null)).toMatch(/not available/);
  });
  it("oncoprint per-event F1 filter hides low-F1 events of every class incl. SNVs, keeps truncal / rescued / treeless", () => {
    const snv = { gene: "TP53", vartype: "SNV", type: "SNV", cell_ids: "a,c" }; // scattered
    const truncal = { gene: "EGFR", vartype: "AMP", type: "SCNA", cell_ids: "a,b,c,d" }; // root, F1 1
    const clade = ev("SOX2", "a,b");
    const scattered = ev("MYC", "a,d");
    const rescued = { gene: "TERT", vartype: "SNV", type: "SNV", cell_ids: "a,d", rescued: true };
    const eventsByPatient = { P1: [snv, truncal, clade, scattered, rescued], P2: [snv] };
    const r = filterEventsByF1(eventsByPatient, { P1: tree }, 0.7);
    expect(r.events.P1).toEqual([truncal, clade, rescued]);
    expect(r.events.P2).toEqual([snv]); // no tree for P2: nothing to judge by
    expect(r.hidden).toBe(2);
    expect(filterEventsByF1(eventsByPatient, { P1: tree }, 0.9).events.P1).toEqual([truncal, clade, rescued]);
    const off = filterEventsByF1(eventsByPatient, { P1: tree }, 0);
    expect(off.events).toBe(eventsByPatient);
    expect(off.hidden).toBe(0);
  });
});
