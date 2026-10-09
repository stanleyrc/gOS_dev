import { rotatedLabelAt } from "./rotatedLabels";

const a = (60 * Math.PI) / 180;
// point d px along label k's text, h px below its baseline (perpendicular)
const onLabel = (k, d, h, colPx, top = 4) => [(k + 0.5) * colPx + d * Math.cos(a) - h * Math.sin(a), top + d * Math.sin(a) + h * Math.cos(a)];

describe("rotatedLabelAt", () => {
  it("finds the label whose text is under the point, for tightly packed labels", () => {
    const colPx = 9;
    for (let k = 0; k < 20; k++) {
      for (const d of [3, 15, 35]) {
        const [x, y] = onLabel(k, d, 7, colPx);
        expect(rotatedLabelAt(x, y, colPx, 20)).toBe(k);
      }
    }
  });

  it("returns -1 outside the row", () => {
    expect(rotatedLabelAt(-50, 5, 9, 10)).toBe(-1);
    expect(rotatedLabelAt(500, 5, 9, 10)).toBe(-1);
    expect(rotatedLabelAt(10, 5, 0, 10)).toBe(-1);
  });
});
