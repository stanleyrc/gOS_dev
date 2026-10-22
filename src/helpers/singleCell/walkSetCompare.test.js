import { pairWalkSets, parseWalkset, withWalkset, peelSourceWithCopies, summarizePairs, fitText } from "./walkSetCompare";

describe("walkSetCompare", () => {
  const curated = [{ id: "a1" }, { id: "a2" }, { id: "a3" }];
  const peel = [
    { id: "n1", curated_match: null },
    { id: "p1", curated_match: { walk_id: "a2", status: "reproduces", segment_cosine: 0.99, junction_jaccard: 1, rho_free: 0.9 } },
    { id: "p2", curated_match: { walk_id: "a1", status: "partial", segment_cosine: 0.7 } },
  ];
  test("pairs by walk_id, new peel walks and unpaired curated walks get rows", () => {
    const rows = pairWalkSets(curated, peel);
    expect(rows.map((r) => r.status)).toEqual(["reproduces", "partial", "new", "unpaired"]);
    expect(rows[0].curated.id).toBe("a2");
    expect(rows[0].cosine).toBe(0.99);
    expect(rows[2].curated).toBeNull();
    expect(rows[3].peel).toBeNull();
    expect(rows[3].curated.id).toBe("a3");
    expect(summarizePairs(rows)).toEqual({ reproduces: 1, partial: 1, new: 1, unpaired: 1 });
  });
  test("a shared curated walk is flagged, a dangling walk_id is reported", () => {
    const rows = pairWalkSets([{ id: "a1" }], [{ id: "x", curated_match: { walk_id: "a1", status: "partial" } }, { id: "y", curated_match: { walk_id: "a1", status: "partial" } }, { id: "z", curated_match: { walk_id: "gone", status: "partial" } }]);
    expect(rows.filter((r) => r.curatedShared)).toHaveLength(1);
    expect(rows.find((r) => r.peel.id === "z").missingCurated).toBe(true);
    expect(rows.some((r) => r.status === "unpaired")).toBe(false);
  });
  test("url parameter", () => {
    expect(parseWalkset("?tab=14&walkset=peel_v4")).toBe("peel_v4");
    expect(parseWalkset("?walkset=bogus")).toBe("curated");
    expect(withWalkset("?tab=14", "compare")).toBe("?tab=14&walkset=compare");
    expect(withWalkset("?tab=14&walkset=compare", "curated")).toBe("?tab=14");
  });
  test("cplex copies replace cells; missing cplex gives no copies", () => {
    const src = { status: "ok", data: { walks: [{ id: "1", cells: { c: 2 }, cells_cplex: { c: 3 } }, { id: "2", cells: { c: 1 } }] } };
    const out = peelSourceWithCopies(src, "cplex");
    expect(out.data.walks[0].cells).toEqual({ c: 3 });
    expect(out.data.walks[1].cells).toEqual({});
    expect(peelSourceWithCopies(src, "free")).toBe(src);
  });
  test("fit text", () => {
    expect(fitText({ R2_free: 0.931, R2_cplex: null, R2_curated: 0.9 })).toBe("R² free 0.93 / curated 0.90");
    expect(fitText(null)).toBeNull();
  });
});
