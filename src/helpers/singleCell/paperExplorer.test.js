import { axisFrac, bandPath, clickSelect, defaultToggles, explorerPanels, linePath, nearestPoint, parseExplorer, plotScales, pointUrl, pointsTsv, shapePath, tumorColors, visiblePoints } from "./paperExplorer";
import { parseSidecar, plotHitAt, toData, toPage } from "./paperSidecar";

// synthetic fixture (no patient data)
const raw = {
  regions: [{ panel: "c", id: "c-xy", kind: "plot", x: 100, y: 50, w: 100, h: 100, xscale: { range: [1, 100], log: true }, yscale: { range: [0.01, 100], log: true }, marks: [{ type: "points", x: [10, 1], y: [1, 0.01], fields: { point: ["p1", "p2"] } }] }],
  data: {
    explorers: {
      C: {
        title: "synthetic",
        x: { label: "mean", log: true, range: [1, 100], ticks: [1, 10, 100] },
        y: { label: "var/mean", log: true, range: [0.01, 100] },
        kinds: [{ key: "amp", label: "Amplicons" }, { key: "arm", label: "Arms", default: false }],
        lines: [{ id: "cut", points: [[1, 1.5], [100, 1.5]] }],
        bands: [{ id: "b", x: [1, 10, 100], lo: [0.1, 0.2, 0.3], hi: [1, 2, 3] }],
        points: [
          { id: "p1", kind: "amp", tumor: "T2", name: "GENE1", mean_cn: 10, var_mean: 1, report: "T2_r", dataset: "ds-clean", location: "7:1-7:2", carriers: ["c1", "c2"], tooltip: [["Tumor", "T2"], ["Name", "GENE1"]], hist: { edges: [0, 1, 2], counts: [1, 1], mean: 1 }, strip: { cells: ["c1", "c2"], cn: [1, 2] } },
          { id: "p2", kind: "arm", tumor: "T1", name: "T1 +7p", mean_cn: 1, var_mean: 0.01, tooltip: [["Tumor", "T1"], ["Name", "T1 +7p"]], hist: { edges: [0, 1], counts: [1, 2] } },
          { id: "bad", kind: "arm" },
        ],
      },
    },
  },
};

describe("paper point explorer", () => {
  const sc = parseSidecar(raw);
  const ex = parseExplorer(sc, "c");
  it("parses the explorer and drops points without coordinates or with broken histograms", () => {
    expect(explorerPanels(sc)).toEqual(["c"]);
    expect(ex.points.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(ex.points[1].hist).toBeNull();
    expect(ex.byId.get("p1").strip.cells).toEqual(["c1", "c2"]);
    expect(parseExplorer(sc, "d")).toBeNull();
    expect(parseExplorer(null, "c")).toBeNull();
  });
  it("toggles point kinds, lines and bands", () => {
    const t = defaultToggles(ex);
    expect(t).toEqual({ kinds: { amp: true, arm: false }, lines: { cut: true }, bands: { b: false }, byTumor: false });
    expect(visiblePoints(ex, t).map((p) => p.id)).toEqual(["p1"]);
    expect(visiblePoints(ex, { kinds: {} }).length).toBe(2);
  });
  it("scales log axes and finds the nearest point", () => {
    expect(axisFrac(ex.x, 10)).toBeCloseTo(0.5);
    const s = plotScales(ex, { x: 0, y: 0, w: 200, h: 100 });
    expect(s.sx(10)).toBeCloseTo(100);
    expect(s.sy(1)).toBeCloseTo(50);
    expect(s.sx(1000)).toBe(200);
    expect(nearestPoint(ex.points, s, 103, 50).id).toBe("p1");
    expect(nearestPoint(ex.points, s, 150, 10)).toBeNull();
    expect(linePath(ex.lines[0].points, s)).toMatch(/^M0\.00,/);
    expect(bandPath(ex.bands[0], s)).toMatch(/Z$/);
    ["circle", "dot", "tri-up", "tri-down", "diamond"].forEach((k) => expect(shapePath(k, 5, 5, 2)).toMatch(/^M/));
  });
  it("selects with click / shift-click", () => {
    expect(clickSelect([], "a", false)).toEqual(["a"]);
    expect(clickSelect(["a"], "a", false)).toEqual([]);
    expect(clickSelect(["a"], "b", true)).toEqual(["a", "b"]);
    expect(clickSelect(["a", "b"], "a", true)).toEqual(["b"]);
    expect(clickSelect(["a"], null, false)).toEqual([]);
  });
  it("colors tumors and links into the report", () => {
    expect(Object.keys(tumorColors(ex.points))).toEqual(["T1", "T2"]);
    const u = new URL(`http://x${pointUrl(ex.byId.get("p1"), { search: "?dataset=ds&report=old&tab=3", pathname: "/g/" })}`);
    expect(u.pathname).toBe("/g/");
    expect(u.searchParams.get("dataset")).toBe("ds-clean");
    expect(u.searchParams.get("report")).toBe("T2_r");
    expect(u.searchParams.get("tab")).toBe("7");
    expect(u.searchParams.get("location")).toBe("7:1-7:2");
    expect(u.searchParams.get("scsel")).toBe("GENE1 carriers (T2)");
    expect(u.searchParams.get("scgroups")).toBeTruthy();
    const w = new URL(`http://x${pointUrl(ex.byId.get("p1"), { walk: "GENE1 1" })}`);
    expect(w.searchParams.get("tab")).toBe("14");
    expect(w.searchParams.get("walk")).toBe("GENE1 1");
    expect(pointUrl({ id: "x" })).toBeNull();
    expect(pointsTsv(ex.points).split("\n")).toEqual(["id\tTumor\tName", "p1\tT2\tGENE1", "p2\tT1\tT1 +7p"]);
  });
  it("maps log-scale sidecar plot regions to the page", () => {
    const r = sc.regions[0];
    expect(r.xscale.log).toBe(true);
    const [px, py] = toPage(r, 10, 1);
    expect(px).toBeCloseTo(150);
    expect(py).toBeCloseTo(100);
    const [dx, dy] = toData(r, 150, 100);
    expect(dx).toBeCloseTo(10);
    expect(dy).toBeCloseTo(1);
    expect(plotHitAt(sc, 151, 100).fields.point).toBe("p1");
  });
});
