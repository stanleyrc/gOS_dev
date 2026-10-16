import {
  buildCellLabelMap,
  cellDisplayLabel,
  cellLabelWithId,
  cellExportNames,
  cellsTsv,
  resolveCellQuery,
  matchCells,
  getCellLabelMode,
  setCellLabelMode,
  resetCellLabelModeForTests,
} from "./cellLabels";

const records = [
  { cell_id: "XX1_10", well: "XX1_MR_1_pl1_3a" },
  { pair: "XX1_11", well: "XX1_11" },
  { cell_id: "XX1_12" },
  { cell_id: "XX1_13", well: "" },
];
const map = buildCellLabelMap(records);

describe("cell labels", () => {
  test("map keeps only wells that differ from the pair id", () => {
    expect(map).toEqual({ XX1_10: "XX1_MR_1_pl1_3a" });
    expect(buildCellLabelMap(null)).toEqual({});
  });
  test("display label follows mode and falls back to the id", () => {
    expect(cellDisplayLabel("XX1_10", map)).toBe("XX1_MR_1_pl1_3a");
    expect(cellDisplayLabel("XX1_10", map, "id")).toBe("XX1_10");
    expect(cellDisplayLabel("XX1_12", map)).toBe("XX1_12");
    expect(cellDisplayLabel(null, map)).toBeNull();
    expect(cellDisplayLabel("XX1_10", map, "bogus")).toBe("XX1_MR_1_pl1_3a");
  });
  test("tooltip label keeps the id discoverable", () => {
    expect(cellLabelWithId("XX1_10", map)).toBe("XX1_MR_1_pl1_3a (XX1_10)");
    expect(cellLabelWithId("XX1_12", map)).toBe("XX1_12");
  });
  test("export names", () => {
    expect(cellExportNames("XX1_10", map)).toEqual({ id: "XX1_10", well: "XX1_MR_1_pl1_3a" });
    expect(cellExportNames("XX1_12", map)).toEqual({ id: "XX1_12", well: "" });
  });
  test("locate box accepts the well label or the pair id", () => {
    const ids = ["XX1_10", "XX1_12", "XX1_100"];
    expect(resolveCellQuery("xx1_mr_1_pl1_3A", ids, map)).toBe("XX1_10");
    expect(resolveCellQuery("XX1_10", ids, map)).toBe("XX1_10");
    expect(resolveCellQuery("nope", ids, map)).toBeNull();
    expect(matchCells("XX1_10", ids, map)).toEqual(["XX1_10", "XX1_100"]);
    expect(matchCells("pl1_3", ids, map)).toEqual(["XX1_10"]);
    expect(matchCells("", ids, map)).toEqual([]);
  });
  test("mode persists in localStorage and survives a missing storage", () => {
    resetCellLabelModeForTests();
    window.localStorage.clear();
    expect(getCellLabelMode()).toBe("well");
    setCellLabelMode("id");
    resetCellLabelModeForTests();
    expect(getCellLabelMode()).toBe("id");
    const spy = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => setCellLabelMode("well")).not.toThrow();
    expect(getCellLabelMode()).toBe("well");
    spy.mockRestore();
    resetCellLabelModeForTests();
  });
  test("cell TSV keeps the pair id and adds a well column", () => {
    const tsv = cellsTsv([{ cell_id: "XX1_10", clone_id: "A" }, { cell_id: "XX1_12", clone_id: null }], map);
    expect(tsv).toBe("cell_id\twell\tclone\nXX1_10\tXX1_MR_1_pl1_3a\tA\nXX1_12\t\t\n");
  });
});

describe("selected-cell export", () => {
  const { selectedCellsTsv, cellExportColumns } = require("./cellLabels");
  const cells = [
    { cell_id: "P_c1", clone_id: "A", reads: 10, plate: "p1", pair: "P_c1" },
    { cell_id: "P_c2", clone_id: "B", reads: 20, plate: "p1", pair: "P_c2" },
    { cell_id: "P_c3", clone_id: "B", reads: 30, plate: "p2", pair: "P_c3" },
  ];
  test("columns are the varying scalar attributes, ids left out", () => {
    expect(cellExportColumns(cells).map(([k]) => k)).toEqual(["reads", "plate"]);
  });
  test("rows follow the selection order; unknown ids keep a bare row", () => {
    const lines = selectedCellsTsv(["P_c3", "P_c1", "P_x"], cells, { P_c1: "A1" }).replace(/\n$/, "").split("\n");
    expect(lines[0]).toBe("cell_id\twell\tclone\treads\tplate");
    expect(lines[1]).toBe("P_c3\t\tB\t30\tp2");
    expect(lines[2]).toBe("P_c1\tA1\tA\t10\tp1");
    expect(lines[3]).toBe("P_x\t\t\t\t");
  });
});
