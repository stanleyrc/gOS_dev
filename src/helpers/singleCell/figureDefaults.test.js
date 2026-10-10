import { ampliconWindows, dominantGroupIndex, dominantWalk, mainAmplicons, variantGrouping } from "./figureDefaults";

const walk = (id, label, driver, chrRanges, cells, curated = true) => ({
  id,
  label,
  driver_genes: driver,
  curated,
  nodes: chrRanges.map(([chromosome, start, end]) => ({ chromosome, start, end })),
  cells,
});
const cellsOf = (n, cn, prefix = "c") => Object.fromEntries(Array.from({ length: n }, (_, i) => [`${prefix}${i}`, cn]));

describe("dominantWalk", () => {
  it("picks the driver walk with the most summed copies, not the most carriers (BWH69: MYCN over EGFR)", () => {
    const egfr = walk("40", "EGFR 1", "EGFR", [["7", 54.6e6, 55.3e6]], cellsOf(157, 45));
    const mycn = walk("39", "MYCN 1", "MYCN", [["2", 15.8e6, 16.6e6]], cellsOf(154, 73));
    const other = walk("1", "Other 1", [], [["2", 1, 2]], cellsOf(160, 200));
    expect(dominantWalk([egfr, mycn, other]).id).toBe("39");
  });
  it("ignores non-carriers and falls back to any walk without drivers", () => {
    const a = walk("a", "Other 1", [], [["12", 1, 2]], { x: 0, y: 0.5, z: 3 });
    const b = walk("b", "Other 2", [], [["12", 1, 2]], { x: 2 });
    expect(dominantWalk([a, b]).id).toBe("a");
    expect(dominantWalk([])).toBeNull();
  });
  it("restricts to the given cells", () => {
    const a = walk("a", "A", "EGFR", [["7", 1, 2]], { x: 100, y: 1 });
    const b = walk("b", "B", "MYCN", [["2", 1, 2]], { y: 50 });
    expect(dominantWalk([a, b], ["y"]).id).toBe("b");
  });
});

describe("dominantGroupIndex", () => {
  it("returns the group with the most copies", () => {
    expect(dominantGroupIndex([{ cn: [10, 10] }, { cn: [5, 50, 0.5] }])).toBe(1);
    expect(dominantGroupIndex([])).toBe(-1);
  });
});

describe("variantGrouping (BWH70 long / short EGFR)", () => {
  const ws = [
    walk("36", "wEGFR", "EGFR", [["7", 50941717, 56444541]], {}),
    walk("8", "sEGFR", "EGFR", [["7", 54610416, 56092066]], {}),
    walk("7", "MAP3K1", "MAP3K1", [["5", 53276983, 67117321]], {}),
    walk("7358", "wEGFR_var3", "EGFR", [["7", 54445232, 55530801]], {}),
    walk("13517", "wEGFR_var1", "EGFR", [["7", 50941717, 51490751], ["7", 53878929, 56444541]], {}),
    walk("2029", "shorter_sEGFR", "EGFR", [["7", 54795704, 55426102]], {}),
    walk("177", "recombine2", [], [["7", 55326787, 56092066], ["7", 54610416, 54626527]], {}),
    walk("181", "recombine5", "EGFR", [["5", 57602440, 57757361], ["7", 54988475, 55326767]], {}),
  ];
  const { nameOf, groupOf, groups } = variantGrouping("BWH70", ws);
  it("renames the anchors", () => {
    expect(nameOf(ws[0])).toBe("long EGFR");
    expect(nameOf(ws[1])).toBe("short EGFR");
    expect(nameOf(ws[3])).toBe("wEGFR_var3");
  });
  it("classifies variants by containment in the anchors' spans", () => {
    expect(groupOf.get("7358")).toBe("long EGFR"); // starts before sEGFR
    expect(groupOf.get("13517")).toBe("long EGFR");
    expect(groupOf.get("2029")).toBe("short EGFR");
    expect(groupOf.get("177")).toBe("short EGFR");
    expect(groupOf.get("181")).toBe("short EGFR"); // its chr7 part lies inside sEGFR
    expect(groupOf.has("7")).toBe(false);
    expect(groups.map((g) => g.walks.length)).toEqual([3, 4]);
  });
  it("is empty for other patients", () => {
    const g = variantGrouping("MGH303", ws);
    expect(g.groups).toEqual([]);
    expect(g.nameOf(ws[0])).toBe("wEGFR");
  });
});

describe("mainAmplicons", () => {
  const ids = Array.from({ length: 100 }, (_, i) => `c${i}`);
  const some = (n, cn) => Object.fromEntries(ids.slice(0, n).map((id) => [id, cn]));
  const ws = [
    walk("m1", "MYCN 1", "MYCN", [["2", 15.8e6, 16.6e6]], some(90, 70)),
    walk("m2", "MYCN 2", "MYCN", [["2", 15.8e6, 16.1e6]], some(50, 20)),
    walk("e1", "EGFR 1", "EGFR", [["7", 54.6e6, 55.3e6]], some(90, 45)),
    walk("k1", "CDK4 1", "CDK4", [["12", 57.2e6, 58.1e6]], some(80, 25)),
    walk("x", "CDK4+EGFR", ["CDK4", "EGFR"], [["7", 55e6, 55.1e6], ["12", 57.5e6, 57.6e6]], some(10, 20)),
    walk("low", "PDGFRA 1", "PDGFRA", [["4", 54e6, 55e6]], some(40, 4)),
    walk("o", "Other 1", [], [["2", 1, 2]], some(100, 300)),
  ];
  const all = mainAmplicons(ws, ids);
  const amps = all.filter((a) => a.main);
  it("keeps driver groups carried by >= 15% of tumor cells at median >= 8 copies, dominant first", () => {
    expect(amps.map((a) => a.key)).toEqual(["MYCN", "EGFR", "CDK4"]);
    expect(amps[0].dominant.id).toBe("m1");
    expect(amps[0].walks.map((w) => w.id)).toEqual(["m1", "m2"]);
    expect(amps[0].frac).toBeCloseTo(0.9);
    // minor ones are listed after, not main
    expect(all.slice(3).map((a) => [a.key, a.main])).toEqual([["CDK4+EGFR", false], ["PDGFRA", false]]);
  });
  it("pads the dominant walk's span", () => {
    const [chr, a, b] = amps[0].windows[0];
    expect(chr).toBe("2");
    expect(a).toBeLessThan(15.8e6);
    expect(b).toBeGreaterThan(16.6e6);
  });
  it("merges overlapping windows in order", () => {
    const w = ampliconWindows([
      { key: "CDK4", windows: [["12", 57e6, 58e6]] },
      { key: "MDM2", windows: [["12", 68e6, 70e6]] },
      { key: "CDK4+MDM2", windows: [["12", 57.5e6, 69e6]] },
    ]);
    expect(w).toEqual([["12", 57e6, 70e6, ["CDK4", "CDK4+MDM2", "MDM2"]]]);
  });
});
