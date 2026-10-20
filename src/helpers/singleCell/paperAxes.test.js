import { parseSidecar } from "./paperSidecar";
import { figureControls, fieldControls, highlightFieldMarks, liveCellsOnPlot, livePatients, panelZooms, regionAtPoint, regionZoom, zoomTarget } from "./paperAxes";
import { lensIsHome, lensOn, lensPan, lensToPage, lensView, lensZoom, pinchFactor } from "./paperZoom";

const plot = (panel, id, x, y, marks, extra = {}) => ({ panel, id, kind: "plot", x, y, w: 100, h: 50, xscale: { range: [0, 10] }, yscale: { range: [0, 5] }, marks, ...extra });
const sidecar = parseSidecar({
  page: { w: 500, h: 500 },
  regions: [
    { panel: "b", id: "snv", kind: "rows", x: 100, y: 10, w: 200, h: 100, rows: ["c1", "c2"], patient: "P1", cols: { ids: ["1:1", "1:2", "1:3"] } },
    { panel: "b", id: "cn", kind: "rows", x: 320, y: 10, w: 100, h: 100, rows: ["c1", "c2"], patient: "P1", axis: { type: "genome", chr: "1", from: 0, to: 100 } },
    { panel: "b", id: "clade", kind: "rows", x: 60, y: 10, w: 10, h: 100, rows: ["c1", "c2"], patient: "P1" },
    plot("c", "sc", 10, 200, [{ type: "points", x: [1, 2, 3], y: [1, 2, 3], fields: { patient: ["A", "B", "A"], gene: ["EGFR", "EGFR", "MDM2"] } }]),
    plot("d", "ov", 200, 200, [{ type: "points", x: [1], y: [1], fields: { patient: ["A"] } }], { zoom: "x" }),
  ],
  controls: [{ panel: "z", type: "patient", options: ["P1", "P2"], default: "P1" }, { panel: "q", type: "bogus" }],
});

describe("region zoom axes", () => {
  test("matrices and genome heatmaps zoom columns only, strips do not, plots are free, sidecar overrides", () => {
    const z = Object.fromEntries(sidecar.regions.map((r) => [r.id, regionZoom(r)]));
    expect(z).toEqual({ snv: "x", cn: "x", clade: "none", sc: "xy", ov: "x" });
    expect(panelZooms(sidecar, "B").map((p) => p.zoom)).toEqual(["x", "x", "none"]);
  });
  test("zoom target clips one-axis zooms to the region and free zooms to the panel", () => {
    const panel = { x: 0, y: 0, w: 450, h: 120 };
    expect(zoomTarget(sidecar, 150, 50, panel)).toMatchObject({ mode: "x", rect: { x: 100, y: 10, w: 200, h: 100 } });
    expect(zoomTarget(sidecar, 65, 50, panel)).toBeNull();
    const pp = { x: 0, y: 190, w: 150, h: 80 };
    expect(zoomTarget(sidecar, 50, 220, pp)).toMatchObject({ mode: "xy", rect: pp });
    expect(zoomTarget(sidecar, 440, 400, pp)).toMatchObject({ mode: "xy", rect: pp }); // outside every region: panel, free
    expect(regionAtPoint(sidecar, 150, 50).id).toBe("snv");
  });
});

describe("axis-locked lens", () => {
  const rect = { x: 100, y: 10, w: 200, h: 100 };
  test("x mode scales and pans columns only; rows stay fixed", () => {
    const l = lensZoom(lensOn(rect, "x"), 2, 4, 300, 100);
    expect(l.sx).toBe(4);
    expect(l.sy).toBe(1);
    expect(l.oy).toBe(10);
    const v = lensView(l);
    expect(v.y0).toBe(10);
    expect(v.y1).toBe(110);
    expect(v.x1 - v.x0).toBeCloseTo(50);
    const p = lensPan(l, 2, -400, 999);
    expect(p.oy).toBe(10);
    expect(p.ox).toBeGreaterThan(l.ox);
    // the page point under the pointer stays put
    const [x, y] = lensToPage(lensOn(rect, "x"), 2, 300, 100);
    const [x2, y2] = lensToPage(l, 2, 300, 100);
    expect(x2).toBeCloseTo(x);
    expect(y2).toBeCloseTo(y);
  });
  test("y mode and none", () => {
    const l = lensZoom(lensOn(rect, "y"), 2, 3, 300, 100);
    expect([l.sx, l.sy]).toEqual([1, 3]);
    expect(lensZoom(lensOn(rect, "none"), 2, 3, 300, 100).sx).toBe(1);
    expect(lensIsHome(lensZoom(l, 2, 0.1, 300, 100))).toBe(true);
    expect(lensZoom(lensOn(rect), 2, 2, 300, 100).s).toBe(2);
  });
  test("pinch factor", () => {
    expect(pinchFactor(100, 150)).toBeCloseTo(1.5);
    expect(pinchFactor(100, 900)).toBe(2);
    expect(pinchFactor(0, 10)).toBe(1);
  });
});

describe("in-figure controls", () => {
  test("declared controls win; mark fields give patient / gene controls; rows panels get a patient switcher", () => {
    expect(sidecar.controls).toHaveLength(1);
    const f = fieldControls(sidecar);
    expect(f.map((c) => `${c.panel}:${c.type}:${c.options.join("/")}`)).toEqual(["c:patient:A/B", "c:gene:EGFR/MDM2"]);
    const all = figureControls(sidecar, "FigureX");
    expect(all.map((c) => `${c.panel}:${c.type}`)).toEqual(["z:patient", "c:patient", "c:gene", "b:patient-view"]);
    expect(all.find((c) => c.type === "patient-view").default).toBe("P1");
    expect(figureControls(sidecar, "Figure1").some((c) => c.source === "state_scores")).toBe(true);
  });
  test("highlight marks of a chosen value", () => {
    const h = highlightFieldMarks(sidecar, "c", "patient", "A");
    expect(h.points).toHaveLength(2);
    expect(h.points[0][0]).toBeCloseTo(10 + 10);
    expect(highlightFieldMarks(sidecar, "c", "patient", "nobody").points).toHaveLength(0);
  });
  test("live cells matched to the static plot by coordinates", () => {
    const region = sidecar.regions.find((r) => r.id === "sc");
    const cells = [
      { cell: "a1", patient: "A", x: 1, y: 1, state: "MES" },
      { cell: "b1", patient: "B", x: 2, y: 2, state: "AC" },
      { cell: "z", patient: "A", x: 9, y: 9, state: "AC" },
    ];
    const r = liveCellsOnPlot(region, cells, "A");
    expect(r).toMatchObject({ total: 3, matched: 2 });
    expect(r.cells.map((c) => c.cell)).toEqual(["a1"]);
    expect(liveCellsOnPlot(region, cells, "all").cells).toHaveLength(2);
    expect(livePatients(cells)).toEqual([{ patient: "A", count: 2 }, { patient: "B", count: 1 }]);
  });
});
