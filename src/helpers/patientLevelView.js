import { defaultSearchFilters } from "./utility";

export const PATIENT_LEVEL_VIEW_TARGET = Object.freeze({
  tab: "aggregations",
  aggregationsTab: "visualization",
  visualizationPreset: "topGenes",
  focusVisualization: true,
});

export const buildPatientLevelSearchFilters = (patientId) => {
  const normalizedPatientId =
    typeof patientId === "string" ? patientId.trim() : "";

  return {
    ...defaultSearchFilters(),
    patient_id: normalizedPatientId ? [normalizedPatientId] : [],
  };
};
