import {
  cellKey, makeDef, matchesDef, resolveKeys, composition, dominance, contrastWarnings,
  groupsOf, withGroups, upsertGroup, deleteGroup, renameGroup, nextName,
  encodeGroups, decodeGroups, compareLink, compareFromSearch, mergeIncoming, isEmptyDef, REST,
} from "./cohortGroups";

const cells = {
  P1: [
    { rna_id: "P1_a", state: "AC-like", Phase: "G1" },
    { rna_id: "P1_b", state: "AC-like", Phase: "S" },
    { rna_id: "P1_c", state: "MES-like", Phase: "G1" },
  ],
  P2: [
    { rna_id: "P2_a", state: "AC-like", Phase: "G1" },
    { rna_id: "x9", state: "MES-like", Phase: "G2M" },
  ],
};

describe("group definition and filtering", () => {
  test("makeDef trims, dedupes and drops empty filters", () => {
    const d = makeDef({ name: "  g ", patients: ["P1", "P1"], filters: { state: ["AC-like", "AC-like"], Phase: [] }, keys: ["a", "a"] });
    expect(d).toEqual({ name: "g", patients: ["P1"], filters: { state: ["AC-like"] }, keys: ["a"] });
  });
  test("an empty definition matches nothing", () => {
    const d = makeDef({ name: "e" });
    expect(isEmptyDef(d)).toBe(true);
    expect(resolveKeys(d, cells)).toEqual([]);
  });
  test("filters are ANDed, patients restrict", () => {
    const ac = makeDef({ name: "ac", filters: { state: ["AC-like"] } });
    expect(resolveKeys(ac, cells)).toEqual([cellKey("P1", "P1_a"), cellKey("P1", "P1_b"), cellKey("P2", "P2_a")]);
    const acG1 = makeDef({ name: "x", filters: { state: ["AC-like"], Phase: ["G1"] } });
    expect(resolveKeys(acG1, cells)).toEqual([cellKey("P1", "P1_a"), cellKey("P2", "P2_a")]);
    expect(resolveKeys(makeDef({ name: "y", patients: ["P2"], filters: { state: ["AC-like"] } }), cells)).toEqual([cellKey("P2", "P2_a")]);
  });
  test("explicit keys intersect with filters and ignore other patients' ids", () => {
    const d = makeDef({ name: "k", filters: { state: ["MES-like"] }, keys: [cellKey("P1", "P1_a"), cellKey("P1", "P1_c"), cellKey("P2", "x9")] });
    expect(resolveKeys(d, cells)).toEqual([cellKey("P1", "P1_c"), cellKey("P2", "x9")]);
    expect(matchesDef(d, "P2", { rna_id: "P1_c", state: "MES-like" })).toBe(false);
  });
});

describe("patient confounding", () => {
  const keys = (p, n) => Array.from({ length: n }, (_, i) => cellKey(p, `${p}_${i}`));
  test("composition counts patients", () => {
    expect(composition([...keys("A", 3), ...keys("B", 1)])).toEqual([{ patient: "A", n: 3 }, { patient: "B", n: 1 }]);
  });
  test("warns at 80 percent from one patient, not below", () => {
    expect(dominance([...keys("A", 8), ...keys("B", 2)]).warn).toBe(true);
    expect(dominance([...keys("A", 7), ...keys("B", 3)]).warn).toBe(false);
    expect(dominance([]).warn).toBe(false);
    expect(dominance(keys("A", 5))).toMatchObject({ warn: true, single: true, dominant: "A" });
  });
  test("contrast warns when each group is one patient and the patients differ", () => {
    const r = contrastWarnings(keys("A", 10), keys("B", 10));
    expect(r.warnings.map((w) => w.kind)).toEqual(["dominated", "dominated", "disjoint"]);
    expect(r.shared).toEqual([]);
  });
  test("a balanced contrast over shared patients has no warning", () => {
    const r = contrastWarnings([...keys("A", 5), ...keys("B", 5)], [...keys("A", 6), ...keys("B", 4)]);
    expect(r.warnings).toEqual([]);
    expect(r.shared.sort()).toEqual(["A", "B"]);
  });
});

describe("persistence helpers", () => {
  const g = (name) => makeDef({ name, patients: ["P1"] });
  test("per dataset storage", () => {
    const all = withGroups({}, 7, [g("a")]);
    expect(groupsOf(all, 7).map((x) => x.name)).toEqual(["a"]);
    expect(groupsOf(all, 8)).toEqual([]);
    expect(groupsOf(null, 7)).toEqual([]);
  });
  test("upsert replaces by name and keeps order", () => {
    const list = upsertGroup(upsertGroup([], g("a")), g("b"));
    const next = upsertGroup(list, makeDef({ name: "a", patients: ["P2"] }));
    expect(next.map((x) => x.name)).toEqual(["a", "b"]);
    expect(next[0].patients).toEqual(["P2"]);
    expect(upsertGroup(list, g("  "))).toBe(list);
  });
  test("rename refuses clashes and blanks; delete removes", () => {
    const list = [g("a"), g("b")];
    expect(renameGroup(list, "a", "b")).toBe(list);
    expect(renameGroup(list, "a", " ")).toBe(list);
    expect(renameGroup(list, "a", "c").map((x) => x.name)).toEqual(["c", "b"]);
    expect(deleteGroup(list, "a").map((x) => x.name)).toEqual(["b"]);
  });
  test("nextName skips used names", () => {
    expect(nextName([g("Group 2")])).toBe("Group 3");
    expect(nextName([])).toBe("Group 1");
  });
  test("mergeIncoming: URL wins on same name", () => {
    const merged = mergeIncoming([g("a"), g("b")], [makeDef({ name: "a", patients: ["P9"] })]);
    expect(merged.map((x) => x.name)).toEqual(["b", "a"]);
    expect(merged[1].patients).toEqual(["P9"]);
  });
});

describe("URL round trip", () => {
  const defs = [
    makeDef({ name: "AC across", filters: { state: ["AC-like"], Cell_Type: ["Malignant"] } }),
    makeDef({ name: "boxed é", patients: ["P1"], keys: [cellKey("P1", "P1_a"), cellKey("P1", "odd"), cellKey("P2", "P2_z")] }),
  ];
  test("encode and decode", () => {
    const back = decodeGroups(encodeGroups(defs));
    expect(back).toEqual(defs.map((d) => ({ ...d, keys: [...d.keys].sort((a, b) => a.localeCompare(b)) })).map((d, i) => ({ ...d, keys: back[i].keys })));
    expect(new Set(back[1].keys)).toEqual(new Set(defs[1].keys));
    expect(back[0].filters).toEqual(defs[0].filters);
  });
  test("bad input gives null", () => {
    expect(decodeGroups("%%%")).toBeNull();
    expect(decodeGroups(null)).toBeNull();
  });
  test("compare link carries only the compared groups and parses back", () => {
    const href = compareLink("https://x.org/app/?dataset=gbm-sc&scview=rna", defs, "AC across", REST);
    expect(href).toContain("dataset=gbm-sc");
    expect(new URL(href).searchParams.get("scview")).toBe("rna");
    const parsed = compareFromSearch(new URL(href).search);
    expect(parsed.a).toBe("AC across");
    expect(parsed.b).toBe(REST);
    expect(parsed.groups.map((g) => g.name)).toEqual(["AC across"]);
    expect(compareFromSearch("?dataset=gbm-sc")).toBeNull();
  });
});
