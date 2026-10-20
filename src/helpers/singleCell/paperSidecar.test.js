import { axisPosition, highlightRects, hitAt, parseSidecar, rowBand, rowIndexAt, rowsBetween } from "./paperSidecar";

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
