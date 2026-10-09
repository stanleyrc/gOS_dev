import { stripLabelFont, stripLabelHeight, STRIP_LABEL_MAX, STRIP_LABEL_MIN } from "./stripLabels";

describe("strip label header", () => {
  it("clamps the font to 10-12 px", () => {
    expect(stripLabelFont(6)).toBe(10);
    expect(stripLabelFont(14)).toBe(12);
    expect(stripLabelFont(30)).toBe(12);
  });
  it("fits short labels and caps long ones", () => {
    expect(stripLabelHeight(["A"], 12)).toBe(STRIP_LABEL_MIN);
    expect(stripLabelHeight(["Selected", "Clone"], 11)).toBe(Math.round(8 * 11 * 0.58 + 6));
    expect(stripLabelHeight(["Region_Annotation_with_a_long_name"], 12)).toBe(STRIP_LABEL_MAX);
    expect(stripLabelHeight([], 12)).toBe(STRIP_LABEL_MIN);
  });
});
