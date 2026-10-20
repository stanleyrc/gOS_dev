import { dataRootOf, hasGzSibling, parseGzIndex, relativeToRoot } from "./gzIndex";

describe("gzIndex", () => {
  it("finds the data root of absolute and relative paths", () => {
    expect(dataRootOf("https://x.org/sclarke/gOS_GBM_sc/data/MGH303/snv_matrix.json")).toBe("https://x.org/sclarke/gOS_GBM_sc/data/");
    expect(dataRootOf("data/P1/tree.nwk")).toBe("data/");
    expect(dataRootOf("https://x.org/app/main.js")).toBeNull();
    expect(dataRootOf(undefined)).toBeNull();
  });
  it("gives the path below the root and ignores query strings", () => {
    expect(relativeToRoot("https://x.org/a/data/_cohort/rna/cells.json?v=2")).toBe("_cohort/rna/cells.json");
    expect(relativeToRoot("nope.json")).toBeNull();
  });
  it("parses the index defensively", () => {
    expect(parseGzIndex({ files: ["a/b.json", 3, ""] })).toEqual(new Set(["a/b.json"]));
    expect(parseGzIndex(null).size).toBe(0);
    expect(parseGzIndex({ files: "x" }).size).toBe(0);
  });
  it("matches only listed files", () => {
    const idx = parseGzIndex({ files: ["MGH303/snv_matrix.json"] });
    expect(hasGzSibling(idx, "https://x.org/gOS/data/MGH303/snv_matrix.json")).toBe(true);
    expect(hasGzSibling(idx, "https://x.org/gOS/data/MGH303/tree.nwk")).toBe(false);
    expect(hasGzSibling(null, "data/a.json")).toBe(false);
  });
});
