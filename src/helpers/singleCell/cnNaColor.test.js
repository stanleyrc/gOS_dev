import { CN_NA_COLORS, CN_PALETTE_PRESETS, cnColorer, distinctNa, hexToRgb, normalizePalette, packRGBA } from "./matrix";
import { contrastRatio } from "./plotTheme";

describe("copy number 'not available' colour", () => {
  it("differs from CN 2 (total) and CN 1 (allelic) in every preset", () => {
    Object.entries(CN_PALETTE_PRESETS).forEach(([preset, p]) => {
      const n = normalizePalette({ preset }, preset);
      expect(n.missing.toLowerCase()).not.toBe(n.total[2].toLowerCase());
      expect(contrastRatio(n.missing, n.total[2])).toBeGreaterThanOrEqual(1.5);
      expect(contrastRatio(n.missing, n.allelic[1])).toBeGreaterThanOrEqual(1.5);
      expect(n.missing).toBe(p.missing);
    });
  });

  it("maps NA, null and NaN to the NA colour, never to the CN 2 colour (light and dark / sea palettes)", () => {
    ["pgv", "pgvDark", "scwgs"].forEach((preset) => {
      const color = cnColorer({ preset, ...CN_PALETTE_PRESETS[preset] }, "total");
      const na = color(NaN);
      expect(color(null)).toBe(na);
      expect(color(undefined)).toBe(na);
      expect(na).not.toBe(color(2));
      expect(na).toBe(packRGBA(hexToRgb(CN_PALETTE_PRESETS[preset].missing)));
    });
  });

  it("replaces a stored NA colour that is too close to CN 2 (old #EEEEEE / #1a1a1a)", () => {
    expect(normalizePalette({ preset: "pgv", missing: "#EEEEEE" }, "pgv").missing).toBe(CN_NA_COLORS.light);
    expect(normalizePalette({ preset: "pgvDark", missing: "#1a1a1a" }, "pgvDark").missing).toBe(CN_NA_COLORS.dark);
    expect(normalizePalette({ preset: "pgv", missing: "#7f3fbf" }, "pgv").missing).toBe("#7f3fbf"); // a distinct user choice stays
  });

  it("falls back through greys when the preferred one is too close", () => {
    expect(distinctNa("#FFFFFF", ["#FFFFFF"], "#FEFEFE")).toBe(CN_NA_COLORS.light);
  });
});
