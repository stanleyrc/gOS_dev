import { cellEventPsi, clusterEvents, clusterTranscripts, eventPsi } from "./spliceEvents";

// PTBP2 exon 10: skip 96804940-96806865, inclusion 96804940-96806418 + 96806453-96806865
const cluster = {
  gene: "PTBP2",
  strand: "+",
  junctions: [
    { start: 96804940, end: 96806418 },
    { start: 96804940, end: 96806865 },
    { start: 96806453, end: 96806865 },
  ],
  cells: { a: [5, 0, 5], b: [0, 10, 0], c: [1, 0, 0] },
};
const model = {
  genes: {
    PTBP2: {
      strand: "+",
      transcripts: [
        { id: "T1", canonical: true, exons: [[96700000, 96700100], [96804800, 96804939], [96806419, 96806452], [96806866, 96806958], [96900000, 96900100]] },
        { id: "T2", canonical: false, exons: [[96804800, 96804939], [96806866, 96806958]] },
      ],
    },
  },
};

describe("clusterTranscripts", () => {
  it("keeps the exons inside the cluster window, numbered over the whole transcript", () => {
    const tx = clusterTranscripts(model, cluster);
    expect(tx.map((t) => t.id)).toEqual(["T1", "T2"]);
    expect(tx[0].exons.map((e) => e.n)).toEqual([2, 3, 4]);
  });
  it("numbers minus-strand exons from the 5' end", () => {
    const m = { genes: { G: { strand: "-", transcripts: [{ id: "T", canonical: true, exons: [[10, 20], [30, 40], [50, 60]] }] } } };
    const tx = clusterTranscripts(m, { gene: "G", strand: "-", junctions: [{ start: 21, end: 29 }, { start: 41, end: 49 }] });
    expect(tx[0].exons.map((e) => [e.start, e.n])).toEqual([
      [10, 3],
      [30, 2],
      [50, 1],
    ]);
  });
  it("is empty without a model", () => {
    expect(clusterTranscripts(null, cluster)).toEqual([]);
  });
});

describe("clusterEvents", () => {
  it("finds the cassette exon and names it by its canonical exon number", () => {
    const [ev] = clusterEvents(cluster, clusterTranscripts(model, cluster));
    expect(ev.type).toBe("cassette");
    expect(ev.exon).toEqual({ start: 96806419, end: 96806452 });
    expect(ev.exonNumber).toBe(3);
    expect(ev.exact).toBe(true);
    expect(ev.junctions).toEqual({ incl: [0, 2], skip: [1] });
  });
  it("finds an alternative 3' site", () => {
    const evs = clusterEvents({ strand: "+", junctions: [{ start: 100, end: 200 }, { start: 100, end: 230 }] });
    expect(evs).toHaveLength(1);
    expect(evs[0].type).toBe("alt3");
    expect(evs[0].junctions).toEqual({ incl: [0], skip: [1] });
  });
});

describe("eventPsi / cellEventPsi", () => {
  const [ev] = clusterEvents(cluster, []);
  it("cassette PSI averages the two inclusion junctions", () => {
    expect(eventPsi([4, 4, 6], ev).psi).toBeCloseTo(5 / 9);
    expect(eventPsi([0, 0, 0], ev).psi).toBeNaN();
  });
  it("per-cell PSI keeps cells with enough reads", () => {
    expect(cellEventPsi(cluster, ev)).toEqual([
      { id: "a", psi: 1, reads: 10 },
      { id: "b", psi: 0, reads: 10 },
    ]);
  });
});

describe("junction focus", () => {
  const { mainJunctions, differingJunctions, junctionEvent, groupCellPsi } = require("./spliceEvents");
  it("main junctions hold >= 2% of reads", () => {
    expect(mainJunctions([100, 1, 50, 0])).toEqual([0, 2]);
  });
  it("differing junctions come from groups with enough cells", () => {
    const groups = [
      { counts: [90, 10, 0], total: 100, nCells: 10 },
      { counts: [10, 90, 0], total: 100, nCells: 10 },
      { counts: [0, 0, 50], total: 50, nCells: 2 },
    ];
    expect(differingJunctions(groups, { top: 2 })).toEqual([0, 1]);
  });
  it("junction events and grouped per-cell PSI", () => {
    const ev = junctionEvent(1, 3);
    expect(ev.junctions).toEqual({ incl: [1], skip: [0, 2] });
    const out = groupCellPsi({ cells: { a: [0, 4, 0], b: [4, 0, 0], c: [0, 1, 0] } }, ev, (id) => (id === "b" ? "B" : "A"));
    expect(out.get("A")).toEqual([1]);
    expect(out.get("B")).toEqual([0]);
  });
});
