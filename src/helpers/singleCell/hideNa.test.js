import { hideNaFromSearch, isNaValue, partitionNa, withHideNa } from "./hideNa";

describe("hide NA", () => {
  it("recognises missing values", () => {
    [null, undefined, NaN, "", "NA", " nan ", Infinity].forEach((v) => expect(isNaValue(v)).toBe(true));
    [0, "0", "Clone 1", false].forEach((v) => expect(isNaValue(v)).toBe(false));
  });
  it("reads and writes the URL flag", () => {
    expect(hideNaFromSearch("?hidena=1&tab=3")).toBe(true);
    expect(hideNaFromSearch("?hidena=0")).toBe(false);
    expect(hideNaFromSearch("?tab=3")).toBeNull();
    expect(withHideNa("?tab=3", true)).toBe("?tab=3&hidena=1");
    expect(withHideNa("?tab=3&hidena=1", false)).toBe("?tab=3");
  });
  it("partitions and counts hidden", () => {
    const pts = [{ v: 1 }, { v: NaN }, { v: null }, { v: 3 }];
    const na = (p) => isNaValue(p.v);
    expect(partitionNa(pts, na, false)).toEqual({ shown: pts, hidden: 0 });
    const r = partitionNa(pts, na, true);
    expect(r.shown).toHaveLength(2);
    expect(r.hidden).toBe(2);
  });
});
