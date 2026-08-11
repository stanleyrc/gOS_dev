/** @jest-environment node */
/* eslint-disable import/first */

jest.mock("./utility", () => ({
  defaultSearchFilters: () => ({
    page: 1,
    per_page: 10,
    texts: "",
    orderId: 1,
  }),
}));

import {
  buildPatientLevelSearchFilters,
  buildPatientLevelViewUrl,
  getPatientLevelViewOptions,
  PATIENT_LEVEL_VIEW_TARGET,
} from "./patientLevelView";

describe("patient-level view", () => {
  it("starts a clean search filtered to the normalized patient ID", () => {
    expect(buildPatientLevelSearchFilters(" PATIENT-1 ")).toEqual({
      page: 1,
      per_page: 10,
      texts: "",
      orderId: 1,
      patient_id: ["PATIENT-1"],
    });
  });

  it("targets the Top 20 driver-gene heatmap in Aggregations", () => {
    expect(PATIENT_LEVEL_VIEW_TARGET).toEqual({
      tab: "aggregations",
      aggregationsTab: "visualization",
      visualizationPreset: "topGenes",
      focusVisualization: true,
    });
  });

  it("builds a global patient-aggregation deep link without detail state", () => {
    const url = buildPatientLevelViewUrl(
      "https://gos.test/app?dataset=dataset-1&report=case-1&gene=TP53&tab=3&location=1%3A1-10",
      " PATIENT/1 ",
    );

    expect(url.origin).toBe("https://gos.test");
    expect(url.pathname).toBe("/app");
    expect(url.searchParams.get("scope")).toBe("all");
    expect(url.searchParams.get("view")).toBe("patient-aggregations");
    expect(url.searchParams.get("patient_id")).toBe("PATIENT/1");
    expect(url.searchParams.get("location")).toBe("1:1-10");
    expect(url.searchParams.has("dataset")).toBe(false);
    expect(url.searchParams.has("report")).toBe(false);
    expect(url.searchParams.has("gene")).toBe(false);
    expect(url.searchParams.has("tab")).toBe(false);
  });

  it("parses a patient-aggregation deep link into browse options", () => {
    expect(
      getPatientLevelViewOptions(
        "https://gos.test/app?scope=all&view=patient-aggregations&patient_id=PATIENT-1",
      ),
    ).toEqual({
      searchFilters: {
        page: 1,
        per_page: 10,
        texts: "",
        orderId: 1,
        patient_id: ["PATIENT-1"],
      },
      listViewTarget: PATIENT_LEVEL_VIEW_TARGET,
    });
  });

  it("rejects incomplete or unrelated patient-view URLs", () => {
    expect(
      buildPatientLevelViewUrl("https://gos.test/app", "   "),
    ).toBeNull();
    expect(
      getPatientLevelViewOptions(
        "https://gos.test/app?scope=all&view=patient-aggregations",
      ),
    ).toBeNull();
    expect(
      getPatientLevelViewOptions(
        "https://gos.test/app?scope=all&patient_id=PATIENT-1",
      ),
    ).toBeNull();
  });
});
