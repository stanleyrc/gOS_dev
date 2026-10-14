import { filterTrunks, splitDrivers, cladeGroupName, cladeNodeLabels, cladeScatterPoints, cohortCladeRows, sortCladeRows, withCladeGroup } from "./clades";

const layout = {
  leaves: ["a", "b", "c", "d", "e"],
  nodes: [
    { isLeaf: false, firstLeaf: 0, lastLeaf: 4, parent: -1 },
    { isLeaf: false, firstLeaf: 0, lastLeaf: 2, parent: 0 },
    { isLeaf: false, firstLeaf: 3, lastLeaf: 4, parent: 0 },
  ],
};
const rows = cohortCladeRows({
  rows: [
    { patient: "P1", clade: "P1_n7", n_cells: 3, n_private_snv: 12, burden: 2.5, top_signature: "SBS1", cells: ["a", "b", "c"] },
    { patient: "P2", clade: "P2_n9", n_cells: "9", n_private_snv: null, burden: null, cells: ["d", "e"] },
    { clade: "bad" },
  ],
});

test("cohortCladeRows normalises and drops bad rows", () => {
  expect(rows).toHaveLength(2);
  expect(rows[1].n_cells).toBe(9);
  expect(rows[1].burden).toBeNull();
});

test("sortCladeRows puts nulls last both ways", () => {
  expect(sortCladeRows(rows, "burden", "desc").map((r) => r.clade)).toEqual(["P1_n7", "P2_n9"]);
  expect(sortCladeRows(rows, "burden", "asc").map((r) => r.clade)).toEqual(["P1_n7", "P2_n9"]);
  expect(sortCladeRows(rows, "patient", "asc")[0].patient).toBe("P1");
});

test("scatter points need a burden and carry the signature in the tooltip", () => {
  const pts = cladeScatterPoints(rows);
  expect(pts).toHaveLength(1);
  expect(pts[0].tip).toMatch(/SBS1/);
});

test("cladeNodeLabels picks the smallest enclosing node", () => {
  const m = cladeNodeLabels(layout, rows);
  expect(m.get(1).label).toBe("12 SNV");
  expect(m.get(2).label).toBe("9c");
});

test("withCladeGroup replaces an earlier copy", () => {
  const g = withCladeGroup([{ name: cladeGroupName("P1_n7"), cells: ["x"] }, { name: "other", cells: [] }], rows[0]);
  expect(g).toHaveLength(2);
  expect(g.find((x) => x.name === "clade P1_n7").cells).toEqual(["a", "b", "c"]);
});

test("filterTrunks hides trunks by default and splitDrivers caps at three", () => {
  const r = [{ clade: "a", is_trunk: true }, { clade: "b", is_trunk: false }];
  expect(filterTrunks(r, false).map((x) => x.clade)).toEqual(["b"]);
  expect(filterTrunks(r, true)).toHaveLength(2);
  const d = splitDrivers("A; B; C; D; E");
  expect(d.shown).toEqual(["A", "B", "C"]);
  expect(d.rest).toEqual(["D", "E"]);
  expect(splitDrivers("").shown).toEqual([]);
});
