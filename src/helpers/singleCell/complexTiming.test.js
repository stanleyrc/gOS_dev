import { parseNewick, layoutTree } from "./newick";
import { eventNodes, containmentEdges, transitiveReduction, eventOrder, placementOf, edgeText } from "./complexTiming";

const ev = (name, cells, extra = {}) => ({ type: "Complex SV", Variant: name, cell_ids: cells.join(","), Genome_Location: "1:1-2", ...extra });
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => `c${a + i}`);
// tree: clade X = c1..c10 (clade Y = c1..c5 inside), clade Z = c11..c20
const tree = layoutTree(parseNewick(`((((${range(1, 5).map((c) => `${c}:1`).join(",")}):1,(${range(6, 10).map((c) => `${c}:1`).join(",")}):1):1,(${range(11, 20).map((c) => `${c}:1`).join(",")}):1):1);`));

describe("eventNodes", () => {
  it("collapses classifier twins by twin_group and lists both names", () => {
    const events = [
      ev("TIC (6,8)", range(1, 10), { twin_group: "P:1", twin_names: ["TIC (6,8)", "rDelDup (6,8)"] }),
      ev("rDelDup (6,8)", range(1, 10), { twin_group: "P:1", twin_names: ["TIC (6,8)", "rDelDup (6,8)"] }),
      ev("DM (1)", range(1, 5)),
    ];
    const nodes = eventNodes(events, { tree });
    expect(nodes).toHaveLength(2);
    expect(nodes[0].names).toEqual(["TIC (6,8)", "rDelDup (6,8)"]);
    expect(nodes[0].n).toBe(10);
  });
  it("drops events below the minimum cells and non-complex rows", () => {
    const nodes = eventNodes([ev("tiny", range(1, 3)), { ...ev("amp", range(1, 9)), type: "Amplification" }], { tree });
    expect(nodes).toHaveLength(0);
  });
  it("calls the clade placement", () => {
    const [n] = eventNodes([ev("A", range(1, 10))], { tree, tumorIds: range(1, 20) });
    expect(n.f1).toBe(1);
    expect(n.cladeSize).toBe(10);
    expect(n.placement).toBe("subclonal");
    expect(placementOf(19, 20, null)).toBe("truncal");
    expect(placementOf(5, 20, { clade: 1 })).toBe("private");
  });
});

describe("containment and reduction", () => {
  const events = [ev("A", range(1, 20)), ev("B", range(1, 10)), ev("C", range(1, 5)), ev("D", [...range(11, 15), "x1"]), ev("E", range(1, 5).concat(["q"]))];
  const nodes = eventNodes(events, { minCells: 5 });
  const id = (name) => nodes.find((n) => n.names[0] === name).id;
  it("requires 90% of the inner carriers inside the outer and a strictly larger outer", () => {
    const edges = containmentEdges(nodes);
    const has = (a, b) => edges.some((e) => e.from === id(a) && e.to === id(b));
    expect(has("A", "B")).toBe(true);
    expect(has("B", "A")).toBe(false);
    expect(has("B", "C")).toBe(true);
    expect(has("A", "D")).toBe(false); // x1 outside: 5/6 < 0.9
    expect(has("B", "E")).toBe(false); // 5/6 < 0.9
    const ab = edges.find((e) => e.from === id("A") && e.to === id("B"));
    expect(ab).toMatchObject({ overlap: 10, inner: 10, outside: 0 });
  });
  it("does not link equal-size sets", () => {
    const eq = eventNodes([ev("P", range(1, 6)), ev("Q", range(1, 6))]);
    expect(containmentEdges(eq)).toHaveLength(0);
  });
  it("reduces A>B>C to a chain and assigns depth", () => {
    const o = eventOrder(events.slice(0, 3), {});
    expect(o.allEdges).toHaveLength(3);
    expect(o.edges).toHaveLength(2);
    expect(o.edges.some((e) => e.from === o.nodes[0].id && e.to === o.nodes[2].id)).toBe(false);
    expect(o.nodes.map((n) => n.depth)).toEqual([0, 1, 2]);
    expect(transitiveReduction([])).toEqual([]);
  });
  it("words an edge as consistent with, not proof of, an order", () => {
    const o = eventOrder(events.slice(0, 2), {});
    const byId = new Map(o.nodes.map((n) => [n.id, n]));
    expect(edgeText(o.edges[0], byId)).toMatch(/10 of 10 carriers.*Consistent with B arising after A/);
  });
});
