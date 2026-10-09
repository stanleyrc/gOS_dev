import { fmtSpan, laneEmphasis, panDomain, shortLabel, wheelDx, wheelIntent, wheelZoomFactor, zoomDomain } from "./walkPlotState";

describe("walkPlotState", () => {
  it("keeps the focus highlight while another lane is hovered", () => {
    expect(laneEmphasis("a", {})).toEqual({ opacity: 1, focused: false, hovered: false });
    expect(laneEmphasis("a", { hover: "a" })).toEqual({ opacity: 1, focused: false, hovered: true });
    // hover alone dims nothing
    expect(laneEmphasis("b", { hover: "a" }).opacity).toBe(1);
    // focus fades the others ...
    expect(laneEmphasis("b", { focus: "a" }).opacity).toBeLessThan(1);
    // ... hovering another lane lifts it but the focused lane stays focused
    expect(laneEmphasis("a", { focus: "a", hover: "b" })).toEqual({ opacity: 1, focused: true, hovered: false });
    expect(laneEmphasis("b", { focus: "a", hover: "b" })).toEqual({ opacity: 1, focused: false, hovered: true });
    expect(laneEmphasis("c", { focus: "a", hover: "b" }).opacity).toBeLessThan(1);
  });

  it("classifies wheel events", () => {
    expect(wheelIntent({ deltaY: 100 })).toBe("scroll");
    expect(wheelIntent({ deltaY: 100, ctrlKey: true })).toBe("zoom");
    expect(wheelIntent({ deltaY: -3, metaKey: true })).toBe("zoom");
    expect(wheelIntent({ deltaY: 100, shiftKey: true })).toBe("pan");
    expect(wheelIntent({ deltaX: 40, deltaY: 5 })).toBe("pan");
    expect(wheelIntent({ deltaX: 5, deltaY: 40 })).toBe("scroll");
    expect(wheelDx({ deltaY: 30, shiftKey: true })).toBe(30);
    expect(wheelDx({ deltaX: 2, deltaMode: 1 })).toBe(32);
    expect(wheelZoomFactor({ deltaY: 10000 })).toBeCloseTo(Math.exp(0.5));
    expect(wheelZoomFactor({ deltaY: -100 })).toBeLessThan(1);
  });

  it("zooms and pans within the genome", () => {
    expect(zoomDomain([1000, 3000], 2000, 0.5)).toEqual([1500, 2500]);
    expect(zoomDomain([1000, 1600], 1300, 0.5, { minSpan: 1000 })).toEqual([800, 1800]);
    expect(zoomDomain([10, 1010], 10, 4, { lo: 1, hi: 2000 })).toEqual([1, 2000]);
    expect(panDomain([100, 200], -500)).toEqual([1, 101]);
    expect(panDomain([100, 200], 50, { hi: 220 })).toEqual([120, 220]);
  });

  it("shortens labels and sizes", () => {
    expect(shortLabel("EGFR 1", 22)).toBe("EGFR 1");
    const s = shortLabel("IKZF1,EGFR,ELN,GRM3,AKAP9,ZNF479,SBDS,HIP1,CDK6 1", 22);
    expect(s).toHaveLength(22);
    expect(s.endsWith("K6 1")).toBe(true);
    expect(fmtSpan(1.5e6)).toBe("1.5Mb");
    expect(fmtSpan(12e6)).toBe("12Mb");
    expect(fmtSpan(480000)).toBe("480kb");
    expect(fmtSpan(900)).toBe("900bp");
  });
});
