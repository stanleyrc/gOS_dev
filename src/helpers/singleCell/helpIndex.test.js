import { PROVENANCE } from "./provenance";
import { EXTRA_CARDS, HELP_SECTIONS, LOCATIONS, METHODS, TAB, buildHelpEntries, helpCardById, locationLabel, searchHelp } from "./helpIndex";

const t = (k) => k;
const entries = buildHelpEntries({ t });

describe("help index", () => {
  it("places every provenance card somewhere", () => {
    const missing = Object.keys(PROVENANCE).filter((id) => !(LOCATIONS[id] || []).length);
    expect(missing).toEqual([]);
  });

  it("only uses known tabs and locations", () => {
    const tabs = new Set(Object.values(TAB));
    const all = [...Object.values(LOCATIONS).flat(), ...Object.values(EXTRA_CARDS).flatMap((e) => e.locations)];
    const bad = all.filter((loc) => (loc.scope === "patient" ? !tabs.has(loc.tab) : typeof loc.view !== "string"));
    expect(bad).toEqual([]);
  });

  it("links methods only to existing cards", () => {
    METHODS.forEach((m) => m.related.forEach((id) => expect(helpCardById(entries, id)).not.toBeNull()));
  });

  it("includes cards, methods and every definition", () => {
    const nDefs = HELP_SECTIONS.reduce((n, [, keys]) => n + keys.length, 0);
    expect(entries.filter((e) => e.kind === "definition")).toHaveLength(nDefs);
    expect(entries.filter((e) => e.kind === "method")).toHaveLength(METHODS.length);
    expect(new Set(entries.map((e) => `${e.kind}:${e.id}`)).size).toBe(entries.length);
  });
});

describe("searchHelp", () => {
  it("returns everything for an empty query", () => {
    expect(searchHelp(entries, "  ")).toHaveLength(entries.length);
  });

  it("requires every term and ranks title hits first", () => {
    const r = searchHelp(entries, "walk co-occurrence");
    expect(r[0].id).toBe("walkCooccurrence");
    r.forEach((e) => expect(e._hay).toContain("co-occurrence"));
  });

  it("finds methods by body text", () => {
    expect(searchHelp(entries, "microhomology", { kind: "method" }).map((e) => e.id)).toContain("m-story");
  });

  it("matches location labels", () => {
    const r = searchHelp(entries, `tab${TAB.ecdna}`, { kind: "card" });
    expect(r.map((e) => e.id)).toEqual(expect.arrayContaining(["walks", "walkDiagram"]));
  });

  it("escapes regex characters", () => {
    expect(() => searchHelp(entries, "(ρ")).not.toThrow();
  });

  it("labels locations", () => {
    expect(locationLabel({ scope: "patient", tab: 12 }, t)).toBe("containers.detail-view.tabs.tab12");
    expect(locationLabel({ scope: "cohort", view: "drivers" }, t)).toContain("view-drivers");
  });
});
