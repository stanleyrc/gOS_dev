import { dragSplitter, fractionsOf, fractionsToLayout, layoutFractions, panelMins, splitFromSearch, splitToSearch, splitWidths } from "./panelSplit";

const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

describe("splitWidths", () => {
  it("automatic: drivers and SNVs keep their widths, CN takes the rest", () => {
    expect(splitWidths({ total: 1000, present: ["cn", "drv", "snv"], auto: { drv: 150, snv: 300 } })).toEqual({ cn: 550, drv: 150, snv: 300 });
  });
  it("stored fractions fill the total exactly", () => {
    const w = splitWidths({ total: 1001, present: ["cn", "drv", "snv"], fractions: { cn: 0.5, drv: 0.2, snv: 0.3 } });
    expect(sum(w)).toBe(1001);
    expect(w.drv).toBeGreaterThan(190);
    expect(w.snv).toBeGreaterThan(290);
  });
  it("ignores a stored split that misses a present panel", () => {
    expect(splitWidths({ total: 800, present: ["cn", "snv"], fractions: { cn: 0.5, drv: 0.5 }, auto: { snv: 200 } })).toEqual({ cn: 600, snv: 200 });
  });
  it("enforces minimum widths and still sums to the total", () => {
    const w = splitWidths({ total: 700, present: ["cn", "drv", "snv"], fractions: { cn: 0.01, drv: 0.01, snv: 0.98 } });
    expect(w.cn).toBeGreaterThanOrEqual(200);
    expect(w.drv).toBeGreaterThanOrEqual(60);
    expect(sum(w)).toBe(700);
  });
  it("shrinks the minimums when the total is too small", () => {
    expect(sum(panelMins(["cn", "drv", "snv"], 180))).toBeLessThanOrEqual(180);
  });
});

describe("dragSplitter", () => {
  const widths = { cn: 600, drv: 150, snv: 250 };
  const present = ["cn", "drv", "snv"];
  it("moves px between the neighbours and keeps the other panel", () => {
    const f = dragSplitter({ widths, present, left: "cn", dx: -100 });
    const w = splitWidths({ total: 1000, present, fractions: f });
    expect(w).toEqual({ cn: 500, drv: 250, snv: 250 });
  });
  it("stops at the minimums", () => {
    const w = splitWidths({ total: 1000, present, fractions: dragSplitter({ widths, present, left: "drv", dx: 5000 }) });
    expect(w.snv).toBe(100);
    expect(w.cn).toBe(600);
    const w2 = splitWidths({ total: 1000, present, fractions: dragSplitter({ widths, present, left: "cn", dx: -5000 }) });
    expect(w2.cn).toBe(200);
  });
  it("is a no-op for the last panel", () => {
    expect(dragSplitter({ widths, present, left: "snv", dx: 40 })).toEqual(fractionsOf(widths));
  });
});

describe("URL and layout", () => {
  it("round-trips cnw / drvbw / snbw", () => {
    const f = { cn: 0.5, drv: 0.2, snv: 0.3 };
    const layout = fractionsToLayout(f);
    expect(layoutFractions(layout)).toEqual(f);
    const q = new URLSearchParams(splitToSearch(layout, ["cn", "drv", "snv"])).toString();
    expect(q).toBe("cnw=0.5&drvbw=0.2&snbw=0.3");
    expect(splitFromSearch(`?${q}`)).toEqual({ cnw: 0.5, drvbw: 0.2, snbw: 0.3 });
  });
  it("writes nothing without a stored split or with one panel, and rejects junk", () => {
    expect(splitToSearch({}, ["cn", "drv"])).toEqual({});
    expect(splitToSearch(fractionsToLayout({ cn: 0.5, drv: 0.5 }), ["cn"])).toEqual({});
    expect(splitFromSearch("?tab=7")).toBeNull();
    expect(splitFromSearch("?cnw=abc&drvbw=2")).toEqual({ cnw: null, drvbw: null });
  });
});
