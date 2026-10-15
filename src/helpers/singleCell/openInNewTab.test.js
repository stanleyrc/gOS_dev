import { caseReportUrl, getOpenInNewTab, setOpenInNewTab, setCohortMounted, isCohortMounted } from "./openInNewTab";

describe("openInNewTab", () => {
  it("builds a report URL that keeps only dataset and report", () => {
    expect(caseReportUrl("https://host/app/?dataset=ds1&scview=events&evf=x", "ds1", "P9")).toBe("https://host/app/?dataset=ds1&report=P9");
  });
  it("defaults to on and remembers the choice", () => {
    window.localStorage.clear();
    expect(getOpenInNewTab()).toBe(true);
    setOpenInNewTab(false);
    expect(getOpenInNewTab()).toBe(false);
    setOpenInNewTab(true);
    expect(getOpenInNewTab()).toBe(true);
  });
  it("tracks whether the cohort view is mounted", () => {
    expect(isCohortMounted()).toBe(false);
    setCohortMounted(true);
    expect(isCohortMounted()).toBe(true);
    setCohortMounted(false);
  });
});
