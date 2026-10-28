import { isOriginalOnly, originalDateLabel, parseOriginalManifest } from "./paperOriginal";

describe("paperOriginal", () => {
  test("date label", () => {
    expect(originalDateLabel("2026-10-15")).toBe("15 Oct");
    expect(originalDateLabel("")).toBe("");
  });
  test("parse manifest", () => {
    const m = parseOriginalManifest({ figures: [{ id: "1", date: "2026-10-15", file: "Figure1.pdf" }, { id: "2", label: "Fig 2", file: "Figure2.pdf" }, { id: "3" }] }, "/d/");
    expect(Object.keys(m.byLabel)).toEqual(["Fig 1", "Fig 2"]);
    expect(m.byLabel["Fig 1"]).toMatchObject({ url: "/d/Figure1.pdf", dateLabel: "15 Oct" });
    expect(parseOriginalManifest(null, "/d/")).toBeNull();
    expect(parseOriginalManifest({ figures: [] }, "/d/")).toBeNull();
  });
  test("original-only", () => {
    const m = parseOriginalManifest({ figures: [{ id: "1", file: "a.pdf" }, { id: "2", file: "b.pdf" }] }, "");
    expect(isOriginalOnly("Fig 2", [{ label: "Fig 1" }], m)).toBe(true);
    expect(isOriginalOnly("Fig 1", [{ label: "Fig 1" }], m)).toBe(false);
    expect(isOriginalOnly("Fig 2", [], null)).toBe(false);
  });
});
