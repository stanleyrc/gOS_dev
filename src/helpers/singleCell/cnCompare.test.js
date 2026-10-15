import { CMPHEAT_DEFAULT, cnRowsForLeaves, parseCmpHeat, serializeCmpHeat, showsCn, showsSnv } from "./cnCompare";

describe("cmpheat param", () => {
  it("parses known modes and falls back to snv", () => {
    expect(parseCmpHeat("cn")).toBe("cn");
    expect(parseCmpHeat("both")).toBe("both");
    expect(parseCmpHeat("junk")).toBe(CMPHEAT_DEFAULT);
    expect(parseCmpHeat(null)).toBe("snv");
  });
  it("leaves the default out of the URL", () => {
    expect(serializeCmpHeat("snv")).toBeNull();
    expect(serializeCmpHeat("cn")).toBe("cn");
    expect(serializeCmpHeat("both")).toBe("both");
    expect(serializeCmpHeat("x")).toBeNull();
  });
  it("says which layers a mode draws", () => {
    expect([showsSnv("snv"), showsCn("snv")]).toEqual([true, false]);
    expect([showsSnv("cn"), showsCn("cn")]).toEqual([false, true]);
    expect([showsSnv("both"), showsCn("both")]).toEqual([true, true]);
  });
});

describe("cnRowsForLeaves", () => {
  const cells = ["a", "b", "c", "d"];
  const rows = [{ v: 1 }, { v: 2 }, null, { v: 4 }];
  it("follows the leaf order of each tree", () => {
    const x = cnRowsForLeaves(["d", "a", "b"], cells, rows);
    expect(Array.from(x.map)).toEqual([3, 0, 1]);
    expect(x.missing).toBe(0);
    const y = cnRowsForLeaves(["b", "d", "a"], cells, rows);
    expect(Array.from(y.map)).toEqual([1, 3, 0]);
  });
  it("counts blank rows for cells without a profile", () => {
    const x = cnRowsForLeaves(["c", "zz", "a"], cells, rows);
    expect(Array.from(x.map)).toEqual([-1, -1, 0]);
    expect(x.missing).toBe(2);
  });
  it("handles an absent payload", () => {
    const x = cnRowsForLeaves(["a"], null, null);
    expect(Array.from(x.map)).toEqual([-1]);
    expect(x.missing).toBe(1);
  });
});
