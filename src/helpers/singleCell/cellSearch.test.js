import { buildCellFacts, emptyCriteria, filterOptions, hasCriteria, lowCoverageIds, matchingCellIds, parseCellTerms, unmatchedTerms } from "./cellSearch";

const cells = Array.from({ length: 12 }, (_, i) => ({ cell_id: `P_t1_${i}`, clone_id: i < 10 ? (i % 2 ? "Clone 2" : "Clone 1") : "Normal", ...(i === 3 ? { "QC flag": "high mapd" } : { "QC flag": "pass" }) }));
const qcRows = cells.map((c, i) => ({ cell_id: c.cell_id, normal: i >= 10, het_depth_med: 5 + i }));
const facts = buildCellFacts({ cells, qcRows, cladeByCell: new Map([["P_t1_0", "CI1"], ["P_t1_1", "CI2"]]), stateByCell: new Map([["P_t1_0", "MES"], ["P_t1_2", "NPC"]]) });

describe("cellSearch", () => {
  test("parseCellTerms splits on commas, whitespace and newlines, dedupes", () => {
    expect(parseCellTerms("A, b\nc;; a  ")).toEqual(["a", "b", "c"]);
    expect(parseCellTerms("")).toEqual([]);
  });
  test("no criteria selects nothing", () => {
    expect(hasCriteria(emptyCriteria())).toBe(false);
    expect(matchingCellIds(facts, emptyCriteria())).toEqual([]);
  });
  test("name list matches substrings of any term", () => {
    expect(matchingCellIds(facts, { ...emptyCriteria(), text: "t1_3 t1_11" })).toEqual(["P_t1_3", "P_t1_11"]);
  });
  test("well labels are searched too", () => {
    expect(matchingCellIds(facts, { ...emptyCriteria(), text: "a07" }, { P_t1_5: "A07" })).toEqual(["P_t1_5"]);
  });
  test("tumor / normal", () => {
    expect(matchingCellIds(facts, { ...emptyCriteria(), tn: ["normal"] })).toEqual(["P_t1_10", "P_t1_11"]);
    expect(matchingCellIds(facts, { ...emptyCriteria(), tn: ["tumor"] })).toHaveLength(10);
  });
  test("flagged and passing", () => {
    expect(matchingCellIds(facts, { ...emptyCriteria(), qc: ["flagged"] })).toEqual(["P_t1_3"]);
    expect(matchingCellIds(facts, { ...emptyCriteria(), qc: ["pass"] })).toHaveLength(11);
  });
  test("low coverage ranks tumor cells only", () => {
    const ids = matchingCellIds(facts, { ...emptyCriteria(), qc: ["low_coverage"] });
    expect(ids).toEqual(["P_t1_0"]);
  });
  test("groups AND together, values within a group OR", () => {
    expect(matchingCellIds(facts, { ...emptyCriteria(), clades: ["CI1", "CI2"] })).toEqual(["P_t1_0", "P_t1_1"]);
    expect(matchingCellIds(facts, { ...emptyCriteria(), clades: ["CI1", "CI2"], states: ["MES"] })).toEqual(["P_t1_0"]);
    expect(matchingCellIds(facts, { ...emptyCriteria(), clones: ["Clone 2"], tn: ["tumor"] })).toHaveLength(5);
  });
  test("filterOptions lists only occurring values", () => {
    expect(filterOptions(facts)).toEqual({ clades: ["CI1", "CI2"], states: ["MES", "NPC"], clones: ["Clone 1", "Clone 2", "Normal"] });
  });
  test("unmatchedTerms reports names with no cell", () => {
    expect(unmatchedTerms(facts, "t1_3 zzz")).toEqual(["zzz"]);
  });
  test("lowCoverageIds needs at least 5 cells", () => {
    expect(lowCoverageIds(new Map([["a", 1], ["b", 2]])).size).toBe(0);
  });
  test("cells without QC calls are neither flagged nor passing", () => {
    const f = buildCellFacts({ cells: [{ cell_id: "x", clone_id: "C" }], qcRows: [] });
    expect(f[0]).toMatchObject({ flagged: false, hasQc: false, tn: "tumor" });
  });
});
