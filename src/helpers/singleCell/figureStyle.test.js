import { FIGURE_STYLES, figureStyle, formatTick, formatValue, linearTicks, styleFontSize, styleFontWeight } from "./figureStyle";

describe("figureStyle", () => {
  it("falls back to the default style and keeps every preset complete", () => {
    expect(figureStyle("nope").label).toBe("Clean");
    const keys = Object.keys(FIGURE_STYLES.clean);
    Object.values(FIGURE_STYLES).forEach((s) => keys.forEach((k) => expect(s).toHaveProperty(k)));
  });
  it("scales text and never goes below 9 px", () => {
    const compact = figureStyle("compact");
    expect(styleFontSize(compact, "tick")).toBeLessThan(styleFontSize(figureStyle("clean"), "tick"));
    Object.values(FIGURE_STYLES).forEach((s) => ["tick", "label", "group", "head", "caption"].forEach((r) => expect(styleFontSize(s, r)).toBeGreaterThanOrEqual(9)));
    expect(styleFontWeight(figureStyle("clean"), "group")).toBe(600);
    expect(styleFontWeight(figureStyle("clean"), "label")).toBe(400);
  });
});

describe("formatTick", () => {
  it("drops trailing zeros and abbreviates large numbers", () => {
    expect(formatTick(0.5)).toBe("0.5");
    expect(formatTick(2)).toBe("2");
    expect(formatTick(12.5)).toBe("12.5");
    expect(formatTick(1500)).toBe("1 500");
    expect(formatTick(25000)).toBe("25k");
    expect(formatTick(1000)).toBe("1k");
    expect(formatTick(5000)).toBe("5k");
    expect(formatTick(2.5e6)).toBe("2.5M");
    expect(formatTick(0.25, { percent: true })).toBe("25%");
    expect(formatTick(75, { percent: "points" })).toBe("75%");
  });
});

describe("linearTicks", () => {
  it("returns nice steps inside the range", () => {
    expect(linearTicks(0, 100, 4)).toEqual([0, 25, 50, 75, 100]);
    expect(linearTicks(-2, 22, 5)).toEqual([0, 5, 10, 15, 20]);
    expect(linearTicks(0, 1, 4)).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });
});

describe("formatValue", () => {
  it("abbreviates large values and trims small ones", () => {
    expect(formatValue(90499908)).toBe("90.5M");
    expect(formatValue(415354.5)).toBe("415k");
    expect(formatValue(3577)).toBe("3577");
    expect(formatValue(8.534)).toBe("8.53");
    expect(formatValue(0.1)).toBe("0.1");
    expect(formatValue(622.5)).toBe("622.5");
    expect(formatValue(null)).toBe("–");
    expect(formatValue("x")).toBe("–");
  });
});
