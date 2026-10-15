import {
  MAP_MAX, MAP_MIN, SPATIAL_SECTIONS, clampMapWidth, effectiveMode, hiddenSections, isCompact,
  presetOf, readSpatialLink, toggleSection, withSpatialLink,
} from "./spatialLayout";

describe("spatialLayout", () => {
  it("clamps the map so the heatmap stays usable", () => {
    expect(clampMapWidth(100)).toBe(MAP_MIN);
    expect(clampMapWidth(5000)).toBe(MAP_MAX);
    expect(clampMapWidth(800, 1300)).toBe(1300 - 520 - 10);
    expect(clampMapWidth(NaN)).toBe(480);
  });
  it("falls back to below on narrow screens", () => {
    expect(effectiveMode("beside", 1000)).toBe("below");
    expect(effectiveMode("beside", 1700)).toBe("beside");
    expect(effectiveMode("below", 1700)).toBe("below");
    expect(effectiveMode(undefined, 1700)).toBe("beside");
  });
  it("is compact by default only when beside", () => {
    expect(isCompact(hiddenSections(null, "beside"))).toBe(true);
    expect(hiddenSections(null, "below")).toEqual([]);
    expect(hiddenSections(["umap", "bogus"], "beside")).toEqual(["umap"]);
  });
  it("toggles one section", () => {
    expect(toggleSection(["umap"], "igv")).toEqual(["umap", "igv"]);
    expect(toggleSection(["umap"], "umap")).toEqual([]);
  });
  it("reads and writes the URL", () => {
    expect(readSpatialLink("?spmap=beside&spw=640&sphide=all")).toEqual({ spMap: "beside", spWidth: 640, spHidden: SPATIAL_SECTIONS });
    expect(readSpatialLink("?sphide=umap,xx")).toEqual({ spHidden: ["umap"] });
    expect(readSpatialLink("?sphide=none")).toEqual({ spHidden: [] });
    expect(readSpatialLink("?a=1")).toEqual({});
    const q = withSpatialLink("?dataset=x&spw=1", { spMap: "beside", spWidth: 640, spHidden: ["umap"] });
    expect(q).toBe("?dataset=x&spmap=beside&spw=640&sphide=umap");
    expect(withSpatialLink("?dataset=x", { spMap: "below", spWidth: 640, spHidden: [] })).toBe("?dataset=x&spmap=below&sphide=none");
    expect(withSpatialLink("", { spMap: "beside", spWidth: 480, spHidden: SPATIAL_SECTIONS })).toBe("?spmap=beside&sphide=all");
  });
  it("names presets", () => {
    expect(presetOf(480)).toBe("M");
    expect(presetOf(500)).toBeNull();
  });
});
