import {
  TRUNK,
  cellsStrip,
  concordanceRows,
  eventMarks,
  findPair,
  fmtP,
  forestDomain,
  forestRows,
  isAncestor,
  leafStrip,
  oncoplotRows,
  pairSentence,
  parseTree,
  relationInPatient,
  scopedPairs,
  signalFill,
  treeGeometry,
} from "./alignedTrees";
import { plotTheme } from "./plotTheme";

// ((a,b),(c,(d,e))) in pre-order: 0 root [0-4], 1 (a,b) [0-1], 2 a, 3 b, 4 (c,(d,e)) [2-4], 5 c, 6 (d,e) [3-4], 7 d, 8 e
const t5 = () => ({
  nodes: [
    [-1, 0, 4],
    [0, 0, 1],
    [1, 0, 0],
    [1, 1, 1],
    [0, 2, 4],
    [4, 2, 2],
    [4, 3, 4],
    [6, 3, 3],
    [6, 4, 4],
  ],
  leaves: ["a", "b", "c", "d", "e"],
  time: [0, 1 - Math.log(2) / Math.log(5), 1, 1, 1 - Math.log(3) / Math.log(5), 1, 1 - Math.log(2) / Math.log(5), 1, 1],
});

describe("parseTree / geometry", () => {
  it("parses nodes, children and sizes", () => {
    const t = parseTree(t5());
    expect(t.n).toBe(5);
    expect(t.nodes[0].children).toEqual([1, 4]);
    expect(t.nodes[4].size).toBe(3);
    expect(isAncestor(t, 4, 7)).toBe(true);
    expect(isAncestor(t, 1, 7)).toBe(false);
    expect(isAncestor(t, 4, 4)).toBe(false);
    expect(parseTree(null)).toBeNull();
  });

  it("draws a trunk, edges and connectors; collapses small clades to wedges", () => {
    const t = parseTree(t5());
    const g = treeGeometry(t);
    expect(g.edges[0]).toEqual({ node: 0, x0: -TRUNK, x1: 0, y: 2.5 });
    expect(g.edges).toHaveLength(9);
    expect(g.wedges).toHaveLength(0);
    const c = treeGeometry(t, { minSize: 3 });
    // only root and node 4 are shown; node 1 (2 leaves) and its siblings collapse
    expect(c.edges.map((e) => e.node)).toEqual([0, 4]);
    expect(c.wedges.map((w) => w.node).sort()).toEqual([1, 5, 6]);
    expect(c.wedges.find((w) => w.node === 1)).toMatchObject({ x: 0, y0: 0, y1: 2 });
  });
});

describe("events", () => {
  const patient = {
    tree: t5(),
    events: [
      { id: "+7", class: "gain", placed: true, truncal: true, node: 0, short: "7+" },
      { id: "-10", class: "loss", placed: true, truncal: true, node: 0, short: "10−" },
      { id: "EGFR amp", class: "amp", placed: true, truncal: false, node: 4 },
      { id: "PTEN del", class: "homdel", placed: true, truncal: false, node: 1 },
      { id: "x", class: "snv", placed: false, truncal: false, node: 6 },
    ],
  };

  it("places marks on the trunk or the branch into the clade", () => {
    const t = parseTree(patient.tree);
    const marks = eventMarks(t, patient.events);
    expect(marks).toHaveLength(4);
    const trunk = marks.filter((m) => m.truncal);
    expect(trunk[0].x).toBeCloseTo(-TRUNK + TRUNK / 3);
    expect(trunk[1].x).toBeCloseTo(-TRUNK + (2 * TRUNK) / 3);
    const egfr = marks.find((m) => m.id === "EGFR amp");
    expect(egfr.x).toBeCloseTo(t.nodes[4].time / 2);
    expect(egfr.y).toBe(3.5);
  });

  it("orders events within a patient", () => {
    expect(relationInPatient(patient, "+7", "EGFR amp")).toBe("a_first");
    expect(relationInPatient(patient, "EGFR amp", "+7")).toBe("b_first");
    expect(relationInPatient(patient, "+7", "-10")).toBe("same");
    expect(relationInPatient(patient, "EGFR amp", "PTEN del")).toBe("parallel");
    expect(relationInPatient(patient, "EGFR amp", "x")).toBe("unplaced");
    expect(relationInPatient(patient, "EGFR amp", "nope")).toBe("absent");
  });

  it("builds oncoplot rows by median time", () => {
    const aligned = {
      patients: { P1: patient, P2: { events: [{ id: "EGFR amp", placed: true }] } },
      events: [
        { id: "EGFR amp", class: "amp", n_placed: 2, n_truncal: 0, median_time: 0.3 },
        { id: "+7", class: "gain", n_placed: 2, n_truncal: 2, median_time: 0 },
        { id: "x", class: "snv", n_placed: 1, n_truncal: 0, median_time: 0.9 },
      ],
    };
    const rows = oncoplotRows(aligned, ["P1", "P2"]);
    expect(rows.map((r) => r.id)).toEqual(["+7", "EGFR amp"]);
    expect(rows[0].cells[1]).toBeNull();
    expect(rows[1].cells[1]).toMatchObject({ id: "EGFR amp" });
    expect(oncoplotRows(aligned, ["P1"], { classes: ["amp"] }).map((r) => r.id)).toEqual(["EGFR amp"]);
  });
});

describe("pairs", () => {
  const aligned = {
    pairs: [
      { scope: "all", a: "+7", b: "EGFR amp", a_first: 3, b_first: 1, same: 1, parallel: 0, p: 0.6, both_placed: 5 },
      { scope: "all", a: "+7", b: "-10", a_first: 0, b_first: 0, same: 5, parallel: 0, p: null, both_placed: 5 },
      { scope: "current", a: "+7", b: "EGFR amp", a_first: 2, b_first: 0, same: 0, parallel: 0, p: 0.5, both_placed: 2 },
    ],
  };
  it("filters by scope and sorts by consistency", () => {
    const all = scopedPairs(aligned, "all");
    expect(all).toHaveLength(2);
    expect(all[0].b).toBe("EGFR amp");
    expect(scopedPairs(aligned, "current")).toHaveLength(1);
  });
  it("finds a pair either way round", () => {
    expect(findPair(aligned.pairs, "EGFR amp", "+7")).toMatchObject({ a: "+7" });
    expect(findPair(aligned.pairs, "EGFR amp", "zzz")).toBeNull();
  });
  it("writes a plain-language sentence", () => {
    const lab = (x) => ({ "+7": "chr7 gain", "EGFR amp": "EGFR amplification", "-10": "chr10 loss" }[x]);
    expect(pairSentence(aligned.pairs[0], lab)).toBe("chr7 gain precedes EGFR amplification in 3/4 patients where the two are ordered (1 same branch)");
    expect(pairSentence(aligned.pairs[1], lab)).toBe("chr7 gain and chr10 loss are never nested in one lineage (5 same branch)");
  });
});

describe("strips", () => {
  it("fills leaf strips from rows and association cells", () => {
    expect(leafStrip(4, [0, 2, 9])).toEqual([true, null, true, null]);
    expect(cellsStrip(3, [[0, "MES", "Clone1"], [2, "AC", "Clone2"]])).toEqual(["MES", null, "AC"]);
    expect(cellsStrip(3, [[0, "MES", "Clone1"]], 2)).toEqual(["Clone1", null, null]);
  });
});

describe("associations", () => {
  const assoc = {
    concordance: [
      { phenotype: "MES", kind: "state", per_patient: { P1: { z: 3, p: 0.01 } } },
      { phenotype: "MP1", kind: "program", per_patient: {} },
    ],
    event_state: [
      { event: "EGFR amp", state: "MES", n_patients: 3, or: 2, lo: 1.1, hi: 3.6, per_patient: { P1: { or: 4, p: 0.1 }, P2: { or: 0.5, p: 0.5 } } },
      { event: "x", state: "AC", n_patients: 1, or: 2, per_patient: {} },
    ],
  };
  it("builds the concordance matrix", () => {
    const rows = concordanceRows(assoc, ["P1", "P2"], { kinds: ["state"] });
    expect(rows).toHaveLength(1);
    expect(rows[0].cells).toEqual([{ z: 3, p: 0.01 }, null]);
  });
  it("colours only significant positive signal", () => {
    const th = plotTheme("light");
    expect(signalFill(null, th)).toBe(th.empty);
    expect(signalFill({ z: 3, p: 0.2 }, th)).toBe(th.panelAlt);
    expect(signalFill({ z: -3, p: 0.01 }, th)).toBe(th.panelAlt);
    expect(signalFill({ z: 6, p: 0.001 }, th)).toMatch(/^rgba\(22,119,255,/);
  });
  it("builds forest rows on the log scale", () => {
    const rows = forestRows(assoc);
    expect(rows).toHaveLength(1);
    expect(rows[0].lor).toBeCloseTo(Math.log(2));
    expect(rows[0].patientLors.map((x) => x.patient)).toEqual(["P1", "P2"]);
    const [lo, hi] = forestDomain(rows);
    expect(hi).toBeCloseTo(Math.log(4));
    expect(lo).toBeCloseTo(-Math.log(4));
  });
  it("formats p-values", () => {
    expect(fmtP(0.0004)).toBe("p < 0.001");
    expect(fmtP(0.0123)).toBe("p = 0.012");
    expect(fmtP(0.004)).toBe("p = 0.004");
    expect(fmtP(0.5)).toBe("p = 0.5");
    expect(fmtP(NaN)).toBe("");
  });
});
