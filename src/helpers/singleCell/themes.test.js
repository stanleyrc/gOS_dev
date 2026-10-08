import { THEMES, cloneColorsForTheme, themeColor } from "./themes";

describe("themes", () => {
  it("every theme has at least five hex colours", () => {
    Object.values(THEMES).forEach((th) => {
      expect(th.colors.length).toBeGreaterThanOrEqual(5);
      th.colors.forEach((c) => expect(c).toMatch(/^#[0-9A-Fa-f]{6}$/));
    });
  });
  it("recolours clones, keeps Normal grey and dataset colours on the default theme", () => {
    const fixed = { "Clone 1": "#123456" };
    expect(cloneColorsForTheme(["Clone 1", "Clone 2", "Normal"], "tableau", fixed)).toEqual({
      "Clone 1": "#123456",
      "Clone 2": themeColor("tableau", 1),
      Normal: "#9E9E9E",
    });
    const z = cloneColorsForTheme(["Clone 1", "Clone 2"], "zissou", fixed);
    expect(z["Clone 1"]).toBe(THEMES.zissou.colors[0]);
  });
});
