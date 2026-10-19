import { walkLaneHeaderTip, walkLaneSummary } from "./walkLaneText";

describe("walkLaneText", () => {
  test("summary gives the denominator when known", () => {
    expect(walkLaneSummary(128, 31.4, 148)).toBe("128 of 148 cells (86%) carry it · median 31 copies per carrier");
  });
  test("summary without denominator", () => {
    expect(walkLaneSummary(4, 53, 0)).toBe("4 cells carry it · median 53 copies per carrier");
  });
  test("header tips", () => {
    expect(walkLaneHeaderTip("cells", 1200)).toContain("out of 1,200 cells");
    expect(walkLaneHeaderTip("cells")).not.toContain("out of");
    expect(walkLaneHeaderTip("copies")).toContain("carrier");
    expect(walkLaneHeaderTip("x")).toBe("");
  });
});
