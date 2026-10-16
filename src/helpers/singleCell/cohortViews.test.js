import { COHORT_VIEWS, COHORT_VIEW_GROUPS, cohortView, resolveCohortView, startsGroup } from "./cohortViews";
import en from "../../translations/en/common.json";

describe("cohort views", () => {
  it("has unique keys in known groups, groups contiguous", () => {
    const keys = COHORT_VIEWS.map((v) => v.key);
    expect(new Set(keys).size).toBe(keys.length);
    COHORT_VIEWS.forEach((v) => expect(COHORT_VIEW_GROUPS).toContain(v.group));
    const order = COHORT_VIEWS.map((v) => v.group).filter((g, i, a) => i === 0 || a[i - 1] !== g);
    expect(order).toEqual(COHORT_VIEW_GROUPS);
  });
  it("leads with the overview and the findings views", () => {
    expect(COHORT_VIEWS.slice(0, 3).map((v) => v.key)).toEqual(["overview", "portrait", "reports"]);
  });
  it("resolves unknown keys to the overview", () => {
    expect(resolveCohortView("qc")).toBe("qc");
    expect(resolveCohortView("nope")).toBe("overview");
    expect(resolveCohortView(null)).toBe("overview");
    expect(cohortView("nope").key).toBe("overview");
  });
  it("marks the first view of each group after the first", () => {
    expect(COHORT_VIEWS.filter((v) => startsGroup(v.key)).map((v) => v.key)).toEqual(["drivers", "rna", "events"]);
  });
  it("every view and group has a label and a purpose", () => {
    const c = en.components["single-cell"].cohort;
    COHORT_VIEWS.forEach((v) => {
      expect([v.key, typeof c[`view-${v.key}`]]).toEqual([v.key, "string"]);
      expect([v.key, typeof c[`purpose-${v.key}`]]).toEqual([v.key, "string"]);
    });
    COHORT_VIEW_GROUPS.forEach((g) => expect(typeof c[`group-${g}`]).toBe("string"));
  });
});
