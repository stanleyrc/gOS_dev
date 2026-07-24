import axios from "axios";
import { tableFromIPC } from "apache-arrow";
import { datafilesArrowTableToJson } from "./utility";
import { qcEvaluator } from "./metadata";

const ARROW_PATH_PATTERN = /\.arrow(?:$|[?#])/i;
const manifestCache = new Map();
const MAX_MANIFEST_CACHE_ENTRIES = 25;

export const clearStaticManifestCache = () => manifestCache.clear();

export const isArrowManifest = (dataset = {}) =>
  ARROW_PATH_PATTERN.test(`${dataset.datafilesPath || ""}`);

export const getManifestRequestConfig = (dataset = {}, options = {}) => ({
  ...options,
  responseType: isArrowManifest(dataset) ? "arraybuffer" : "json",
});

const normalizeSummaryTags = (record = {}) =>
  record.summary_tag
    ? record.summary_tag.map(
        (entry) => `${entry.key.trim()}: ${entry.value.trim()}`,
      )
    : record.summary
        ?.split("\n")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0) || [];

export const normalizeManifestRecord = (record = {}, dataset = {}) => {
  const caseReportId =
    record.caseReportId ??
    record.case_id_clean ??
    record.case_id ??
    record.pair ??
    record.id ??
    null;
  const tags = Array.isArray(record.tags)
    ? record.tags
    : normalizeSummaryTags(record);
  const visibleTags = Array.isArray(record.visibleTags)
    ? record.visibleTags
    : record.summary_tag
      ? record.summary_tag
          .filter((entry) => entry.visible)
          .map((entry) => `${entry.key.trim()}: ${entry.value.trim()}`)
      : tags;
  const qcMetrics = record.qcMetrics || [];

  return {
    ...record,
    datasetId: dataset.id == null ? null : `${dataset.id}`,
    caseReportId:
      caseReportId == null || `${caseReportId}`.trim() === ""
        ? null
        : `${caseReportId}`,
    sourceDatasetTitle: dataset.title || dataset.id,
    tags,
    visibleTags,
    qcMetrics,
    qcEvaluation: record.qcEvaluation || qcEvaluator(qcMetrics),
  };
};

export const parseManifestResponse = async (responseData, dataset = {}) => {
  let records = responseData;

  if (isArrowManifest(dataset)) {
    const arrowBuffer = new Uint8Array(responseData);
    const table = await tableFromIPC(arrowBuffer);
    records = datafilesArrowTableToJson(table);
  }

  if (!Array.isArray(records)) {
    throw new TypeError(`Dataset ${dataset.id || "unknown"} manifest is not an array`);
  }

  return records.map((record) => normalizeManifestRecord(record, dataset));
};

export const loadDatasetManifest = async (dataset, options = {}) => {
  if (!dataset?.datafilesPath) {
    throw new Error(`Dataset ${dataset?.id || "unknown"} has no datafilesPath`);
  }

  const cacheKey = JSON.stringify([dataset.id, dataset.datafilesPath]);
  if (manifestCache.has(cacheKey)) {
    return manifestCache.get(cacheKey);
  }

  if (manifestCache.size >= MAX_MANIFEST_CACHE_ENTRIES) {
    manifestCache.delete(manifestCache.keys().next().value);
  }
  const load = axios
    .get(dataset.datafilesPath, getManifestRequestConfig(dataset, options))
    .then((response) => parseManifestResponse(response.data, dataset));
  manifestCache.set(cacheKey, load);

  try {
    const records = await load;
    manifestCache.set(cacheKey, records);
    return records;
  } catch (error) {
    manifestCache.delete(cacheKey);
    throw error;
  }
};

const configuredManifestLoads = (datasets, cachedRecordsByDataset) =>
  datasets.map(async (dataset) => {
    const cached = cachedRecordsByDataset?.[dataset.id];
    return [
      dataset.id,
      Array.isArray(cached)
        ? cached
        : await loadDatasetManifest(dataset),
    ];
  });

export const loadConfiguredManifests = async (
  datasets = [],
  cachedRecordsByDataset = {},
) =>
  Object.fromEntries(
    await Promise.all(
      configuredManifestLoads(datasets, cachedRecordsByDataset),
    ),
  );

export const loadConfiguredManifestsWithStatus = async (
  datasets = [],
  cachedRecordsByDataset = {},
) => {
  const settledLoads = await Promise.allSettled(
    configuredManifestLoads(datasets, cachedRecordsByDataset),
  );
  const entries = settledLoads
    .filter(({ status }) => status === "fulfilled")
    .map(({ value }) => value);
  const failures = settledLoads.filter(({ status }) => status === "rejected");
  if (entries.length === 0 && failures.length > 0) {
    throw failures[0].reason;
  }

  return {
    recordsByDataset: Object.fromEntries(entries),
    failedDatasetCount: failures.length,
  };
};
