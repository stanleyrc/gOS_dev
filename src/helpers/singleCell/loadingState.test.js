import { entryState, loadProgress, progressText, provisionalLabel, problemLines, idList, guardStat, LOAD } from "./loadingState";

const ok = { summary: { cells: [1] } };
describe("loadingState", () => {
  test("entryState separates pending, none, failed and ok", () => {
    expect(entryState(undefined)).toBe(LOAD.PENDING);
    expect(entryState({ error: new Error("x") })).toBe(LOAD.FAILED);
    expect(entryState({ missing: true })).toBe(LOAD.NONE);
    expect(entryState({ cellRows: [] }, (e) => e.cellRows.length > 0)).toBe(LOAD.NONE);
    expect(entryState(ok)).toBe(LOAD.OK);
  });

  test("partial progress counts patients and cells and names the pending ones", () => {
    const p = loadProgress(["A", "B", "C"], { cn: { entries: { A: ok, B: ok }, file: "cn" }, rna: { entries: { A: ok }, file: "rna/cells.json" } }, { A: 100, B: 50, C: 25 });
    expect(p.done).toBe(1);
    expect(p.partial).toBe(true);
    expect(p.pending).toEqual(["B", "C"]);
    expect(p.cellsDone).toBe(100);
    expect(p.cellsTotal).toBe(175);
    expect(progressText(p)).toBe("Loading 1 of 3 patients / 100 of 175 cells…");
    expect(provisionalLabel(p)).toMatch(/provisional \(partial data: 1 of 3/);
    expect(guardStat(0.5, p, true)).toBeNull();
    expect(guardStat(0.5, p, false)).toBe(0.5);
  });

  test("complete data has no provisional label; missing data is not the same as pending", () => {
    const p = loadProgress(["A", "B"], { rna: { entries: { A: ok, B: { missing: true, reason: "rna/cells.json not available (missing)" } }, file: "rna/cells.json" } });
    expect(p.complete).toBe(true);
    expect(p.partial).toBe(false);
    expect(p.usable).toBe(1);
    expect(provisionalLabel(p)).toBe("");
    expect(problemLines(p)).toEqual(["B: rna/cells.json not available (missing)"]);
    expect(progressText(p)).toBe("Loaded 2 of 2 patients");
  });

  test("failures name the file", () => {
    const p = loadProgress(["A"], { rna: { entries: { A: { error: new Error("HTTP 500"), file: "rna/matrix.bin" } } } });
    expect(problemLines(p)).toEqual(["A: rna/matrix.bin failed to load (HTTP 500)"]);
    expect(p.failed[0].source).toBe("rna");
  });

  test("idList truncates", () => {
    expect(idList(["a", "b", "c", "d", "e", "f"])).toBe("a, b, c, d and 2 more");
  });
});

describe("resultNote", () => {
  const { resultNote } = require("./loadingState");
  test("complete runs have no note; partial runs are labelled and flag a rerun", () => {
    expect(resultNote({ ranWith: 9, ranPartial: false }, 9, 9)).toBeNull();
    expect(resultNote(null, 9, 9)).toBeNull();
    const n = resultNote({ ranWith: 4, ranPartial: true }, 9, 9);
    expect(n.text).toBe("provisional (partial data: computed from 4 of 9 patients)");
    expect(n.rerun).toBe(true);
    expect(n.rerunText).toMatch(/5 more patient/);
    expect(resultNote({ ranWith: 4, ranPartial: true }, 4, 9).rerun).toBe(false);
  });
  test("skipped entries are neither pending nor problems", () => {
    const { loadProgress } = require("./loadingState");
    const p = loadProgress(["A"], { cn: { entries: { A: { missing: true, reason: "r" } } }, rna: { entries: { A: { skipped: true } } } });
    expect(p.complete).toBe(true);
    expect(p.usable).toBe(0);
    expect(p.none).toHaveLength(1);
  });
});
