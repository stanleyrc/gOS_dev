import { sidecarExtras, axisReadout, markPositions, plotHitAt, toData, toPage, axisPosition, highlightRects, hitAt, parseSidecar, rowBand, rowIndexAt, rowsBetween } from "./paperSidecar";

const side = parseSidecar({
  format: "gos-paper-sidecar/1",
  page: { w: 500, h: 400 },
  regions: [
    { id: "t", panel: "B", x: 0, y: 100, w: 50, h: 40, rows: ["c1", "c2", "c3", "c4"], rowset: "B", label: "Tree tip" },
    { id: "k", panel: "B", x: 60, y: 100, w: 10, h: 40, rows: ["c1", "c2", "c3", "c4"], rowset: "B", values: ["Clone1", "Clone1", "Clone2", null], value_label: "clade" },
    { id: "cn", panel: "B", x: 100, y: 100, w: 100, h: 40, rows: ["c1", "c2", "c3", "c4"], rowset: "B", axis: { type: "genome", chr: "7", from: 50e6, to: 60e6 } },
    { id: "bad", x: 0, y: 0, w: 0, h: 10, rows: ["x"] },
  ],
});

describe("interactive-paper sidecar", () => {
  it("parses regions and drops degenerate ones", () => {
    expect(side.page).toEqual({ w: 500, h: 400 });
    expect(side.regions.map((r) => r.id)).toEqual(["t", "k", "cn"]);
    expect(parseSidecar({})).toBeNull();
  });
  it("maps page points to rows, values and genome positions", () => {
    const r = side.regions[0];
    expect(rowIndexAt(r, 100)).toBe(0);
    expect(rowIndexAt(r, 139.9)).toBe(3);
    expect(rowIndexAt(r, 99)).toBe(-1);
    expect(rowBand(r, 1)).toEqual({ y0: 110, y1: 120 });
    const h = hitAt(side, 150, 125);
    expect(h.id).toBe("c3");
    expect(h.extras).toEqual([{ label: "clade", value: "Clone2" }]);
    expect(h.position).toEqual({ chr: "7", pos: 55e6 });
    expect(hitAt(side, 300, 125)).toBeNull();
    expect(axisPosition(side.regions[0], 10)).toBeNull();
  });
  it("brushes rows and highlights them across the rowset", () => {
    expect(rowsBetween(side.regions[0], 125, 105)).toEqual(["c1", "c2", "c3"]);
    const rects = highlightRects(side, "B", "t", new Set(["c1", "c2", "c4"]));
    expect(rects.length).toBe(6);
    expect(rects[0]).toEqual({ x: 0, y: 100, w: 50, h: 20 });
    expect(rects[1]).toEqual({ x: 0, y: 130, w: 50, h: 10 });
    expect(highlightRects(side, "B", "t", new Set())).toEqual([]);
  });
});

describe("ggplot plot regions", () => {
  const sc = parseSidecar({
    regions: [
      {
        id: "p#1",
        kind: "plot",
        x: 100,
        y: 0,
        w: 100,
        h: 100,
        xscale: { discrete: true, range: [0.5, 2.5], labels: ["MES", "AC"] },
        yscale: { discrete: false, range: [0, 10] },
        marks: [
          { type: "points", x: [1, 2], y: [5, 8], fields: { cell: ["c1", "c2"], patient: "P1" } },
          { type: "rects", xmin: [0.6], xmax: [1.4], ymin: [0], ymax: [2], fields: { patient: ["P2"] } },
        ],
      },
    ],
  });
  const r = sc.regions[0];
  it("converts between data and page", () => {
    expect(toPage(r, 1, 5)).toEqual([125, 50]);
    expect(toData(r, 125, 50)).toEqual([1, 5]);
    expect(axisReadout(r, 175, 0)).toEqual({ x: "AC", y: 10 });
  });
  it("hits the nearest point, then rects, then axes", () => {
    const h = plotHitAt(sc, 126, 51);
    expect(h.fields).toEqual({ cell: "c1", patient: "P1" });
    expect(plotHitAt(sc, 125, 90).fields).toEqual({ patient: "P2" });
    expect(plotHitAt(sc, 190, 90).axis.x).toBe("AC");
    expect(plotHitAt(sc, 10, 10)).toBeNull();
  });
  it("finds linked marks by field", () => {
    const m = markPositions(sc, "cell", new Set(["c2"]));
    expect(m).toHaveLength(1);
    expect(m[0][0]).toBeCloseTo(175);
    expect(m[0][1]).toBeCloseTo(20);
  });
});

describe("sidecar figure extras", () => {
  it("reads walk display names and the figure's ecDNA SNV set for a patient", () => {
    const sc = parseSidecar({ regions: [], data: { walk_names: { patient: "P1", names: { w1: "Long 1" }, colors: { w1: "#000000" } }, ecdna_snvs: { patient: "P1", chromosome: "7", sites: ["100_A_T", "200_G_C"], pos: [100, 200], class: ["a", "b"], cell: ["c1", "c2"], site: ["100_A_T", "200_G_C"], frac: [0.5, 1] } } });
    const x = sidecarExtras(sc, "P1");
    expect(x.walkNames).toEqual({ w1: "Long 1" });
    expect(x.ecdnaSnvs.map((v) => v.id)).toEqual(["7_100_A_T", "7_200_G_C"]);
    expect(x.ecdnaSnvs[1].frac.get("c2")).toBe(1);
    expect(sidecarExtras(sc, "P2").walkNames).toBeNull();
  });
});
