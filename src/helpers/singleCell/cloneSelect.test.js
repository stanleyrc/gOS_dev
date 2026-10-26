import { effectiveHiddenClones, cloneNamesOf, toggleSelected } from "./cloneSelect";

const all = ["Clone 1", "Clone 2", "Clone 3", "Normal"];
describe("cloneSelect", () => {
  test("no selection keeps hidden as is", () => {
    expect([...effectiveHiddenClones(all, ["Normal"], [])]).toEqual(["Normal"]);
  });
  test("selection hides every other clone", () => {
    expect([...effectiveHiddenClones(all, [], ["Clone 2"])].sort()).toEqual(["Clone 1", "Clone 3", "Normal"]);
  });
  test("several selected; hidden wins over selected", () => {
    expect([...effectiveHiddenClones(all, ["Clone 3"], ["Clone 2", "Clone 3"])].sort()).toEqual(["Clone 1", "Clone 3", "Normal"]);
  });
  test("stale selection is ignored", () => {
    expect([...effectiveHiddenClones(all, [], ["Gone"])]).toEqual([]);
  });
  test("cloneNamesOf and toggleSelected", () => {
    expect(cloneNamesOf([{ clone_id: "A" }, { clone_id: "B" }, { clone_id: "A" }, {}])).toEqual(["A", "B"]);
    expect(toggleSelected(["A"], "B")).toEqual(["A", "B"]);
    expect(toggleSelected(["A", "B"], "A")).toEqual(["B"]);
  });
});
