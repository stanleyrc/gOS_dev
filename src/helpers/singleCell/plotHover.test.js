import { fmtNum, fmtPct, fmtCount, boxPointLines, boxSummaryLines, patientScatterLines, carrierBarLines } from "./plotHover";

describe("plotHover", () => {
  test("fmtNum", () => {
    expect(fmtNum(1234567)).toBe("1,234,567");
    expect(fmtNum(3.14159)).toBe("3.14");
    expect(fmtNum(2500.4)).toBe("2,500");
    expect(fmtNum(null)).toBe("n/a");
    expect(fmtNum(NaN)).toBe("n/a");
  });
  test("fmtPct", () => {
    expect(fmtPct(0.084)).toBe("8%");
    expect(fmtPct(0.004)).toBe("0.4%");
    expect(fmtPct(0)).toBe("0%");
    expect(fmtPct(undefined)).toBe("n/a");
  });
  test("fmtCount carries the denominator", () => {
    expect(fmtCount(12, 157)).toBe("12 of 157 cells (8%)");
    expect(fmtCount(12, 0)).toBe("12 cells");
    expect(fmtCount("x", 5)).toBe("n/a");
  });
  test("boxPointLines", () => {
    const l = boxPointLines({ id: "c1", group: "BWH69", metric: "Ploidy", value: 3.2, median: 2, n: 161, flagged: true, clickHint: "Click to open the cell" });
    expect(l[0]).toBe("c1");
    expect(l).toContain("Patient / group: BWH69");
    expect(l).toContain("Group median: 2 (n = 161 cells)");
    expect(l.some((s) => /Flagged outlier/.test(s))).toBe(true);
    expect(l[l.length - 1]).toBe("Click to open the cell");
  });
  test("boxSummaryLines", () => {
    const l = boxSummaryLines({ group: "BWH69", metric: "Ploidy", n: 150, total: 161, median: 1.97, q1: 1.94, q3: 2 });
    expect(l[1]).toBe("150 of 161 cells (93%) with Ploidy");
    expect(l[2]).toBe("Median 1.97; IQR 1.94 to 2");
  });
  test("patientScatterLines", () => {
    const l = patientScatterLines({ patient: "MGH303", xLabel: "Truncal SNVs", xValue: 2700, yLabel: "Subclonal SNVs", yValue: 4800, nTumorCells: 130, nClones: 4 });
    expect(l).toEqual(["MGH303", "Truncal SNVs: 2,700", "Subclonal SNVs: 4,800", "130 tumor cells in 4 clones", "Click to open the patient"]);
  });
  test("carrierBarLines", () => {
    expect(carrierBarLines({ patient: "BWH69", label: "EGFR 1", nCarriers: 145, nCells: 161 })[1]).toBe("Carried by 145 of 161 cells (90%)");
  });
});
