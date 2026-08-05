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

export const fieldIdentifier = (field = {}) =>
  typeof field === "string" ? field : field?.id || field?.name;

export const datasetHasField = (dataset, field) => {
  const id = fieldIdentifier(field);
  if (!dataset || !id) return false;
  if (!Array.isArray(dataset.fields)) return true;
  return dataset.fields.some(
    (candidate) => fieldIdentifier(candidate) === id,
  );
};

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

export const resolveSourceDataset = (
  record = {},
  datasets = [],
  fallbackDataset = null,
) => {
  const datasetId = normalizeIdentityPart(record?.datasetId);
  const sourceDataset = (datasets || []).find(
    (dataset) => `${dataset?.id}` === datasetId,
  );
  if (sourceDataset) return sourceDataset;

  if (
    fallbackDataset &&
    fallbackDataset.isAllDatasets !== true &&
    (!datasetId || `${fallbackDataset.id}` === datasetId)
  ) {
    return fallbackDataset;
  }

  if (!datasetId && (datasets || []).length === 1) {
    return datasets[0];
  }

  return null;
};

export const sourceDatasetHasField = (
  record,
  datasets,
  field,
  fallbackDataset = null,
) =>
  datasetHasField(
    resolveSourceDataset(record, datasets, fallbackDataset),
    field,
  );

const getValueByPath = (record, path) =>
  `${path}`
    .split(".")
    .reduce((value, key) => (value == null ? value : value[key]), record);

export const getSourceScopedFieldValue = (
  record,
  datasets,
  field,
  fallbackDataset = null,
) => {
  const id = fieldIdentifier(field);
  return id &&
    sourceDatasetHasField(record, datasets, id, fallbackDataset)
    ? getValueByPath(record, id)
    : undefined;
};

const ALWAYS_PROJECTED_RECORD_FIELDS = [
  "datasetId",
  "caseReportId",
  "id",
  "pair",
  "summary",
  "qcEvaluation",
];

const PRESENTATION_FIELD_CONSTITUENTS = {
  tumor_median_coverage: ["normal_median_coverage"],
};

const setValueByPath = (target, path, value) => {
  const parts = `${path}`.split(".");
  const leaf = parts.pop();
  const parent = parts.reduce((current, part) => {
    if (!current[part] || typeof current[part] !== "object") {
      current[part] = {};
    }
    return current[part];
  }, target);
  parent[leaf] = value;
};

export const projectSourceRecordFields = (
  record = {},
  datasets = [],
  fallbackDataset = null,
) => {
  const sourceDataset = resolveSourceDataset(
    record,
    datasets,
    fallbackDataset,
  );
  if (sourceDataset && !Array.isArray(sourceDataset.fields)) {
    return { ...record };
  }

  const projected = {};
  ALWAYS_PROJECTED_RECORD_FIELDS.forEach((path) => {
    const value = getValueByPath(record, path);
    if (value !== undefined) setValueByPath(projected, path, value);
  });
  (sourceDataset?.fields || []).forEach((field) => {
    const id = fieldIdentifier(field);
    if (
      fallbackDataset?.isAllDatasets === true &&
      !datasetHasField(fallbackDataset, id)
    ) {
      return;
    }
    const paths = id
      ? [id, ...(PRESENTATION_FIELD_CONSTITUENTS[id] || [])]
      : [];
    paths.forEach((path) => {
      const value = getValueByPath(record, path);
      if (value !== undefined) setValueByPath(projected, path, value);
    });
  });
  return projected;
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

const caseIdentityKey = (record = {}) =>
  normalizeIdentityPart(record.caseReportId ?? record.pair ?? record.id);

const mergeUniqueValues = (left, right) => {
  const values = [];
  [left, right].flat().forEach((value) => {
    const normalized = normalizeIdentityPart(value);
    if (normalized && !values.includes(normalized)) values.push(normalized);
  });
  return values.length <= 1 ? values[0] || null : values;
};

const withDatasetTitleFallback = (record = {}) => ({
  ...record,
  sourceDatasetTitle: record.sourceDatasetTitle || record.datasetId,
});

export const distinctCaseRecords = (records = []) => {
  const recordsByCase = new Map();

  records.forEach((record, index) => {
    const recordWithFallback = withDatasetTitleFallback(record);
    const key =
      caseIdentityKey(recordWithFallback) ||
      sourceCaseIdentityKey(recordWithFallback) ||
      `__row_${index}`;
    const existing = recordsByCase.get(key);
    if (!existing) {
      recordsByCase.set(key, recordWithFallback);
      return;
    }

    const preferredRecord =
      existing.visible === false && recordWithFallback.visible !== false
        ? recordWithFallback
        : existing;
    recordsByCase.set(key, {
      ...preferredRecord,
      sourceDatasetTitle: mergeUniqueValues(
        existing.sourceDatasetTitle,
        recordWithFallback.sourceDatasetTitle,
      ),
    });
  });

  return Array.from(recordsByCase.values());
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
