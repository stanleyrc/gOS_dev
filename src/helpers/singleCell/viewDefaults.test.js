import { DEFAULT_CASE_PAGE_SIZE, DEFAULT_SNV_METRIC } from "./viewDefaults";
import fs from "fs";
import path from "path";

const src = (p) => fs.readFileSync(path.join(__dirname, "../..", p), "utf8");

describe("view defaults", () => {
  it("values", () => {
    expect(DEFAULT_SNV_METRIC).toBe("vaf");
    expect(DEFAULT_CASE_PAGE_SIZE).toBe(50);
  });
  it("single-cell reducer and case report state use them", () => {
    expect(src("redux/singleCell/reducer.js")).toMatch(/snvMetric: DEFAULT_SNV_METRIC/);
    expect(src("redux/caseReports/reducer.js")).toMatch(/per_page: DEFAULT_CASE_PAGE_SIZE/);
    expect(src("helpers/utility.js")).toMatch(/per_page: DEFAULT_CASE_PAGE_SIZE/);
  });
  it("no leftover 25 per page in the case list", () => {
    expect(src("containers/listView/index.js")).not.toMatch(/per_page(: | \|\| )25\b/);
  });
});
