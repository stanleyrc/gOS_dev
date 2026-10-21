import { basisOps, breakendSide, cnTicks, connectorPoints, focusWindows, junctionClass, lensGraph, lensYMax, loosePoints, quantile, subgraphForWindows, windowsToDomains } from "./paperCellGraph";

// synthetic graph on chr7: 1 [0,100] 2 [101,200] 3 [201,300] 4 [301,400]; 5 on chr12
const iv = (iid, chromosome, startPoint, endPoint, y) => ({ iid, chromosome, startPoint, endPoint, y });
const graph = {
  intervals: [iv(1, "7", 0, 100, 2), iv(2, "7", 101, 200, 5), iv(3, "7", 201, 300, 2), iv(4, "7", 301, 400, 3), iv(5, "12", 1000, 2000, 4)],
  connections: [
    { cid: 1, source: 1, sink: -2, type: "REF", weight: 2 },
    { cid: 2, source: 2, sink: -3, type: "REF", weight: 2 },
    { cid: 10, source: 1, sink: -3, type: "ALT", weight: 3 }, // right of 1 -> left of 3: DEL-like
    { cid: 11, source: 3, sink: -2, type: "ALT", weight: 4 }, // right of 3 -> left of 2: DUP-like
    { cid: 12, source: 2, sink: 4, type: "ALT", weight: 1 }, // right -> right: INV-like
    { cid: 13, source: -4, sink: 5, type: "ALT", weight: 2 }, // chr7 -> chr12: TRA
    { cid: 14, source: 4, sink: null, type: "LOOSE", weight: 1 },
  ],
};

describe("paperCellGraph", () => {
  it("breakend sides follow the signed interval id", () => {
    expect(breakendSide(3)).toBe("right");
    expect(breakendSide(-3)).toBe("left");
  });
  it("classifies DEL, DUP, INV, TRA and loose", () => {
    const g = lensGraph(graph, { chr: "chr7", from: 0, to: 400 });
    const kind = Object.fromEntries(g.alts.map((j) => [j.cid, j.kind]));
    expect(kind).toEqual({ 10: "DEL", 11: "DUP", 12: "INV", 13: "TRA" });
    expect(g.alts.find((j) => j.cid === 10).a).toEqual({ chr: "7", pos: 100, side: "right", cn: 2 });
    expect(g.alts.find((j) => j.cid === 10).b).toEqual({ chr: "7", pos: 201, side: "left", cn: 2 });
    expect(g.refs.map((r) => r.cid)).toEqual([1, 2]);
    expect(g.loose).toEqual([{ cid: 14, chr: "7", pos: 400, side: "right", cn: 3, weight: 1 }]);
    expect(junctionClass({ chr: "7", pos: 5, side: "left" }, null)).toBe("LOOSE");
  });
  it("keeps junctions with one end in the window and drops the rest", () => {
    const g = lensGraph(graph, { chr: "7", from: 150, to: 250 });
    expect(g.segs.map((s) => s.iid)).toEqual([2, 3]);
    expect(g.alts.map((j) => j.cid).sort()).toEqual([10, 12]); // 11 joins 300 and 101, both outside
    expect(lensGraph(graph, { chr: "12", from: 0, to: 500 }).alts).toEqual([]);
  });
  it("subgraph keeps far intervals of touching connections", () => {
    const sg = subgraphForWindows(graph, [{ chr: "7", from: 350, to: 400 }]);
    expect(sg.intervals.map((i) => i.iid).sort()).toEqual([2, 4, 5]);
    expect(sg.connections.map((c) => c.cid).sort()).toEqual([12, 13, 14]);
  });
  it("CN axis: p99 coverage, never below wide segments, ignoring tiny spikes", () => {
    // 500 tiny segments of CN 1-2 plus one 10 bp spike of CN 200 in a 1 Mb window, and one wide CN 30 segment
    const segs = Array.from({ length: 500 }, (_, i) => ({ chr: "7", start: i * 1000, end: i * 1000 + 999, cn: 1 + (i % 2) }));
    segs.push({ chr: "7", start: 600000, end: 600010, cn: 200 });
    segs.push({ chr: "7", start: 700000, end: 760000, cn: 30 });
    const cov = Array.from({ length: 1000 }, (_, i) => (i < 995 ? 3 : 500));
    const top = lensYMax(segs, cov, { chr: "7", from: 0, to: 1e6 });
    expect(top).toBe(Math.ceil(30 * 1.05));
    expect(lensYMax([], [], { chr: "7", from: 0, to: 10 })).toBe(5);
    expect(lensYMax([], Array(100).fill(40), { chr: "7", from: 0, to: 10 })).toBe(42);
    expect(quantile([3, 1, 2], 0.99)).toBe(3);
  });
  it("ticks reach the axis top", () => {
    expect(cnTicks(42)).toEqual([0, 20, 42]);
    expect(cnTicks(100)).toEqual([0, 50, 100]);
    expect(cnTicks(5, 2)[0]).toBe(0);
    expect(cnTicks(5, 2).slice(-1)[0]).toBe(5);
  });
  it("connectors leave each breakend towards its side", () => {
    const Y = (cn) => 100 - cn * 10;
    const del = connectorPoints({ x: 100, cn: 2, side: "right" }, { x: 300, cn: 2, side: "left" }, Y);
    expect(del[1][0]).toBeGreaterThan(100); // right side: leaves to +x
    expect(del[5][0]).toBeLessThan(300); // left side: comes in from -x
    expect(del[3][1]).toBeLessThan(Y(2)); // equal CN: arcs above
    const dup = connectorPoints({ x: 100, cn: 2, side: "left" }, { x: 300, cn: 5, side: "right" }, Y);
    expect(dup[1][0]).toBeLessThan(100);
    expect(dup[4][0]).toBeGreaterThan(300);
    const inv = connectorPoints({ x: 300, cn: 3, side: "right" }, { x: 100, cn: 5, side: "right" }, Y);
    expect(inv[0][0]).toBe(100); // ordered left to right
    expect(inv[1][0]).toBeGreaterThan(100);
    expect(inv[4][0]).toBeGreaterThan(300);
    expect(loosePoints(10, 50, "left")[1][0]).toBeLessThan(10);
    expect(loosePoints(10, 50, "right")[1][0]).toBeGreaterThan(10);
  });
  it("basis curve matches d3 curveBasis structure", () => {
    const ops = basisOps([[0, 0], [10, 10], [20, 0]]);
    expect(ops[0]).toEqual(["M", 0, 0]);
    expect(ops[1][0]).toBe("L");
    expect(ops[ops.length - 1]).toEqual(["L", 20, 0]);
    expect(ops.filter((o) => o[0] === "C").length).toBe(2);
    expect(basisOps([[0, 0], [5, 5]])).toEqual([["M", 0, 0], ["L", 5, 5]]);
  });
  it("windows map to genome-plot domains and follow the zoom", () => {
    expect(windowsToDomains({ 7: { startPlace: 1000 } }, [{ chr: "chr7", from: 5, to: 50 }, { chr: "9", from: 1, to: 2 }])).toEqual([[1005, 1050]]);
    const region = { x: 0, y: 0, w: 100, h: 10, axis: { type: "genome", chr: "7", from: 0, to: 1000 } };
    expect(focusWindows(region, { zoom: { from: 100, to: 200 } })).toEqual([{ chr: "7", from: 100, to: 200 }]);
    expect(focusWindows(region, { view: { x0: 50, x1: 60, y0: 0, y1: 10 } })).toEqual([{ chr: "7", from: 500, to: 600 }]);
    expect(focusWindows(region, {})).toBeNull();
    expect(focusWindows(region, { view: { x0: 200, x1: 300, y0: 0, y1: 10 } })).toBeNull();
  });
});
