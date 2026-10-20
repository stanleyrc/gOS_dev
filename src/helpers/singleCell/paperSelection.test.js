import { patientOfCell, selectCells, selectedIds, selectionGroups, selectionText } from "./paperSelection";

describe("figure cell selection", () => {
  it("replaces, adds, toggles and spans patients", () => {
    let s = selectCells(null, ["a", "b"], "P1", { label: "x" });
    expect(selectionText(s)).toBe("2 cells selected (P1)");
    s = selectCells(s, ["c"], "P2", { add: true });
    expect(selectionGroups(s)).toEqual([{ patient: "P1", ids: ["a", "b"] }, { patient: "P2", ids: ["c"] }]);
    expect(selectionText(s)).toBe("3 cells selected (2 P1, 1 P2)");
    s = selectCells(s, ["a"], "P1", { toggle: true });
    expect([...selectedIds(s)]).toEqual(["b", "c"]);
    expect(selectCells(s, ["d"], "P1").byPatient.size).toBe(1);
    expect(selectCells(selectCells(null, ["a"], "P1"), ["a"], "P1", { toggle: true })).toBeNull();
    expect(selectionText(null)).toBe("");
  });
});

describe("patients from cell ids", () => {
  it("groups cells by the patient in their id when the panel does not say", () => {
    expect(patientOfCell("BWH70_MR_1_pl1_6d")).toBe("BWH70");
    expect(patientOfCell("x")).toBeNull();
    const s = selectCells(null, ["MGH304_a_1", "MGH304_b_2", "BWH70_c_3"], null, { label: "box" });
    expect(selectionGroups(s)).toEqual([{ patient: "MGH304", ids: ["MGH304_a_1", "MGH304_b_2"] }, { patient: "BWH70", ids: ["BWH70_c_3"] }]);
  });
});
