import { aseVerdict, expressionContrast, expressionHeadline, groupStats, rnaAlleleCounts, rnaRows } from "./driverExpression";

describe("groupStats", () => {
  it("summarises values and detection", () => {
    const s = groupStats([0, 0, 1, 2, 3]);
    expect(s).toMatchObject({ n: 5, detected: 3, median: 1, min: 0, max: 3 });
    expect(s.mean).toBeCloseTo(1.2);
    expect(s.pctDetected).toBeCloseTo(0.6);
  });
  it("is empty-safe and ignores NaN", () => {
    expect(groupStats([]).n).toBe(0);
    expect(groupStats([NaN, 1]).n).toBe(1);
  });
});

describe("expressionContrast", () => {
  it("reports higher expression in carriers with small p", () => {
    const a = Array.from({ length: 20 }, (_, i) => 2 + i * 0.05);
    const b = Array.from({ length: 20 }, (_, i) => (i % 4 === 0 ? 0.5 : 0));
    const c = expressionContrast(a, b);
    expect(c.ok).toBe(true);
    expect(c.meanDiff).toBeGreaterThan(1);
    expect(c.pMW).toBeLessThan(0.001);
    expect(c.pFisher).toBeLessThan(0.001);
  });
  it("refuses small groups with a reason", () => {
    const c = expressionContrast([1, 2], [1, 2, 3, 4]);
    expect(c.ok).toBe(false);
    expect(c.reason).toMatch(/too few/);
  });
});

describe("headline", () => {
  it("states missing genes and unavailable contrasts", () => {
    const text = expressionHeadline([{ gene: "A", contrast: null }, { gene: "B", contrast: { ok: false, reason: "too few" } }]);
    expect(text).toMatch(/A: gene not in the RNA matrix/);
    expect(text).toMatch(/B: not available \(too few\)/);
  });
  it("is empty without genes", () => expect(expressionHeadline([])).toBe(""));
});

describe("rnaRows", () => {
  it("keeps only cells with RNA", () => {
    expect(rnaRows(["a", "b", "c"], new Map([["a", 0], ["c", 5]]))).toEqual([{ id: "a", r: 0 }, { id: "c", r: 5 }]);
    expect(rnaRows(["a"], null)).toEqual([]);
  });
});

describe("rnaAlleleCounts / aseVerdict", () => {
  const rows = [
    { id: "c1", rnaAlt: 3, rnaDp: 5 },
    { id: "c2", rnaAlt: 0, rnaDp: 4 },
    { id: "o1", rnaAlt: 0, rnaDp: 10 },
    { id: "o2", rnaAlt: null, rnaDp: null },
  ];
  it("pools alt and ref RNA reads per group", () => {
    const k = rnaAlleleCounts(rows, { carriers: ["c1", "c2"], others: ["o1", "o2"] });
    expect(k.carriers).toMatchObject({ alt: 3, ref: 6, dp: 9, cells: 2, altCells: 1 });
    expect(k.others).toMatchObject({ alt: 0, dp: 10, cells: 1 });
    const v = aseVerdict(k);
    expect(v.p).toBeLessThan(0.1);
  });
  it("is null when no RNA depth exists", () => {
    expect(rnaAlleleCounts([{ id: "c1", rnaAlt: null, rnaDp: null }], { carriers: ["c1"] })).toBeNull();
    expect(aseVerdict({ carriers: { dp: 0 } })).toBeNull();
  });
});
