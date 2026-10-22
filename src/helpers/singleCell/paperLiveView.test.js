import { livePanel, livePanels, liveStart, panelWindows, wholeGenomeDomains, windowsToDomains } from "./paperLiveView";

// synthetic sidecar: a tree + CN heatmap panel (f), an example-cells tracks panel (b), an ecDNA copies panel (d)
const rows = (n, p = "c") => Array.from({ length: n }, (_, i) => `${p}${i}`);
const SIDECAR = {
  regions: [
    { id: "f1", panel: "f", kind: "rows", patient: "P1", label: "Tree tip", rows: rows(20) },
    { id: "f2", panel: "f", kind: "rows", patient: "P1", label: "chr3 copy number", rows: rows(20), axis: { type: "genome", chr: "3", from: 1, to: 100 } },
    { id: "f3", panel: "f", kind: "rows", patient: "P1", label: "chr8 copy number", rows: rows(20), axis: { type: "genome", chr: "chr8", from: 10, to: 50 } },
    { id: "f4", panel: "f", kind: "rows", patient: "P1", label: "chr3 again", rows: rows(20), axis: { type: "genome", chr: "3", from: 1, to: 100 } },
    { id: "b1", panel: "B", kind: "rows", patient: "P1", label: "Example cells", rows: ["x1", "x2", "x3"], axis: { type: "genome", chr: "2", from: 5, to: 9, windows: [{ chr: "2", from: 5, to: 9 }, { chr: "12", from: 1, to: 4 }] } },
    { id: "d1", panel: "d", kind: "rows", patient: "P2", label: "Tree tip", rows: rows(30) },
    { id: "d2", panel: "d", kind: "rows", patient: "P2", label: "Long ecEGFR copies", rows: rows(30) },
    { id: "g1", panel: "g", kind: "rows", patient: "P3", label: "Group topology", rows: [] },
    { id: "p1", panel: "a", kind: "plot", patient: null },
  ],
};
const BINS = {
  2: { startPlace: 1000, endPlace: 1100, startPoint: 1, endPoint: 100 },
  3: { startPlace: 2000, endPlace: 2080, startPoint: 1, endPoint: 80 },
  8: { startPlace: 3000, endPlace: 3060, startPoint: 1, endPoint: 60 },
  12: { startPlace: 4000, endPlace: 4050, startPoint: 1, endPoint: 50 },
};

describe("paper live views", () => {
  test("panel windows: unique, figure order, chr prefix dropped, axis windows expanded", () => {
    expect(panelWindows(SIDECAR, "F")).toEqual([
      { chr: "3", from: 1, to: 100 },
      { chr: "8", from: 10, to: 50 },
    ]);
    expect(panelWindows(SIDECAR, "b")).toEqual([
      { chr: "2", from: 5, to: 9 },
      { chr: "12", from: 1, to: 4 },
    ]);
    expect(panelWindows(SIDECAR, "a")).toEqual([]);
    expect(panelWindows(null, "f")).toEqual([]);
  });

  test("kinds: tree + matrices -> heatmap, few example cells -> tracks, walk copies -> ecdna", () => {
    const ps = livePanels(SIDECAR);
    expect(ps.map((p) => [p.panel, p.patient, p.kind])).toEqual([
      ["f", "P1", "heatmap"],
      ["B", "P1", "tracks"],
      ["d", "P2", "ecdna"],
      ["g", "P3", "heatmap"],
    ]);
    expect(livePanel(ps, "b").cells).toEqual(["x1", "x2", "x3"]);
    expect(livePanel(ps, "f").cells).toEqual([]);
    expect(livePanel(ps, "z")).toBeNull();
  });

  test("windows -> store domains, clipped to the chromosome; unknown chromosomes dropped", () => {
    expect(windowsToDomains([{ chr: "3", from: 1, to: 100 }, { chr: "8", from: 10, to: 50 }, { chr: "Q", from: 1, to: 2 }], BINS)).toEqual([
      [2000, 2079],
      [3009, 3049],
    ]);
    expect(wholeGenomeDomains(BINS)).toEqual([[1000, 4050]]);
    expect(wholeGenomeDomains(null)).toEqual([]);
  });

  test("the printed patient opens at the panel's loci and cells; another patient at the whole genome", () => {
    const ps = livePanels(SIDECAR);
    const f = liveStart(livePanel(ps, "f"), "P1", BINS);
    expect(f).toMatchObject({ patient: "P1", kind: "heatmap", printed: true, cells: [] });
    expect(f.domains).toEqual([
      [2000, 2079],
      [3009, 3049],
    ]);
    const b = liveStart(livePanel(ps, "b"), "P1", BINS);
    expect(b.cells).toEqual(["x1", "x2", "x3"]);
    const other = liveStart(livePanel(ps, "b"), "P9", BINS);
    expect(other).toMatchObject({ patient: "P9", printed: false, cells: [], domains: [[1000, 4050]] });
    expect(liveStart(null, "P1", BINS)).toMatchObject({ kind: "heatmap", printed: false, domains: [[1000, 4050]] });
  });
});
