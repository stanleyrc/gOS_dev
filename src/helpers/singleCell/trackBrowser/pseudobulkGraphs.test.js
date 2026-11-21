import { PSEUDOBULK_GRAPH_URL, graphsByGroup, manifestLoci, normalizePseudobulkGraphs } from "./pseudobulkGraphs";

describe("exported pseudobulk graphs", () => {
  test("normalize: recommended first per manifest order, defaults, bad entries dropped", () => {
    const m = {
      pseudobulk_graphs: [
        { id: "c1_all_alt", group: "c1", role: "alternate ploidy (~6.2, not favored)", ploidy: 6.1, n_cells: 66 },
        { id: "c1_nonS", group: "c1", role: "recommended", ploidy: "3.17", n_cells: 29, purity: 5 },
        { group: "c2" },
        { id: "c1_all", group: "c1", role: "alternate (S cells included)" },
      ],
    };
    const out = normalizePseudobulkGraphs(m);
    expect(out.map((e) => e.id)).toEqual(["c1_nonS", "c1_all", "c1_all_alt"]);
    expect(out[0]).toMatchObject({ ploidy: 3.17, purity: 1, n_cells: 29, url: PSEUDOBULK_GRAPH_URL });
    expect(out[1].ploidy).toBeNull();
    expect(normalizePseudobulkGraphs(null)).toEqual([]);
    expect(normalizePseudobulkGraphs([{ id: 7 }])[0].id).toBe("7");
  });
  test("loci presets and grouping", () => {
    expect(manifestLoci({ loci: [{ label: "chr4 amp", locus: "chr4:10,000,000-50,000,000" }, { label: "bad" }] })).toEqual([{ label: "chr4 amp", locus: "chr4:10,000,000-50,000,000" }]);
    expect(manifestLoci({})).toEqual([]);
    const g = graphsByGroup([{ id: "a", group: "c1" }, { id: "b", group: "c2" }, { id: "c", group: "c1" }]);
    expect(g.get("c1").map((e) => e.id)).toEqual(["a", "c"]);
  });
});
