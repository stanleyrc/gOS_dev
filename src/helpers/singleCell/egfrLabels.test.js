import { displayLabel } from "./egfrLabels";

describe("displayLabel", () => {
  test("maps long and short EGFR walks and variants", () => {
    expect(displayLabel("wEGFR")).toBe("long EGFR");
    expect(displayLabel("sEGFR")).toBe("short EGFR");
    expect(displayLabel("wEGFR_var1")).toBe("long EGFR var1");
    expect(displayLabel("wEGFR_var3")).toBe("long EGFR var3");
  });
  test("maps inside free text, leaves other names alone", () => {
    expect(displayLabel("ecDNA copies: wEGFR")).toBe("ecDNA copies: long EGFR");
    expect(displayLabel("wEGFR · segment 1/4")).toBe("long EGFR · segment 1/4");
    expect(displayLabel("shorter_sEGFR")).toBe("shorter_sEGFR");
    expect(displayLabel("EGFR")).toBe("EGFR");
    expect(displayLabel("MYCN 1")).toBe("MYCN 1");
    expect(displayLabel(7)).toBe(7);
    expect(displayLabel(null)).toBe(null);
  });
});

describe("fieldLabel with EGFR covariates", () => {
  test("covariate names read long/short EGFR", () => {
    const { fieldLabel } = require("./fieldLabels");
    expect(fieldLabel("ecDNA copies: wEGFR")).toBe("ecDNA copies: long EGFR");
    expect(fieldLabel("wEGFR_Species_Clone")).toBe("Long EGFR species clone");
  });
});

describe("namedGroupLabels", () => {
  const { namedGroupLabels } = require("./clades");
  // leaves a b c d e; node 0 root (0-4), node 1 (0-1), node 2 (2-4), node 3 (3-4)
  const layout = {
    leaves: ["a", "b", "c", "d", "e"],
    nodes: [
      { isLeaf: false, firstLeaf: 0, lastLeaf: 4 }, { isLeaf: false, firstLeaf: 0, lastLeaf: 1 },
      { isLeaf: false, firstLeaf: 2, lastLeaf: 4 }, { isLeaf: false, firstLeaf: 3, lastLeaf: 4 },
    ],
  };
  test("labels an exact clade, skips a non-clade group", () => {
    const m = namedGroupLabels(layout, [{ name: "EC1", cells: ["d", "e"] }, { name: "CI", cells: ["a", "c"] }, { name: "X", cells: ["a", "zz"] }]);
    expect([...m.keys()]).toEqual([3]);
    expect(m.get(3).label).toBe("EC1 (2)");
  });
});

describe("walkName / walkTip", () => {
  const { walkName, walkTip } = require("./egfrLabels");
  const peel = { label: "EGFR,SEC61G w00038 (1 cells)", curated_match: { label: "wEGFR_var2" } };
  test("auto label with curated match shows the curated name, tooltip keeps the auto id", () => {
    expect(walkName(peel)).toBe("long EGFR var2");
    expect(walkTip(peel)).toBe("long EGFR var2 (EGFR,SEC61G w00038 (1 cells))");
  });
  test("no match or curated walk is unchanged", () => {
    expect(walkName({ label: "Other w00004 (1 cells)", curated_match: { status: "new" } })).toBe("Other w00004 (1 cells)");
    expect(walkName({ label: "wEGFR" })).toBe("long EGFR");
    expect(walkTip({ label: "sEGFR" })).toBe("short EGFR");
  });
});
