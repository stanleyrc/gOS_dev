import { dataRootOf, gzEntry, parseGzIndex, relativeToRoot, sourceIsFresh } from "./gzIndex";

const entry = { source: "MGH303/snv_matrix.json", size: 100, mtime: 1760000000000 };

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
  it("parses only schema 2 entries", () => {
    const idx = parseGzIndex({ schemaVersion: 2, files: { "a/b.json": entry, "bad.json": { source: 3 } } });
    expect([...idx.keys()]).toEqual(["a/b.json"]);
    expect(parseGzIndex({ schemaVersion: 1, files: ["a.json"] }).size).toBe(0);
    expect(parseGzIndex(null).size).toBe(0);
  });
  it("finds entries by path", () => {
    const idx = parseGzIndex({ schemaVersion: 2, files: { "MGH303/snv_matrix.json": entry } });
    expect(gzEntry(idx, "https://x.org/gOS/data/MGH303/snv_matrix.json")).toMatchObject({ size: 100 });
    expect(gzEntry(idx, "https://x.org/gOS/data/MGH303/tree.nwk")).toBeNull();
    expect(gzEntry(null, "data/a.json")).toBeNull();
  });
  it("accepts the .gz only while the source still has the recorded size and mtime", () => {
    const ok = { "content-length": "100", "last-modified": new Date(1760000000500).toUTCString() };
    expect(sourceIsFresh(entry, ok)).toBe(true);
    expect(sourceIsFresh(entry, { ...ok, "content-length": "101" })).toBe(false);
    expect(sourceIsFresh(entry, { ...ok, "last-modified": new Date(1760000100000).toUTCString() })).toBe(false);
    expect(sourceIsFresh(entry, {})).toBe(false);
    expect(sourceIsFresh(null, ok)).toBe(false);
  });
});
