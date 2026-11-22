import {
  HIC_PUBLIC_VERSION, binAtX, binsToWindow, cnNeutralBySample, relCnRgb, xOfBin, cellRowOrder, cnBinsOf, hicDataVersion, decodeCellsCn, hasMatchGroups, hicUnitList, hicWindowsFromView, mapLabel, orderUnits, reportHasHic, sampleColors,
  unitFolderOf, unitsForSelection, validateCellsCn, validateUnits,
} from "./hicUnits";
import { clearUnitSources, registerUnitSources, resolveUnitFolder } from "./unitSource";
import { resolveUrl } from "./trackBrowser/trackSpec";

// synthetic records (not real data)
const CELLS = [
  { cell_id: "X_c1", pair: "X_c1", has_hic: true, sample: "S1", clone_id: "cluster 1", n_cells: 10 },
  { cell_id: "X_c0", pair: "X_c0", has_hic: true, sample: "S1", clone_id: "cluster 0", n_cells: 20 },
  { cell_id: "Y_c0", pair: "Y_c0", has_hic: true, sample: "S2", clone_id: "cluster 0", n_cells: 30 },
];
const COMBINED = CELLS.map((c) => ({ ...c, cell_id: `Zc_${c.pair}`, pair: `Zc_${c.pair}`, source_unit: c.pair, patient_id: "Z" }));

function cnFile(cells, nbins, vals) {
  const buf = Buffer.alloc(2 * vals.length);
  vals.forEach((v, i) => buf.writeUInt16LE(v, 2 * i));
  return { format: "gos-hic-cellcn/1", bin_size: 1000000, chroms: [{ name: "7", start_bin: 0, nbins }], cells, scale: 100, values: buf.toString("base64") };
}

describe("Hi-C units of a report", () => {
  afterEach(() => clearUnitSources());

  it("gates on has_hic (cohort datasets have none)", () => {
    expect(reportHasHic(CELLS)).toBe(true);
    expect(reportHasHic([{ cell_id: "BWH70_1", clone_id: "A" }])).toBe(false);
    expect(reportHasHic([])).toBe(false);
  });

  it("builds units from records or units.json and orders them by sample", () => {
    const u = hicUnitList(CELLS);
    expect(u.map((x) => x.id)).toEqual(["X_c1", "X_c0", "Y_c0"]);
    expect(orderUnits(u)).toEqual(["X_c0", "X_c1", "Y_c0"]);
    expect(orderUnits(u, { groupBy: "none" })).toEqual(["X_c1", "X_c0", "Y_c0"]);
    const uj = { format: "gos-hic-units/1", units: [{ unit: "X_c0", match_group: "high" }, { unit: "Y_c0", match_group: "high" }, { unit: "X_c1", match_group: "low", has_eaglec: false, not_available: { eaglec: "no calls" } }] };
    expect(validateUnits(uj)).toEqual([]);
    const v = hicUnitList(CELLS, uj);
    expect(hasMatchGroups(v)).toBe(true);
    expect(v.find((x) => x.id === "X_c1").notAvailable.eaglec).toBe("no calls");
    expect(orderUnits(v, { interleave: true })).toEqual(["X_c0", "Y_c0", "X_c1"]);
    expect(hasMatchGroups(u)).toBe(false);
    expect(orderUnits(u, { interleave: true })).toEqual(["X_c0", "X_c1", "Y_c0"]);
    expect(Object.keys(sampleColors(u))).toEqual(["S1", "S2"]);
  });

  it("combined report units resolve files through source_unit", () => {
    expect(unitFolderOf(COMBINED[0])).toBe("X_c1");
    const uj = { format: "gos-hic-units/1", units: [{ unit: "Zc_X_c0", source_unit: "X_c0" }, { unit: "Y_c0", source_unit: "Y_c0" }] };
    expect(hicUnitList(COMBINED, uj).map((x) => [x.id, x.folder])).toEqual([["Zc_X_c0", "X_c0"], ["Zc_Y_c0", "Y_c0"]]);
    registerUnitSources(COMBINED);
    expect(resolveUnitFolder("Zc_X_c0")).toBe("X_c0");
    expect(resolveUnitFolder("X_c0")).toBe("X_c0");
    expect(resolveUrl("{dataPath}{unit}/hic/eaglec.json", { dataPath: "d/", unit: "Zc_Y_c0" })).toBe("d/Y_c0/hic/eaglec.json");
  });

  it("decodes per-cell CN and maps a selected cell to its cluster", () => {
    const f = cnFile([{ id: "a", unit: "Y_c0" }, { id: "b", unit: "X_c0" }], 3, [200, 400, 65535, 100, 200, 300]);
    expect(validateCellsCn(f)).toEqual([]);
    expect(validateCellsCn({})).not.toEqual([]);
    const cn = decodeCellsCn(f);
    expect(cn.nBins).toBe(3);
    expect(cn.values[1]).toBe(4);
    expect(Number.isNaN(cn.values[2])).toBe(true);
    expect(cnBinsOf(cn, { chrom: "chr7", start: 1500000, end: 2500000 })).toEqual([1, 2]);
    expect(cnBinsOf(cn, { chrom: "9", start: 1, end: 5 })).toBeNull();
    expect(cellRowOrder(cn, ["X_c0", "Y_c0"])).toEqual([1, 0]);
    const units = hicUnitList(CELLS);
    expect(unitsForSelection(["a"], units, cn.cells)).toEqual(["Y_c0"]);
    expect(unitsForSelection(["X_c1", "Y_c0"], units)).toEqual(["X_c1", "Y_c0"]);
    expect(unitsForSelection(["nope"], units)).toEqual([]);
    expect(mapLabel(units[2], true)).toMatch(/cluster pseudobulk \(30 cells\); per-cell contact maps are not exported/);
  });

  it("gives a data-version note from units.json / unit records, else the fixed note", () => {
    expect(hicDataVersion(null, hicUnitList(CELLS))).toBe(HIC_PUBLIC_VERSION);
    expect(hicDataVersion({ graph_version: "v9", junction_source: "both" })).toBe("v9 · junctions: both");
    expect(hicDataVersion(null, hicUnitList([{ ...CELLS[0], graph_version: "v8", coverage_normalization: "pon" }]))).toBe("v8 · coverage: pon");
  });

  it("lays the per-cell heat map out genome-wide with a data-derived neutral level", () => {
    const f = { ...cnFile([{ id: "a", unit: "X_c0", sample: "S1" }, { id: "b", unit: "X_c0", sample: "S1" }], 4, [260, 260, 520, 130, 260, 260, 260, 65535]), chroms: [{ name: "7", start_bin: 0, nbins: 2 }, { name: "8", start_bin: 2, nbins: 2 }] };
    const cn = decodeCellsCn(f);
    expect(cnNeutralBySample(cn).S1).toBeCloseTo(2.6);
    expect(relCnRgb(2.6, 2.6)).toEqual([255, 255, 255]);
    expect(relCnRgb(10.4, 2.6)[1]).toBe(40);
    expect(relCnRgb(1.3, 2.6)[2]).toBe(255);
    expect(relCnRgb(2.9, 2.6)).toEqual([255, 255, 255]);
    expect(relCnRgb(0.65, 2.6)[0]).toBe(65);
    expect(binAtX(cn, 0, 400)).toBe(0);
    expect(binAtX(cn, 399, 400)).toBe(3);
    expect(xOfBin(cn, 2, 400)).toBe(200);
    expect(binsToWindow(cn, 1, 3)).toEqual({ chrom: "7", start: 1000001, end: 2000000 });
    expect(binsToWindow(cn, 3, 2)).toEqual({ chrom: "8", start: 1, end: 2000000 });
  });

  it("uses the genome view region only when narrow enough", () => {
    expect(hicWindowsFromView([{ chrom: "7", start: 1, end: 2e6 }]).windows).toHaveLength(1);
    expect(hicWindowsFromView([{ chrom: "1", start: 1, end: 248e6 }]).windows).toBeNull();
    expect(hicWindowsFromView([]).reason).toMatch(/no region/);
  });
});
