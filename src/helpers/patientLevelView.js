import { ALL_DATASETS_ROUTE_VALUE } from "./browseScope";
import { defaultSearchFilters } from "./utility";

const PATIENT_LEVEL_VIEW_ROUTE_VALUE = "patient-aggregations";
const PATIENT_LEVEL_VIEW_PARAM = "view";
const PATIENT_ID_PARAM = "patient_id";
const DETAIL_ROUTE_PARAMS = ["dataset", "report", "gene", "tab"];

const normalizePatientId = (patientId) =>
  typeof patientId === "string" ? patientId.trim() : "";

const parseUrl = (location) => {
  try {
    return new URL(location);
  } catch (error) {
    return null;
  }
};

export const PATIENT_LEVEL_VIEW_TARGET = Object.freeze({
  tab: "aggregations",
  aggregationsTab: "visualization",
  visualizationPreset: "topGenes",
  focusVisualization: true,
});

export const buildPatientLevelSearchFilters = (patientId) => {
  const normalizedPatientId = normalizePatientId(patientId);

  return {
    ...defaultSearchFilters(),
    patient_id: normalizedPatientId ? [normalizedPatientId] : [],
  };
};

export const buildPatientLevelViewUrl = (currentLocation, patientId) => {
  const url = parseUrl(currentLocation);
  const normalizedPatientId = normalizePatientId(patientId);
  if (!url || !normalizedPatientId) return null;

  url.searchParams.set("scope", ALL_DATASETS_ROUTE_VALUE);
  url.searchParams.set(PATIENT_LEVEL_VIEW_PARAM, PATIENT_LEVEL_VIEW_ROUTE_VALUE);
  url.searchParams.set(PATIENT_ID_PARAM, normalizedPatientId);
  DETAIL_ROUTE_PARAMS.forEach((param) => url.searchParams.delete(param));

  return url;
};

export const getPatientLevelViewOptions = (currentLocation) => {
  const url = parseUrl(currentLocation);
  if (
    !url ||
    url.searchParams.get("scope") !== ALL_DATASETS_ROUTE_VALUE ||
    url.searchParams.get(PATIENT_LEVEL_VIEW_PARAM) !==
      PATIENT_LEVEL_VIEW_ROUTE_VALUE
  ) {
    return null;
  }

  const patientId = normalizePatientId(url.searchParams.get(PATIENT_ID_PARAM));
  if (!patientId) return null;

  return {
    searchFilters: buildPatientLevelSearchFilters(patientId),
    listViewTarget: PATIENT_LEVEL_VIEW_TARGET,
  };
};
