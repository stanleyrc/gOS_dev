import Field from "./field";

export const ALL_DATASETS_SCOPE_VALUE = "__all_accessible_datasets__";
export const ALL_DATASETS_ROUTE_VALUE = "all";
export const ALL_DATASETS_TITLE = "All accessible datasets";

export const allDatasetsBrowseScope = () => ({ kind: "all" });

export const datasetBrowseScope = (datasetId) => {
  if (datasetId == null || `${datasetId}`.trim() === "") {
    return null;
  }

  return { kind: "dataset", datasetId: `${datasetId}` };
};

export const isAllDatasetsBrowseScope = (browseScope) =>
  browseScope?.kind === "all";

export const hasBrowseScope = (browseScope) =>
  isAllDatasetsBrowseScope(browseScope) ||
  (browseScope?.kind === "dataset" &&
    browseScope.datasetId != null &&
    `${browseScope.datasetId}`.trim() !== "");

export const getBrowseScopeDatasetId = (browseScope) =>
  isAllDatasetsBrowseScope(browseScope)
    ? null
    : browseScope?.kind === "dataset"
      ? browseScope.datasetId
      : null;

const fieldIdentifier = (field = {}) => field.id || field.name;

export const buildAllDatasetsMetadata = (datasets = []) => {
  const fieldsById = new Map();
  const incompatibleFieldIds = new Set();

  datasets.forEach((dataset) => {
    (dataset?.fields || []).forEach((definition) => {
      const field = new Field(definition || {});
      const id = fieldIdentifier(field);
      if (!id || !field.isValid || incompatibleFieldIds.has(id)) return;

      const existing = fieldsById.get(id);
      if (!existing) {
        fieldsById.set(id, field);
        return;
      }

      const compatible =
        existing.type === field.type &&
        existing.renderer === field.renderer &&
        existing.external === field.external;
      if (!compatible) {
        fieldsById.delete(id);
        incompatibleFieldIds.add(id);
        return;
      }

      if (!existing.kpiPlot && field.kpiPlot) {
        fieldsById.set(id, new Field({ ...existing, kpiPlot: true }));
      }
    });
  });

  const fields = Array.from(fieldsById.values());

  return {
    id: null,
    title: ALL_DATASETS_TITLE,
    isAllDatasets: true,
    fields,
    kpiFields: fields.filter((field) => field.kpiPlot === true),
  };
};

export const resolveBrowseDataset = (state = {}) => {
  const browseScope = state.Settings?.browseScope;
  const selectedDataset = state.Settings?.dataset || null;
  const datasets = state.Datasets?.records || [];

  if (isAllDatasetsBrowseScope(browseScope)) {
    return buildAllDatasetsMetadata(datasets);
  }

  if (browseScope?.kind === "dataset") {
    if (`${selectedDataset?.id}` === `${browseScope.datasetId}`) {
      return selectedDataset;
    }

    return (
      datasets.find(
        (dataset) => `${dataset?.id}` === `${browseScope.datasetId}`,
      ) || null
    );
  }

  return selectedDataset;
};

export const resolveBrowseDatasets = (state = {}) => {
  const browseScope = state.Settings?.browseScope;
  const datasets = state.Datasets?.records || [];

  if (isAllDatasetsBrowseScope(browseScope)) {
    return datasets;
  }

  const dataset = resolveBrowseDataset(state);
  return dataset ? [dataset] : [];
};

const normalizeIdentityPart = (value) => {
  if (value == null || `${value}`.trim() === "") return null;
  return `${value}`;
};

export const getSourceCaseIdentity = (record = {}) => {
  const datasetId = normalizeIdentityPart(record?.datasetId);
  const caseReportId = normalizeIdentityPart(
    record?.caseReportId ?? record?.id,
  );

  return datasetId && caseReportId ? { datasetId, caseReportId } : null;
};

export const sourceCaseIdentityKey = (record) => {
  const identity = getSourceCaseIdentity(record);
  return identity
    ? JSON.stringify([identity.datasetId, identity.caseReportId])
    : null;
};

export const buildCaseReportUrl = (
  currentLocation,
  sourceCase,
  browseScope,
) => {
  const identity = getSourceCaseIdentity(sourceCase);
  if (!identity) return null;

  const url = new URL(currentLocation);
  if (isAllDatasetsBrowseScope(browseScope)) {
    url.searchParams.set("scope", ALL_DATASETS_ROUTE_VALUE);
  } else {
    url.searchParams.delete("scope");
  }
  url.searchParams.set("dataset", identity.datasetId);
  url.searchParams.set("report", identity.caseReportId);
  url.searchParams.delete("gene");

  return url;
};
