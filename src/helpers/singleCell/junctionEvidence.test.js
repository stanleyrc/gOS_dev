import { junctionKeyOf, binCnAt, buildJunctionEvidence, evidenceSummary } from "./junctionEvidence";

const graph = (weight, extra = []) => ({
  intervals: [
    { iid: 1, chromosome: "1", startPoint: 1, endPoint: 100, y: 2 },
    { iid: 2, chromosome: "7", startPoint: 1, endPoint: 100, y: 3 },
  ],
  connections: [{ cid: 1, source: 1, sink: -2, type: "ALT", weight }, { cid: 2, source: 1, sink: 2, type: "REF", weight: 9 }, ...extra],
});

describe("junction evidence", () => {
  test("junction key sorts both breakpoints", () => {
    expect(junctionKeyOf(graph(2), graph(2).connections[0])).toBe("1:100+ | 7:1-");
    expect(binCnAt(graph(2), "7:1-")).toBe(3);
    expect(binCnAt(graph(2), "9:5+")).toBeNull();
  });
  test("matrix: carriers then non-carriers in tree order; no graph is not 0", () => {
    const graphs = new Map([
      ["c1", graph(3)],
      ["c2", graph(1)],
      ["n1", { ...graph(0), connections: [] }], // graph without the junction
      ["n2", graph(2)], // non-carrier that has it
      ["n3", null], // no graph
    ]);
    const ev = buildJunctionEvidence({ location: "1:90-100|7:1-5", carriers: ["c2", "c1"], cellIds: ["n3", "n2", "n1", "c1", "c2"], cellOrder: ["n1", "c1", "n2", "c2", "n3"], graphs });
    expect(ev.cells.map((c) => c.id)).toEqual(["c1", "c2", "n1", "n2", "n3"]);
    expect(ev.cells.map((c) => c.carrier)).toEqual([true, true, false, false, false]);
    expect(ev.rows).toHaveLength(1);
    expect(ev.rows[0].nCarriers).toBe(2);
    expect(ev.values[0].map((v) => v.state)).toEqual(["cn", "cn", "zero", "cn", "nograph"]);
    expect(ev.values[0][0].cn).toBe(3);
    expect(evidenceSummary(ev)[0]).toMatchObject({ carrierHit: 2, carrierGraph: 2, otherHit: 1, otherGraph: 2 });
  });
  test("a junction in only one carrier is not a row", () => {
    const graphs = new Map([["c1", graph(3)], ["c2", { ...graph(0), connections: [] }]]);
    expect(buildJunctionEvidence({ location: "1:90-100", carriers: ["c1", "c2"], graphs }).rows).toEqual([]);
  });
});
