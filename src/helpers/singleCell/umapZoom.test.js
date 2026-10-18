import { identityView, toScreen, toData, zoomAt, panBy, clampView, wheelFactor, zoomRadius, viewForBox, isIdentity, MAX_ZOOM } from "./umapZoom";

describe("umapZoom", () => {
  const W = 400;
  const H = 300;
  it("round-trips screen and data coordinates", () => {
    const v = { k: 2.5, x: -120, y: -40 };
    const [sx, sy] = toScreen(v, 100, 50);
    const [dx, dy] = toData(v, sx, sy);
    expect(dx).toBeCloseTo(100);
    expect(dy).toBeCloseTo(50);
  });
  it("keeps the data under the cursor fixed when zooming", () => {
    const v = zoomAt(identityView(), 200, 150, 2, W, H);
    expect(v.k).toBe(2);
    const [dx, dy] = toData(v, 200, 150);
    expect(dx).toBeCloseTo(200);
    expect(dy).toBeCloseTo(150);
  });
  it("cannot zoom out past 1 or in past the maximum", () => {
    expect(zoomAt(identityView(), 10, 10, 0.1, W, H)).toEqual(identityView());
    expect(zoomAt({ k: 30, x: 0, y: 0 }, 0, 0, 10, W, H).k).toBe(MAX_ZOOM);
  });
  it("clamps panning to the plot box", () => {
    const v = panBy({ k: 2, x: -10, y: -10 }, 500, 500, W, H);
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
    const u = panBy({ k: 2, x: -10, y: -10 }, -5000, -5000, W, H);
    expect(u.x).toBe(-W);
    expect(u.y).toBe(-H);
    expect(clampView({ k: 1, x: 50, y: 50 }, W, H)).toEqual(identityView());
  });
  it("zooming out at the edge returns to the identity view", () => {
    let v = zoomAt(identityView(), 390, 290, 4, W, H);
    v = zoomAt(v, 390, 290, 0.25, W, H);
    expect(isIdentity(v)).toBe(true);
  });
  it("wheel factor: scroll up zooms in, scroll down out, pinch is faster", () => {
    expect(wheelFactor(-100)).toBeGreaterThan(1);
    expect(wheelFactor(100)).toBeLessThan(1);
    expect(wheelFactor(-10, { ctrl: true })).toBeGreaterThan(wheelFactor(-10));
    expect(wheelFactor(-3, { deltaMode: 1 })).toBeCloseTo(wheelFactor(-48));
  });
  it("point radius grows with zoom but is capped", () => {
    expect(zoomRadius(3, 1)).toBe(3);
    expect(zoomRadius(3, 4)).toBe(6);
    expect(zoomRadius(3, 1000)).toBe(9);
  });
  it("viewForBox fits the box in the plot", () => {
    const v = viewForBox([100, 100, 200, 175], W, H);
    expect(v.k).toBeCloseTo(4);
    const [cx, cy] = toScreen(v, 150, 137.5);
    expect(cx).toBeCloseTo(W / 2, 0);
    expect(cy).toBeCloseTo(H / 2, 0);
  });
});
