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
});
