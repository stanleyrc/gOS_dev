import { ringBox, markCentre, boxCentre } from "./paperRing";

const region = { x: 54.3, y: 57.7, w: 101.1, h: 142.8, xscale: { lo: 0.4, hi: 13.7 }, yscale: { lo: 0.5, hi: 17.5 } };

describe("paper ring geometry", () => {
  it("centres the ring box on the mark at any scale (page, lens, odd sizes)", () => {
    [[1.6, 1.6, 12], [1.6 * 3, 1.6 * 3, 9], [1.6 * 2.5, 1.6, 12], [2.13, 2.13, 7]].forEach(([kx, ky, size]) => {
      [[1, 1], [13.7, 17.5], [0.4, 0.5], [6.55, 9]].forEach(([dx, dy]) => {
        const [cx, cy] = markCentre(region, dx, dy, kx, ky);
        const [bx, by] = boxCentre(ringBox([cx / kx, cy / ky], kx, ky, size));
        expect(Math.abs(bx - cx)).toBeLessThan(1e-9);
        expect(Math.abs(by - cy)).toBeLessThan(1e-9);
      });
    });
  });

  it("maps the data corners to the plot-area corners (y up in data, down on the page)", () => {
    expect(markCentre(region, 0.4, 17.5, 1, 1)).toEqual([54.3, 57.7]);
    const [x, y] = markCentre(region, 13.7, 0.5, 1, 1);
    expect(x).toBeCloseTo(155.4, 9);
    expect(y).toBeCloseTo(200.5, 9);
  });
});
