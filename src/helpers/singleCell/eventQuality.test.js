import { cladeF1Of, clonalityOf, driverClassOf, eventQuality, spanMb, supportFields, upstreamOf } from "./eventQuality";
import { emptyFilters, filterRows, setColumnFilter } from "./eventFilters";

// a 4-leaf tree: ((a,b)n1,(c,d)n2)root, in the layout shape cladeFitScore reads
const tree = (() => {
  const leaves = ["a", "b", "c", "d"];
  const nodes = [
    { id: 0, children: [], leafIdx: [0] }, { id: 1, children: [], leafIdx: [1] }, { id: 2, children: [], leafIdx: [2] }, { id: 3, children: [], leafIdx: [3] },
  ];
  return { leaves, nodes };
})();

const fusion = { gene: "ABC::XYZ", fusion_genes: "ABC::XYZ", vartype: "Fusion", n_cells: "40", upstream_only: "False" };

describe("eventQuality", () => {
  test("clonality uses the report cut-offs", () => {
    expect(clonalityOf(0.9)).toBe("clonal");
    expect(clonalityOf(0.5)).toBe("subclonal");
    expect(clonalityOf(0.05)).toBe("rare");
    expect(clonalityOf(NaN)).toBeNull();
  });
  test("clade F1 is null without a tree", () => {
    expect(cladeF1Of({ cell_ids: "a,b" }, null)).toBeNull();
    expect(cladeF1Of({ cell_ids: "zz" }, tree)).toBeNull();
  });
  test("span only for CN events", () => {
    expect(spanMb({ start: "1000000", end: "2999999" }, "amp")).toBeCloseTo(2, 5);
    expect(spanMb({ start: "1", end: "5" }, "missense")).toBeNull();
    expect(spanMb({ start: "None", end: "5" }, "homdel")).toBeNull();
  });
  test("driver class and upstream", () => {
    expect(driverClassOf({ driver_class: "likely" })).toBe("likely");
    expect(driverClassOf({})).toBeNull();
    expect(upstreamOf(fusion)).toBe("no");
    expect(upstreamOf({ ...fusion, upstream_only: "true" })).toBe("yes");
    expect(upstreamOf({ gene: "EGFR" })).toBeNull();
  });
  test("fusion support: DNA only, both, unknown RNA", () => {
    expect(supportFields({ gene: "EGFR" }, [])).toBeNull();
    const none = supportFields(fusion, []);
    expect(none).toMatchObject({ kind: "dna", dnaCells: 40, rnaCells: 0 });
    const both = supportFields(fusion, [{ gene1: "ABC", gene2: "XYZ", n_cells: 12, reads: 300 }]);
    expect(both).toMatchObject({ kind: "both", rnaCells: 12, rnaReads: 300 });
    expect(supportFields(fusion, null)).toMatchObject({ kind: "dna", rnaCells: null, rnaReads: null });
  });
  test("new fields filter through eventFilters, missing values are excluded or (none)", () => {
    const rows = [
      { id: 1, ...eventQuality({ gene: "A", driver_class: "likely" }, "missense", { fraction: 0.9 }) },
      { id: 2, ...eventQuality({ gene: "B" }, "amp", { fraction: 0.3 }) },
      { id: 3, ...eventQuality(fusion, "fusion", { fraction: 0.05 }) },
    ];
    expect(filterRows(rows, setColumnFilter(emptyFilters(), "cat", "clonality", ["subclonal"])).map((r) => r.id)).toEqual([2]);
    expect(filterRows(rows, setColumnFilter(emptyFilters(), "cat", "driverClass", ["(none)"])).map((r) => r.id)).toEqual([2, 3]);
    expect(filterRows(rows, setColumnFilter(emptyFilters(), "num", "dnaCells", [10, null])).map((r) => r.id)).toEqual([3]);
    expect(filterRows(rows, setColumnFilter(emptyFilters(), "cat", "support", ["dna"])).map((r) => r.id)).toEqual([3]);
  });
});
