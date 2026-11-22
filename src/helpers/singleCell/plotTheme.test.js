import { TYPE, contrastRatio, cssVars, fontCss, inkOn, luminance, plotTheme, svgRemapCss, SVG_REMAP } from "./plotTheme";

describe("plotTheme tokens", () => {
  const light = plotTheme("light");
  const dark = plotTheme("dark");

  it("has the same token names in both modes", () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
  });

  it("keeps text readable on panels (WCAG AA for text, 3:1 for muted / ticks)", () => {
    [light, dark].forEach((t) => {
      expect(contrastRatio(t.text, t.panel)).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(t.textSecondary, t.panel)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.muted, t.panel)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.muted, t.panelAlt)).toBeGreaterThanOrEqual(4);
      expect(contrastRatio(t.axis, t.panel)).toBeGreaterThanOrEqual(2.5);
    });
  });

  it("separates panels from the page and gridlines from panels in dark mode", () => {
    expect(luminance(dark.panel)).toBeGreaterThan(luminance(dark.page));
    expect(contrastRatio(dark.grid, dark.panel)).toBeGreaterThan(1.3);
    expect(contrastRatio(dark.border, dark.panel)).toBeGreaterThan(1.5);
  });

  it("exposes tokens and the type scale as CSS custom properties", () => {
    const vars = cssVars("dark");
    expect(vars["--sc-text"]).toBe(dark.text);
    expect(vars["--sc-text-secondary"]).toBe(dark.textSecondary);
    expect(vars["--sc-fs-tick"]).toBe(`${TYPE.tick}px`);
    expect(vars["--sc-mode"]).toBeUndefined();
  });

  it("never sets plot text below 10 px", () => {
    Object.values(TYPE).forEach((px) => expect(px).toBeGreaterThanOrEqual(10));
    expect(fontCss(TYPE.tick, 600)).toMatch(/^600 11\.5px /);
  });

  it("picks readable ink on coloured fills", () => {
    expect(inkOn("#ffffff")).toBe("#111111");
    expect(inkOn("#1f1f1f")).toBe("#ffffff");
    expect(inkOn("#F28E2B")).toBe("#111111"); // tableau orange: dark text reads better
    expect(inkOn("rgb(8, 48, 107)")).toBe("#ffffff"); // d3 scales return rgb()
    expect(inkOn("rgb(247, 251, 255)")).toBe("#111111");
  });

  it("generates a dark re-tint rule for every listed SVG literal", () => {
    const css = svgRemapCss();
    expect(css).toContain(`text[fill="#262626" i]`);
    expect(css).toContain("svg:not(.sc-light-island svg)");
    expect(css).toContain(`fill: var(--sc-text, ${dark.text})`);
    expect(css).toContain(`line[stroke="#f0f0f0" i]`);
    expect(css).toContain(`stroke: var(--sc-grid, ${dark.grid})`);
    Object.values(SVG_REMAP).forEach((roles) =>
      Object.entries(roles).forEach(([token, values]) => {
        expect(dark[token]).toBeDefined();
        values.forEach((v) => expect(css).toContain(`="${v}" i]`));
      })
    );
    const ruleLines = css.split("\n").filter((line) => line.includes("{"));
    expect(ruleLines.every((line) => line.startsWith('html[data-theme="dark"]'))).toBe(true);
  });
});

describe("INK (light SVG attribute tokens)", () => {
  const { INK, SVG_REMAP: REMAP, plotTheme: theme } = require("./plotTheme");
  it("re-tints every INK colour used for SVG text and lines in dark mode", () => {
    const listed = (role) => Object.values(REMAP[role]).flat().map((v) => v.toLowerCase());
    ["text", "textSecondary", "muted", "faint"].forEach((k) => expect(listed("textFill")).toContain(INK[k].toLowerCase()));
    ["panel", "panelAlt", "empty", "border"].forEach((k) => expect(listed("shapeFill")).toContain(INK[k].toLowerCase()));
    ["grid", "border", "axis", "panel"].forEach((k) => expect(listed("stroke")).toContain(INK[k].toLowerCase()));
    expect(INK).toBe(theme("light"));
  });
});

describe("cyberpunk mode", () => {
  const { isDarkLike, cyberAntdTokens } = require("./plotTheme");
  const cyber = plotTheme("cyberpunk");
  const dark = plotTheme("dark");

  it("isDarkLike covers dark, cyberpunk and the dark sea skins", () => {
    expect(isDarkLike("dark")).toBe(true);
    expect(isDarkLike("cyberpunk")).toBe(true);
    expect(isDarkLike("light")).toBe(false);
    expect(isDarkLike(undefined)).toBe(false);
  });

  it("has the same token names as dark", () => {
    expect(Object.keys(cyber).sort()).toEqual(Object.keys(dark).sort());
    expect(cyber.mode).toBe("cyberpunk");
  });

  it("keeps text at >= 4.5:1 on every surface and accents readable", () => {
    ["page", "panel", "panelAlt", "raised"].forEach((bg) => {
      expect(contrastRatio(cyber.text, cyber[bg])).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(cyber.textSecondary, cyber[bg])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(cyber.muted, cyber[bg])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(cyber.accent, cyber[bg])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(cyber.magenta, cyber[bg])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(cyber.yellow, cyber[bg])).toBeGreaterThanOrEqual(4.5);
    });
  });

  it("exports css vars and antd tokens only for cyberpunk", () => {
    expect(cssVars("cyberpunk")["--sc-page"]).toBe(cyber.page);
    expect(cyberAntdTokens("cyberpunk").colorPrimary).toBe(cyber.accent);
    expect(cyberAntdTokens("dark")).toEqual({});
  });
});

describe("sea themes (sea default, lagoon / deep sea alternatives)", () => {
  const { isDarkLike, skinAntdTokens, SKINS } = require("./plotTheme");
  const light = plotTheme("light");
  const dark = plotTheme("dark");
  const names = ["sea", "deepsea", "lagoon"];

  it("are registered skins; sea and deep sea use the dark code paths, lagoon the light ones", () => {
    names.forEach((n) => expect(SKINS).toContain(n));
    expect(isDarkLike("sea")).toBe(true);
    expect(isDarkLike("deepsea")).toBe(true);
    expect(isDarkLike("lagoon")).toBe(false);
    names.forEach((n) => expect(plotTheme(n).mode).toBe(n));
  });

  it("have the same token names as light / dark", () => {
    names.forEach((n) => expect(Object.keys(plotTheme(n)).sort()).toEqual(Object.keys(light).sort()));
  });

  it("keep body text and controls at WCAG AA on every surface", () => {
    names.forEach((n) => {
      const t = plotTheme(n);
      ["page", "panel", "panelAlt", "raised"].forEach((bg) => {
        expect(contrastRatio(t.text, t[bg])).toBeGreaterThanOrEqual(7);
        expect(contrastRatio(t.textSecondary, t[bg])).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(t.muted, t[bg])).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(t.accent, t[bg])).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(t.select, t[bg])).toBeGreaterThanOrEqual(3);
      });
      expect(contrastRatio(t.axis, t.panel)).toBeGreaterThanOrEqual(2.5);
      expect(contrastRatio(t.grid, t.panel)).toBeGreaterThan(1.15);
      expect(contrastRatio(t.border, t.panel)).toBeGreaterThan(1.4);
    });
  });

  it("change only chrome: data-meaning tokens stay those of dark / light", () => {
    const base = { sea: dark, deepsea: dark, lagoon: light };
    names.forEach((n) => {
      const t = plotTheme(n);
      ["separator", "outline"].forEach((k) => expect(t[k]).toBe(base[n][k]));
    });
  });

  it("give antd tokens with the sea accent; none for plain light / dark", () => {
    expect(skinAntdTokens("sea").colorPrimary).toBe(plotTheme("sea").accent);
    expect(skinAntdTokens("lagoon").colorBgLayout).toBe(plotTheme("lagoon").page);
    expect(skinAntdTokens("light")).toEqual({});
    expect(skinAntdTokens("dark")).toEqual({});
    expect(skinAntdTokens("bogus")).toEqual({});
  });
});
