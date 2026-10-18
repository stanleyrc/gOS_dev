import { parseFootprint, mergeIntervals, footprintLocation, defaultFootprintPad, junctionSupport, chooseCarrierCell, carrierCells, isComplexEvent } from "./complexZoom";

describe("complexZoom", () => {
  test("parses multiple intervals on one chromosome", () => {
    const fp = parseFootprint("20:30687223-31687400,20:30551978-31552105");
    expect(fp).toEqual([
      { chromosome: "20", start: 30687223, end: 31687400 },
      { chromosome: "20", start: 30551978, end: 31552105 },
    ]);
  });
  test("parses cross-chromosome footprints and chr prefixes", () => {
    expect(footprintLocation("chr6:31991325-33037520, 8:101596422-102596458")).toBe("6:31991325-33037520|8:101596422-102596458");
    expect(parseFootprint("7:5")).toEqual([{ chromosome: "7", start: 5, end: 5 }]);
    expect(parseFootprint("garbage,,")).toEqual([]);
  });
  test("merges overlapping padded intervals only on the same chromosome", () => {
    const m = mergeIntervals(parseFootprint("20:100-200,20:150-300,21:100-200"), 10);
    expect(m).toEqual([
      { chromosome: "20", start: 90, end: 310 },
      { chromosome: "21", start: 90, end: 210 },
    ]);
  });
  test("pad is 20% of the largest interval, snapped to the options", () => {
    expect(defaultFootprintPad("6:1-1000000|8:1-1000000")).toBe(2.5e5);
    expect(defaultFootprintPad("7:42432003-57927624")).toBe(5e6);
    expect(defaultFootprintPad("")).toBe(0);
  });
  const cx = {
    intervals: [
      { iid: 1, chromosome: "6", startPoint: 100, endPoint: 200 },
      { iid: 2, chromosome: "9", startPoint: 100, endPoint: 200 },
    ],
    connections: [
      { source: -1, sink: 2, type: "ALT", weight: 3 },
      { source: 1, sink: 2, type: "REF", weight: 9 },
      { source: 2, sink: -2, type: "ALT", weight: 1 },
    ],
  };
  test("junction support counts ALT junctions touching the footprint", () => {
    expect(junctionSupport(cx, "6:150-160")).toEqual({ count: 1, weight: 3 });
    expect(junctionSupport(cx, "9:1-1000")).toEqual({ count: 2, weight: 4 });
    expect(junctionSupport(cx, "1:1-5")).toEqual({ count: 0, weight: 0 });
    expect(junctionSupport(null, "6:1-5")).toEqual({ count: 0, weight: 0 });
  });
  test("carrier choice: sample if a carrier, else most junction weight, else first", () => {
    const carriers = ["a", "b", "c"];
    const support = new Map([["a", { count: 1, weight: 2 }], ["c", { count: 1, weight: 5 }]]);
    expect(chooseCarrierCell({ sample: "b" }, carriers, support)).toBe("b");
    expect(chooseCarrierCell({ sample: "x" }, carriers, support)).toBe("c");
    expect(chooseCarrierCell({ sample: "x" }, carriers)).toBe("a");
    expect(chooseCarrierCell({}, [])).toBeNull();
  });
  test("carrier ids and complex detection", () => {
    expect(carrierCells({ cell_ids: "a,b," })).toEqual(["a", "b"]);
    expect(isComplexEvent({ type: "Complex SV" })).toBe(true);
    expect(isComplexEvent({ type: "SNV" })).toBe(false);
  });
});
