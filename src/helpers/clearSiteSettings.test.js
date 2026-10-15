import { resetUrl, settingsKeysToClear } from "./clearSiteSettings";

describe("settingsKeysToClear", () => {
  it("clears display settings but keeps notes, scratchpads and saved searches", () => {
    const keys = [
      "gos.singleCell.layout",
      "gos.singleCell.cnPalette",
      "gos-theme",
      "gos.filteredEventsColumnLayout.v1",
      "gos.help.patient",
      "gos.savedSearches.v1",
      "event_notes_EGFR_7:55",
      "event_scratchpad_EGFR_7:55",
      "unrelated",
    ];
    expect(settingsKeysToClear(keys).sort()).toEqual(
      ["gos-theme", "gos.filteredEventsColumnLayout.v1", "gos.help.patient", "gos.singleCell.cnPalette", "gos.singleCell.layout"].sort()
    );
  });
  it("handles no keys", () => {
    expect(settingsKeysToClear(undefined)).toEqual([]);
  });
});

describe("resetUrl", () => {
  it("keeps dataset, report and tab and drops view parameters", () => {
    expect(resetUrl("https://x.org/g/?dataset=gbm-sc&report=MGH303&tab=7&heatmap=snv&snfilter=a:b&spmap=beside")).toBe(
      "https://x.org/g/?dataset=gbm-sc&report=MGH303&tab=7"
    );
  });
});
