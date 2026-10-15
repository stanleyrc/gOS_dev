import { TMB_TRACK, boxStats, tmbBarColor, cellTmbMap, cladeTmbIndex, cohortTmbRows, fmtTmb, patientTmbRows, quantile, tmbAxisMax, tmbBarFraction, tmbTooltipLines } from "./tmb";

// synthetic fixtures only
const REC = { cell_id: "c1", tmb_raw: 4, tmb_corrected: 5.5, n_alt: 800, n_truncal_alt: 400, n_subclonal_alt: 300, n_private_alt: 100, callable_mb: 1700, callable_frac: 0.8, sensitivity: 0.72, n_truncal_covered: 555 };

describe("tmb helpers", () => {
  it("formats mutations per Mb", () => {
    expect(fmtTmb(123.4)).toBe("123");
    expect(fmtTmb(12.34)).toBe("12.3");
    expect(fmtTmb(0.4217)).toBe("0.42");
    expect(fmtTmb(NaN)).toBe("n/a");
    expect(fmtTmb(null)).toBe("n/a");
  });
  it("indexes cells and tolerates missing data", () => {
    expect(cellTmbMap(null).size).toBe(0);
    expect(cellTmbMap({ cells: [REC, null, { cell_id: 7 }] }).get("c1")).toBe(REC);
    expect(cellTmbMap({ cells: [{ cell_id: 7 }] }).has("7")).toBe(true);
  });
  it("computes quantiles and box stats", () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(quantile([], 0.5)).toBeNull();
    const b = boxStats([1, 2, 3, 4, 5, 100, NaN]);
    expect(b.n).toBe(6);
    expect(b.median).toBe(3.5);
    expect(b.whiskerHigh).toBe(5);
    expect(b.max).toBe(100);
    expect(boxStats([])).toBeNull();
  });
  it("scales bars", () => {
    expect(tmbAxisMax([{ tmb_corrected: 10 }, { tmb_corrected: 10 }, { tmb_corrected: 10 }])).toBeCloseTo(11);
    expect(tmbAxisMax([])).toBeNull();
    expect(tmbBarFraction(5, 10)).toBe(0.5);
    expect(tmbBarFraction(50, 10)).toBe(1);
    expect(tmbBarFraction(null, 10)).toBe(0);
    expect(tmbBarFraction(5, null)).toBe(0);
  });
  it("describes a cell's TMB with every number the brief asks for", () => {
    const text = tmbTooltipLines(REC).map((l) => l.join(" ")).join("|");
    expect(text).toContain("5.50 mut/Mb");
    expect(text).toContain("4.00 mut/Mb");
    expect(text).toContain("800 (400 / 300 / 100)");
    expect(text).toContain("1700 Mb (80% of territory)");
    expect(text).toContain("72% of 555 covered");
    expect(tmbTooltipLines(undefined)[0][1]).toMatch(/not available/);
    expect(tmbTooltipLines({ ...REC, sensitivity: null }).join("|")).toMatch(/too few/);
  });
  it("greys bars without a sensitivity estimate", () => {
    expect(tmbBarColor(REC)).not.toBe(tmbBarColor({ ...REC, sensitivity: null }));
    expect(tmbBarColor(undefined)).toBe(tmbBarColor(null));
    expect(TMB_TRACK).toMatch(/^#/);
  });
  it("builds patient summary rows and flags the private lower bound", () => {
    const rows = patientTmbRows({ patient_summary: { truncal: { n_sites: 10, callable_mb: 2000, tmb_raw: 0.005, tmb_corrected: 0.006 }, private: { n_sites: 4, tmb_raw: 1, tmb_corrected: 1.4 } } });
    expect(rows.map((r) => r.key)).toEqual(["truncal", "private"]);
    expect(rows[1].lowerBound).toBe(true);
    expect(patientTmbRows(null)).toEqual([]);
  });
  it("orders cohort rows by median and joins clades", () => {
    const cohort = {
      patients: [
        { patient: "A", cells: [{ tmb_corrected: 9 }, { tmb_corrected: 11 }], clades: [{ id: "A_n3", tmb_raw: 1 }] },
        { patient: "B", noisy: true, cells: [{ tmb_corrected: 1 }, { tmb_corrected: 3 }] },
        { patient: "C", cells: [] },
      ],
    };
    const rows = cohortTmbRows(cohort);
    expect(rows.map((r) => r.patient)).toEqual(["B", "A"]);
    expect(rows[0].noisy).toBe(true);
    expect(cladeTmbIndex(cohort).get("A_n3").patient).toBe("A");
  });
});
