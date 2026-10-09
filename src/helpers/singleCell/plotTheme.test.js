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
    expect(css).toContain(`svg text[fill="#262626" i]`);
    expect(css).toContain(`fill: ${dark.text}`);
    expect(css).toContain(`svg line[stroke="#f0f0f0" i]`);
    expect(css).toContain(`stroke: ${dark.grid}`);
    Object.values(SVG_REMAP).forEach((roles) =>
      Object.entries(roles).forEach(([token, values]) => {
        expect(dark[token]).toBeDefined();
        values.forEach((v) => expect(css).toContain(`="${v}" i]`));
      })
    );
    css.split("\n").forEach((line) => {
      if (line.includes("{")) expect(line.startsWith('html[data-theme="dark"]')).toBe(true);
    });
  });
});
