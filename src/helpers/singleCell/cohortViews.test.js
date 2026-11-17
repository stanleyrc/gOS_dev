import { COHORT_VIEWS, COHORT_VIEW_GROUPS, cohortView, paperFigureLabel, resolveCohortView, startsGroup } from "./cohortViews";
import en from "../../translations/en/common.json";

describe("cohort views", () => {
  it("has unique keys in known groups, groups contiguous", () => {
    const keys = COHORT_VIEWS.map((v) => v.key);
    expect(new Set(keys).size).toBe(keys.length);
    COHORT_VIEWS.forEach((v) => expect(COHORT_VIEW_GROUPS).toContain(v.group));
    const order = COHORT_VIEWS.map((v) => v.group).filter((g, i, a) => i === 0 || a[i - 1] !== g);
    expect(order).toEqual(COHORT_VIEW_GROUPS);
  });
  it("leads with the paper's figure tabs, then the overview and the findings views", () => {
    expect(COHORT_VIEWS.slice(0, 3).map((v) => v.key)).toEqual(["paperfig1", "paperfig2", "paperfig3"]);
    const k = COHORT_VIEWS.findIndex((v) => v.group !== "paper");
    expect(COHORT_VIEWS.slice(k, k + 3).map((v) => v.key)).toEqual(["overview", "portrait", "reports"]);
    expect(paperFigureLabel("paperfigS1")).toBe("Fig S1");
    expect(paperFigureLabel("overview")).toBeNull();
    expect(paperFigureLabel("paperfigS16c")).toBe("Fig S16c");
  });
  it("shows the v7 figure tabs; the 11-09 supplements resolve from old links but get no tab", () => {
    const { viewsInGroup } = require("./cohortViews");
    const tabs = viewsInGroup("paper").map((v) => v.key);
    expect(tabs).toContain("paperfigS8");
    expect(tabs).toContain("paperfigS15");
    expect(tabs).not.toContain("paperfigV1");
    expect(resolveCohortView("paperfigV1")).toBe("paperfigV1");
  });
  it("derives the figure tabs from the manifest (current figures only, variants folded)", () => {
    const { paperTabsOf } = require("./cohortViews");
    const figs = [{ label: "Fig 1", group: "main" }, { label: "Fig 2", group: "main" }, { label: "Fig S10", group: "supplementary" }, { label: "Fig S10 method", group: "supplementary" },
      { label: "Fig S16c", group: "supplementary" }, { label: "Fig S1 (11-09)", group: "previous" }, { label: "Fig 1", group: "previous" }];
    expect(paperTabsOf(figs)).toEqual(["1", "2", "S10", "S16c"]);
    expect(paperTabsOf(null)[0]).toBe("1");
    expect(resolveCohortView("paperfigS12")).toBe("paperfigS12");
    expect(cohortView("paperfigS99").group).toBe("paper");
  });
  it("resolves unknown keys to the overview", () => {
    expect(resolveCohortView("qc")).toBe("qc");
    expect(resolveCohortView("nope")).toBe("overview");
    expect(resolveCohortView(null)).toBe("overview");
    expect(cohortView("nope").key).toBe("overview");
  });
  it("marks the first view of each group after the first", () => {
    expect(COHORT_VIEWS.filter((v) => startsGroup(v.key)).map((v) => v.key)).toEqual(["overview", "drivers", "treeshape", "rna", "events", "welcome"]);
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
