import { bufferedColumns, carrierMasks, drawMatrix, matrixHit, clampView, isFullView, panView, selectedInRange, selectionPrefix, viewTransform, wheelFactor, zoomView } from "./matrixZoom";

describe("matrix zoom views", () => {
  it("clamps to the column range and a minimum span", () => {
    expect(clampView([-5, 20], 100)).toEqual([0, 25]);
    expect(clampView([95, 110], 100)).toEqual([85, 100]);
    expect(clampView([10, 11], 100)).toEqual([10, 18]);
    expect(clampView([0, 50], 4)).toEqual([0, 4]);
    expect(isFullView(null, 10)).toBe(true);
    expect(isFullView([0, 10], 10)).toBe(true);
    expect(isFullView([1, 10], 10)).toBe(false);
  });

  it("zooms about the anchor and accumulates small trackpad deltas", () => {
    const [a, b] = zoomView([0, 100], 0.25, 0.5, 100);
    expect(b - a).toBe(50);
    expect(a + 0.25 * (b - a)).toBeCloseTo(25); // the point under the cursor stays put
    // many tiny steps still zoom (no rounding back to the same whole span)
    let v = [0, 100];
    for (let i = 0; i < 50; i += 1) v = zoomView(v, 0.5, wheelFactor(-2, 0), 100);
    expect(v[1] - v[0]).toBeLessThan(90);
    expect(zoomView([0, 100], 0.5, 3, 100)).toEqual([0, 100]);
    expect(panView([10, 20], 200, 100)).toEqual([90, 100]);
  });

  it("caps a wheel notch and normalises line deltas", () => {
    expect(wheelFactor(10000, 0)).toBe(2);
    expect(wheelFactor(-10000, 0)).toBe(0.5);
    expect(wheelFactor(3, 1)).toBeCloseTo(Math.exp(99 * 0.002));
  });

  it("maps drawn content onto the live view", () => {
    const x0 = 240;
    const w = 600;
    const drawn = [0, 100];
    const live = [25, 75];
    const { k, tx } = viewTransform(drawn, live, x0, w);
    const xDrawn = (i) => x0 + ((i - drawn[0]) * w) / (drawn[1] - drawn[0]);
    const xLive = (i) => x0 + ((i - live[0]) * w) / (live[1] - live[0]);
    [25, 50, 75, 3].forEach((i) => expect(tx + k * xDrawn(i)).toBeCloseTo(xLive(i)));
    expect(viewTransform(live, live, x0, w)).toEqual({ k: 1, tx: 0 });
    expect(bufferedColumns([40, 50], 100)).toEqual([30, 60]);
    expect(bufferedColumns([0, 100], 100)).toEqual([0, 99]);
  });

  it("hit-tests and paints the canvas matrix", () => {
    const order = ["a", "b", "c", "d", "e", "f"];
    const masks = carrierMasks([{ carriers: new Set(["a", "b", "c", "e", "f"]) }, { carriers: new Set(["d"]) }], order);
    expect(Array.from(masks[0])).toEqual([1, 1, 1, 0, 1, 1]);
    expect(matrixHit(150, 30, [0, 6], 600, 24, 2)).toEqual({ row: 1, col: 1 });
    expect(matrixHit(150, 60, [0, 6], 600, 24, 2)).toBeNull();
    expect(matrixHit(10, 5, [2, 4], 100, 24, 2)).toEqual({ row: 0, col: 2 });
    const calls = [];
    const ctx = { clearRect() {}, fillRect: (...a) => calls.push(a), beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, setLineDash() {} };
    // narrow columns: one rect per run of carriers, split where the selection changes
    drawMatrix(ctx, { masks, colors: ["red", "blue"], view: [0, 6], width: 12, rowH: 24 });
    expect(calls.length).toBe(3);
    calls.length = 0;
    drawMatrix(ctx, { masks, colors: ["red", "blue"], selected: Uint8Array.from([1, 1, 0, 0, 0, 0]), view: [0, 6], width: 12, rowH: 24 });
    expect(calls.length).toBe(4);
    // wide columns: one rect per carrier cell, only inside the view
    calls.length = 0;
    drawMatrix(ctx, { masks, colors: ["red", "blue"], view: [1, 3], width: 200, rowH: 24, separators: [2] });
    expect(calls.length).toBe(2);
    expect(calls[0][0]).toBeCloseTo(0.5);
    const prefix = selectionPrefix(6, new Set([1, 2, 3]));
    expect(selectedInRange(prefix, 1, 3)).toBe(3);
    expect(selectedInRange(prefix, 0, 3)).toBe(3);
  });
});
