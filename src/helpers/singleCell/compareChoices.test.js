import { FULL_SET, defaultSnvSet, hasTreeSupport, serializeChoice, treeQualityNote, usableSnvSets, validChoice } from "./compareChoices";

const index = [
  { name: "strict", label: "Pipeline strict (6.9k sites)", file: "snv_matrix.strict.json", n_variants: 6918 },
  { name: "mid", file: "snv_matrix.mid.json", n_variants: 20000 },
  { name: "bad" },
  { name: "strict", file: "dup.json", n_variants: 1 },
];

describe("usableSnvSets", () => {
  it("always lists the full matrix first and drops bad or duplicate entries", () => {
    const sets = usableSnvSets(index);
    expect(sets.map((s) => s.name)).toEqual([FULL_SET, "strict", "mid"]);
    expect(sets[0].file).toBe("snv_matrix.json");
    expect(sets[2].label).toBe("mid");
  });
  it("offers only the full matrix without an index", () => {
    expect(usableSnvSets(null).map((s) => s.name)).toEqual([FULL_SET]);
    expect(usableSnvSets({}).length).toBe(1);
  });
});

describe("defaultSnvSet", () => {
  it("picks the smallest listed set", () => expect(defaultSnvSet(usableSnvSets(index))).toBe("strict"));
  it("falls back to the full matrix", () => {
    expect(defaultSnvSet(usableSnvSets(null))).toBe(FULL_SET);
    expect(defaultSnvSet(usableSnvSets([{ name: "x", file: "x.json" }]))).toBe(FULL_SET);
  });
});

describe("url choices", () => {
  it("accepts only known names", () => {
    expect(validChoice("strict", ["gos", "strict"])).toBe("strict");
    expect(validChoice("nope", ["gos", "strict"])).toBeNull();
    expect(validChoice(null, ["gos"])).toBeNull();
  });
  it("leaves the default out of the url", () => {
    expect(serializeChoice("strict", "strict")).toBeNull();
    expect(serializeChoice("full", "strict")).toBe("full");
  });
});

describe("hasTreeSupport", () => {
  const support = { available: true, trees: { gos: { nodes: [] } } };
  it("is true only for trees with an entry", () => {
    expect(hasTreeSupport(support, "gos")).toBe(true);
    expect(hasTreeSupport(support, "strict")).toBe(false);
    expect(hasTreeSupport({ available: false, trees: { gos: {} } }, "gos")).toBe(false);
    expect(hasTreeSupport(null, "gos")).toBe(false);
  });
});

describe("treeQualityNote", () => {
  it("reads the gos entry's note or the label suffix, else null", () => {
    expect(treeQualityNote([{ name: "gos", label: "Pipeline (current)" }])).toBeNull();
    expect(treeQualityNote([{ name: "gos", label: "Pipeline (current; weak: relaxed site set, 356 sites)" }])).toBe("weak: relaxed site set, 356 sites");
    expect(treeQualityNote([{ name: "gos", label: "Pipeline (current)", note: "weak: 356 sites" }, { name: "jake_latest" }])).toBe("weak: 356 sites");
    expect(treeQualityNote(null)).toBeNull();
  });
});
