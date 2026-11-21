import { defaultHicLayout, hicLayoutFromSpec, hicLayoutToSpec, loadHicLayout, moveTrack, normalizeOrder, orderFor, saveHicLayout, setUnitOrder } from "./pairedLayout";
import { buildSpec, specFilesFromListing, specsDirOf, unitsFromCells, validateSpec } from "./trackSpec";

describe("paired Hi-C layout", () => {
  it("normalizes and moves tracks", () => {
    expect(normalizeOrder(["graph", "x", "graph"])).toEqual(["graph", "hic", "coverage", "junctions"]);
    expect(moveTrack(["hic", "graph", "coverage", "junctions"], "graph", -1)).toEqual(["graph", "hic", "coverage", "junctions"]);
    expect(moveTrack(["hic", "graph", "coverage", "junctions"], "hic", -1)).toEqual(["hic", "graph", "coverage", "junctions"]);
  });

  it("uses the default order unless a unit overrides it", () => {
    let uo = { default: ["graph", "hic"], per_unit: {} };
    expect(orderFor(uo, "U1").slice(0, 2)).toEqual(["graph", "hic"]);
    uo = setUnitOrder(uo, "U1", ["junctions", "hic"]);
    expect(orderFor(uo, "U1")[0]).toBe("junctions");
    expect(orderFor(uo, "U2")[0]).toBe("graph");
    expect(orderFor(setUnitOrder(uo, "U1", null), "U1")[0]).toBe("graph");
  });

  it("round-trips through spec v0.5 layout and JSON; v0.4 layouts give defaults", () => {
    const st = { hicMode: "paired", unitOrder: setUnitOrder({ default: ["graph", "hic", "coverage", "junctions"] }, "U2", ["coverage"]), groupBy: "none", interleave: true };
    const spec = buildSpec({ patient: "P", windows: [{ chrom: "7", start: 1, end: 9 }], units: { kind: "cell", list: [] }, tracks: [] });
    spec.layout = { row_height: 56, ...hicLayoutToSpec(st) };
    expect(validateSpec(spec)).toEqual([]);
    const back = hicLayoutFromSpec(JSON.parse(JSON.stringify(spec)).layout);
    expect(back).toEqual(st);
    expect(hicLayoutFromSpec({ row_height: 56 })).toEqual(defaultHicLayout());
  });

  it("persists in storage and survives a throwing storage", () => {
    const mem = {};
    const storage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } };
    const st = { ...defaultHicLayout(), hicMode: "paired" };
    expect(saveHicLayout(st, storage)).toBe(true);
    expect(loadHicLayout(storage).hicMode).toBe("paired");
    const bad = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(loadHicLayout(bad)).toBeNull();
    expect(saveHicLayout(st, bad)).toBe(false);
  });

  it("lists spec presets of a report from a directory listing", () => {
    const html = '<a href="?C=N;O=D">Name</a><a href="/x/">Parent</a><a href="P1_egfr.json">a</a><a href="P1_combined_x.json">b</a><a href="P2_y.json">c</a>';
    expect(specFilesFromListing(html, "P1")).toEqual(["P1_combined_x.json", "P1_egfr.json"]);
    expect(specFilesFromListing(null, "P1")).toEqual([]);
    expect(specsDirOf("https://h/x/data/")).toBe("https://h/x/specs/");
  });

  it("groups units per sample in multi-sample reports", () => {
    const cells = [{ cell_id: "a", clone_id: "cluster 0", sample: "S1" }, { cell_id: "b", clone_id: "cluster 0", sample: "S2" }];
    const u = unitsFromCells(cells);
    expect(u.list.map((x) => x.group)).toEqual(["S1 · cluster 0", "S2 · cluster 0"]);
    expect(unitsFromCells([{ cell_id: "a", clone_id: "c1", sample: "S1" }]).list[0].group).toBe("c1");
  });
});
