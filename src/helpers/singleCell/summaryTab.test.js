import { SUMMARY_SECTION_ORDER, SUMMARY_DEFAULT_OPEN, summaryStoryChapters } from "./summaryTab";

describe("summaryTab", () => {
  const about = (b, id) => (b.includes(id) ? [b] : []);
  it("orders sections vignette, clonal history, timing, report, story", () => {
    expect(SUMMARY_SECTION_ORDER).toEqual(["vignette", "clonal-history", "timing-rates", "full-report", "story"]);
    SUMMARY_DEFAULT_OPEN.forEach((k) => expect(SUMMARY_SECTION_ORDER).toContain(k));
  });
  it("keeps only cohort sentences that mention the patient and drops empty chapters", () => {
    const r = summaryStoryChapters(
      { vignettes: [{ id: "v-1" }], chapters: [{ title: "A", body: ["P1 has ecDNA.", "P2 does not."] }, { title: "B", body: ["P2 only."] }] },
      "P1", about, "In the cohort", "lede");
    expect(r.vignettes).toHaveLength(1);
    expect(r.cohort.body).toEqual(["A: P1 has ecDNA."]);
  });
  it("has no cohort chapter without chapters", () => {
    expect(summaryStoryChapters({ vignettes: [], chapters: [] }, "P1", about, "t", "l").cohort).toBeNull();
    expect(summaryStoryChapters(null, "P1", about, "t", "l").cohort).toBeNull();
  });
});
