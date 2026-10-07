import { decodeGroups, encodeGroups, groupValues, mergeGroups, shareUrl } from "./savedGroups";

describe("saved cell groups", () => {
  const groups = { BWH70: [{ name: "EGFR-high clade", cells: ["BWH70_MR_1_pl1_4h", "c2"] }] };

  it("round-trips through the URL parameter", () => {
    const encoded = encodeGroups(groups);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(decodeGroups(encoded)).toEqual(groups);
    expect(decodeGroups("not base64 json")).toBeNull();
    const url = new URL(shareUrl("BWH70", groups.BWH70, "https://x.org/gOS/?file=BWH70"));
    expect(url.searchParams.get("file")).toBe("BWH70");
    expect(decodeGroups(url.searchParams.get("scgroups"))).toEqual(groups);
  });

  it("merges URL groups over stored ones by name", () => {
    const stored = { BWH70: [{ name: "EGFR-high clade", cells: ["old"] }, { name: "other", cells: ["x"] }] };
    const merged = mergeGroups(stored, groups);
    expect(merged.BWH70.map((g) => g.name)).toEqual(["other", "EGFR-high clade"]);
    expect(merged.BWH70[1].cells).toEqual(["BWH70_MR_1_pl1_4h", "c2"]);
  });

  it("labels RNA cells by DNA or RNA id", () => {
    const cells = [{ displayId: "r1", cell_id: "c2" }, { displayId: "r2", cell_id: null }, { displayId: "r3", cell_id: "z" }];
    expect(groupValues(cells, [{ name: "g", cells: ["c2", "r2"] }])).toEqual({ r1: "g", r2: "g", r3: null });
  });
});
