import { luminance, parseColor, readableInk, INK_ON_DARK, INK_ON_LIGHT } from "./contrast";

describe("contrast", () => {
  it("parses hex and rgb colours", () => {
    expect(parseColor("#fff")).toEqual([255, 255, 255]);
    expect(parseColor("#4e79a7")).toEqual([78, 121, 167]);
    expect(parseColor("rgb(10, 20, 30)")).toEqual([10, 20, 30]);
    expect(parseColor("blue")).toBeNull();
  });
  it("computes luminance", () => {
    expect(luminance([0, 0, 0])).toBe(0);
    expect(luminance([255, 255, 255])).toBeCloseTo(1);
  });
  it("picks dark ink on light colours and white on dark ones", () => {
    expect(readableInk("#4e79a7")).toBe(INK_ON_DARK); // steel blue
    expect(readableInk("#e15759")).toBe(INK_ON_DARK); // red
    expect(readableInk("#ffbe7d")).toBe(INK_ON_LIGHT); // peach
    expect(readableInk("#a0cbe8")).toBe(INK_ON_LIGHT); // light blue
    expect(readableInk("#edc948")).toBe(INK_ON_LIGHT); // yellow
    expect(readableInk("not a colour")).toBe(INK_ON_DARK);
  });
});
