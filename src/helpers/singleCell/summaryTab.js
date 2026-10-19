// Layout of the Summary tab (12): the former Report and Story tabs merged. Pure and deterministic; no generated text.
export const SUMMARY_SECTION_ORDER = ["vignette", "portrait", "clonal-history", "event-order", "timing-rates", "full-report", "story"];

/** Which sections open expanded. The brief and clonal history lead; the long ones start collapsed. */
export const SUMMARY_DEFAULT_OPEN = ["portrait", "clonal-history", "event-order", "timing-rates"];

/**
 * The story part of the tab for the open patient: its own vignette chapters, and one "in the cohort" chapter
 * of the cohort sentences that name the patient. `sentencesAbout` is injected so this stays free of story internals.
 */
export function summaryStoryChapters(storyForPatientResult, id, sentencesAbout, cohortTitle, cohortLede) {
  const { vignettes = [], chapters = [] } = storyForPatientResult || {};
  const body = chapters
    .map((c) => `${c.title}: ${c.body.flatMap((b) => sentencesAbout(b, id)).join(" ")}`)
    .filter((b) => !b.endsWith(": "));
  const cohort = chapters.length
    ? { id: "cohort", title: cohortTitle, lede: cohortLede, body, stats: [], figure: null }
    : null;
  return { vignettes, cohort };
}
