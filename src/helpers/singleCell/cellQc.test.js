import { excludedCellIds } from "./precompute";
import {
  DEFAULT_COV_QC,
  covQcCounts,
  covQcFailedIds,
  covQcStatus,
  hideLowQcFromSearch,
  resolveThresholds,
  thresholdsFromSearch,
  withCovQcFields,
  withCovQcSearch,
  withQcColumn,
} from "./cellQc";

// synthetic cells for the test only
const good = { cell_id: "a", qc_mapd: 0.08, qc_zero_bin_frac: 0.002, qc_cn0_frac: 0, qc_seg_per_gb: 40 };
const noisy = { cell_id: "b", qc_mapd: 0.5, qc_zero_bin_frac: 0.002, qc_cn0_frac: 0, qc_seg_per_gb: 40 };
const dropout = { cell_id: "c", qc_mapd: 0.1, qc_zero_bin_frac: 0.4, qc_cn0_frac: 0.9, qc_seg_per_gb: 10 };
const noMetrics = { cell_id: "d" };

describe("coverage QC", () => {
  it("passes good cells and lists every failing reason", () => {
    expect(covQcStatus(good)).toEqual({ has: true, pass: true, reasons: [] });
    expect(covQcStatus(noisy).reasons).toEqual(["noisy coverage"]);
    expect(covQcStatus(dropout).reasons).toEqual(["coverage dropout", "CN 0 over much of the genome"]);
  });
  it("never fails cells without metrics", () => {
    expect(covQcStatus(noMetrics)).toEqual({ has: false, pass: true, reasons: [] });
    expect([...covQcFailedIds([good, noisy, dropout, noMetrics])].sort()).toEqual(["b", "c"]);
  });
  it("follows edited thresholds", () => {
    expect(covQcFailedIds([good, noisy], { mapd: 0.05 }).size).toBe(2);
    expect(covQcFailedIds([good, noisy], { mapd: 0.9 }).size).toBe(0);
    expect(covQcCounts([good, noisy, dropout], { mapd: 0.05 })).toMatchObject({ mapd: 3, zero: 1, cn0: 1 });
  });
  it("ignores unknown or non-numeric thresholds", () => {
    expect(resolveThresholds({ bogus: 1, mapd: "x" })).toEqual(DEFAULT_COV_QC);
  });
  it("adds the QC annotation fields only when metrics exist", () => {
    const cells = [good, noisy];
    const out = withCovQcFields(cells);
    expect(out.map((c) => c.QC)).toEqual(["pass", "fail"]);
    expect(out[1]["QC reason"]).toBe("noisy coverage");
    const bare = [noMetrics];
    expect(withCovQcFields(bare)).toBe(bare);
  });
  it("reads and writes the URL", () => {
    expect(hideLowQcFromSearch("?hidelowqc=1&tab=7")).toBe(true);
    expect(hideLowQcFromSearch("?hidelowqc=0")).toBe(false);
    expect(hideLowQcFromSearch("?tab=7")).toBeNull();
    expect(thresholdsFromSearch("?qcthr=mapd:0.3,bogus:1,zero:x")).toEqual({ mapd: 0.3 });
    expect(thresholdsFromSearch("?tab=7")).toBeNull();
    expect(withCovQcSearch("?tab=7", true)).toBe("?tab=7&hidelowqc=1");
    expect(withCovQcSearch("?tab=7", true, { mapd: 0.3 })).toBe("?tab=7&hidelowqc=1&qcthr=mapd%3A0.3");
    expect(withCovQcSearch("?tab=7&hidelowqc=1&qcthr=mapd:0.3", false)).toBe("?tab=7");
  });
  it("feeds the global cell filter only when the toggle is on", () => {
    const cells = [good, noisy, dropout, noMetrics];
    expect([...excludedCellIds(cells, [], [])]).toEqual([]);
    expect([...excludedCellIds(cells, [], [], { on: false })]).toEqual([]);
    expect([...excludedCellIds(cells, [], ["a"], { on: true })].sort()).toEqual(["a", "b", "c"]);
    expect([...excludedCellIds(cells, [], [], { on: true, thresholds: { mapd: 0.9, zero: 0.9, cn0: 0.99 } })]).toEqual([]);
  });
  it("adds the QC strip once, only when it varies", () => {
    expect(withQcColumn(["state", "gone"], ["state", "QC"])).toEqual(["state", "QC"]);
    expect(withQcColumn(["QC"], ["QC"])).toEqual(["QC"]);
    expect(withQcColumn(["state"], ["state"])).toEqual(["state"]);
  });
});
