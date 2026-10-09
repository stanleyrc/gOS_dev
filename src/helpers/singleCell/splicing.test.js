import patientFixture from "./__fixtures__/rnaSplicing.json";
import cohortFixture from "./__fixtures__/cohortSplicing.json";
import {
  NA_GROUP,
  RNA_ONLY_GROUP,
  arcLayout,
  cellUsageMatrix,
  clusterByGroup,
  cohortClusterRows,
  cohortPsiMatrix,
  filterClusters,
  maxDeltaPsi,
  normalizeSplicing,
  psi,
  rnaGrouping,
  rnaRowsInTreeOrder,
  variantByGroup,
  variantSummary,
} from "./splicing";

const data = normalizeSplicing(patientFixture);
const cellOf = new Map(Object.entries(data.cellMap).filter(([, c]) => c));
const rnaCells = [
  { rna_id: "r1", cell_id: "c1", state: "MES" },
  { rna_id: "r2", cell_id: "c3", state: "NPC" },
  { rna_id: "r3", cell_id: "c2", state: "MES" },
  { rna_id: "r9", cell_id: null, state: "" },
];
const cloneOf = new Map([["c1", "1"], ["c2", "2"], ["c3", "1"]]);

describe("psi", () => {
  it("normalises counts and gives NaN without reads", () => {
    expect(psi([1, 3])).toEqual([0.25, 0.75]);
    expect(psi([0, 0]).every(Number.isNaN)).toBe(true);
  });
});

describe("grouping", () => {
  it("groups by DNA clone with RNA-only cells apart", () => {
    const g = rnaGrouping("clone", rnaCells, cloneOf, cellOf);
    expect(["r1", "r2", "r3", "r9"].map(g)).toEqual(["1", "1", "2", RNA_ONLY_GROUP]);
  });
  it("groups by a cells.json field", () => {
    const g = rnaGrouping("state", rnaCells, cloneOf, cellOf);
    expect(["r1", "r2", "r9", "rX"].map(g)).toEqual(["MES", "NPC", NA_GROUP, NA_GROUP]);
  });
});

describe("cluster PSI by group", () => {
  it("pools counts per group", () => {
    const rows = clusterByGroup(data.clusters[0], rnaGrouping("clone", rnaCells, cloneOf, cellOf));
    expect(rows.map((r) => r.group)).toEqual(["1", "2", RNA_ONLY_GROUP]);
    expect(rows[0]).toMatchObject({ counts: [3, 5, 0], total: 8, nCells: 2 });
    expect(rows[0].psi).toEqual([0.375, 0.625, 0]);
    expect(rows[1].psi).toEqual([0.25, 0.25, 0.5]);
    expect(rows[2].total).toBe(0);
    expect(rows[2].nCells).toBe(0);
    expect(maxDeltaPsi(rows)).toBeCloseTo(0.5);
  });
  it("summarises known variants per group", () => {
    const rows = variantByGroup(data.variants[0], rnaGrouping("state", rnaCells, cloneOf, cellOf));
    expect(rows.find((r) => r.group === "MES")).toMatchObject({ alt: 6, ref: 3, nAlt: 2, nCells: 2 });
    expect(rows.find((r) => r.group === "MES").frac).toBeCloseTo(6 / 9);
    expect(variantSummary(data.variants[0])).toMatchObject({ alt: 7, ref: 6, nAlt: 3, nCells: 4 });
  });
});

describe("cells in tree order", () => {
  it("orders RNA cells by their DNA cell and appends RNA-only", () => {
    const { rows, nTree } = rnaRowsInTreeOrder(["c3", "c9", "c1", "c2"], ["r1", "r2", "r3", "r9"], cellOf);
    expect(rows.map((r) => r.rna_id)).toEqual(["r2", "r1", "r3", "r9"]);
    expect(nTree).toBe(3);
    const m = cellUsageMatrix(data.clusters[0], rows);
    expect(m.nJ).toBe(3);
    expect(Array.from(m.psi.slice(0, 3))).toEqual([0, 1, 0]);
    expect(m.totals[3]).toBe(0);
    expect(Number.isNaN(m.psi[9])).toBe(true);
  });
});

describe("cluster filtering and cohort", () => {
  it("filters by gene or id", () => {
    expect(filterClusters(data.clusters, "egf").map((c) => c.id)).toEqual(["clu_1"]);
    expect(filterClusters(data.clusters, "CLU_2").map((c) => c.id)).toEqual(["clu_2"]);
    expect(filterClusters(data.clusters, "").length).toBe(2);
  });
  it("ranks cohort clusters and counts patients with reads", () => {
    const rows = cohortClusterRows(cohortFixture);
    expect(rows.map((r) => r.id)).toEqual(["clu_1", "clu_9"]);
    expect(rows[0].nPatients).toBe(3);
    expect(rows[1].nPatients).toBe(1);
    expect(filterClusters(cohortFixture.clusters, "", { minPatients: 2 }).map((c) => c.id)).toEqual(["clu_1"]);
  });
  it("builds the junction x patient PSI matrix", () => {
    const m = cohortPsiMatrix(cohortFixture.clusters[1], cohortFixture.patients);
    expect(m.patients).toEqual(["P1", "P2", "P3"]);
    expect(m.psi[0]).toEqual([0.8, 0.25, 0]);
    expect(m.totals).toEqual([10, 4, 6]);
    const sparse = cohortPsiMatrix(cohortFixture.clusters[0], cohortFixture.patients);
    expect(sparse.patients).toEqual(["P1", "P2"]);
    expect(Number.isNaN(sparse.psi[0][1])).toBe(true);
  });
  it("lays arcs on an ordinal axis", () => {
    const { coords, arcs } = arcLayout(data.clusters[0].junctions, 0, 300);
    expect(coords).toEqual([100, 200, 250, 300]);
    expect(arcs.map((a) => [a.xa, a.xb, a.span])).toEqual([[0, 100, 1], [0, 300, 3], [200, 300, 1]]);
    expect(arcs[2].annotated).toBe(false);
  });
});
