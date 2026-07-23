import axios from "axios";
import { tableFromIPC } from "apache-arrow";
import { datafilesArrowTableToJson } from "../../helpers/utility";

const ISO_DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ARROW_PATH_PATTERN = /\.arrow(?:$|[?#])/i;
const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const patientCaseSearchCache = new Map();
const MAX_PATIENT_SEARCH_CACHE_ENTRIES = 20;

const compareText = (left, right) => {
  const leftText = `${left ?? ""}`;
  const rightText = `${right ?? ""}`;

  if (leftText < rightText) return -1;
  if (leftText > rightText) return 1;
  return 0;
};

const normalizeNonEmptyString = (value) => {
  if (typeof value !== "string") return null;

  const normalized = value.trim();
  return normalized || null;
};

const isLeapYear = (year) =>
  year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);

export const normalizePatientId = normalizeNonEmptyString;

export const parseSpecimenDate = (value) => {
  if (typeof value !== "string") return null;

  const match = ISO_DATE_ONLY_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return null;

  const daysInMonth =
    month === 2 && isLeapYear(year) ? 29 : DAYS_PER_MONTH[month - 1];

  return day <= daysInMonth ? value : null;
};

export const patientCaseIdentityKey = (identity = {}) =>
  JSON.stringify([identity?.datasetId ?? null, identity?.caseReportId ?? null]);

export const isSamePatientCase = (left, right) =>
  Boolean(
    left &&
      right &&
      left.datasetId === right.datasetId &&
      left.caseReportId === right.caseReportId
  );

export const normalizePatientCase = (record = {}) => {
  const datasetId = normalizeNonEmptyString(record?.datasetId);
  const caseReportId =
    normalizeNonEmptyString(record?.caseReportId) ||
    normalizeNonEmptyString(record?.case_id_clean) ||
    normalizeNonEmptyString(record?.case_id) ||
    normalizeNonEmptyString(record?.pair) ||
    normalizeNonEmptyString(record?.id);
  if (!datasetId || !caseReportId) return null;

  const pair = normalizeNonEmptyString(record?.pair) || caseReportId;
  const rawSpecimenDate =
    record?.values?.specimen_date ?? record?.specimen_date ?? null;

  return {
    identity: { datasetId, caseReportId },
    pair,
    specimenDate: parseSpecimenDate(rawSpecimenDate),
  };
};

export const sortPatientCases = (cases = []) =>
  [...cases].sort((left, right) => {
    if (left.specimenDate && !right.specimenDate) return -1;
    if (!left.specimenDate && right.specimenDate) return 1;

    if (left.specimenDate && right.specimenDate) {
      const dateOrder = compareText(right.specimenDate, left.specimenDate);
      if (dateOrder !== 0) return dateOrder;
    }

    const pairOrder = compareText(left.pair, right.pair);
    if (pairOrder !== 0) return pairOrder;

    const datasetOrder = compareText(
      left.identity?.datasetId,
      right.identity?.datasetId
    );
    if (datasetOrder !== 0) return datasetOrder;

    return compareText(
      left.identity?.caseReportId,
      right.identity?.caseReportId
    );
  });

export const combinePatientCasePages = (pages = []) => {
  const casesByIdentity = new Map();

  pages.forEach((records) => {
    if (!Array.isArray(records)) return;

    records.forEach((record) => {
      const patientCase = normalizePatientCase(record);
      if (!patientCase) return;

      const identityKey = patientCaseIdentityKey(patientCase.identity);
      if (!casesByIdentity.has(identityKey)) {
        casesByIdentity.set(identityKey, patientCase);
      }
    });
  });

  return sortPatientCases([...casesByIdentity.values()]);
};

export const isArrowDatafilesPath = (datafilesPath) =>
  typeof datafilesPath === "string" && ARROW_PATH_PATTERN.test(datafilesPath);

export const clearPatientCaseSearchCache = () =>
  patientCaseSearchCache.clear();

export const loadDatasetDatafiles = async (dataset, config = {}) => {
  const datasetId = normalizeNonEmptyString(dataset?.id);
  const datafilesPath = normalizeNonEmptyString(dataset?.datafilesPath);
  if (!datasetId || !datafilesPath) {
    throw new TypeError("Patient case search requires configured dataset sources");
  }

  const isArrow = isArrowDatafilesPath(datafilesPath);
  const response = await axios.get(datafilesPath, {
    ...config,
    responseType: isArrow ? "arraybuffer" : "json",
  });

  let records = response?.data;
  if (isArrow) {
    const arrowBuffer =
      records instanceof Uint8Array ? records : new Uint8Array(records);
    const table = await tableFromIPC(arrowBuffer);
    records = datafilesArrowTableToJson(table);
  }

  if (!Array.isArray(records)) {
    throw new TypeError(`Dataset ${datasetId} has an invalid datafiles manifest`);
  }

  return records;
};

export const findPatientCases = async (
  datasets,
  patientId,
  config = {}
) => {
  const normalizedPatientId = normalizePatientId(patientId);
  if (!normalizedPatientId) {
    throw new TypeError("Patient case search requires a nonblank patient ID");
  }

  const configuredDatasets = Array.isArray(datasets) ? datasets : [];
  const searchCacheKey = JSON.stringify([
    normalizedPatientId,
    configuredDatasets.map((dataset) => [
      dataset?.id ?? null,
      dataset?.datafilesPath ?? null,
    ]),
  ]);
  if (patientCaseSearchCache.has(searchCacheKey)) {
    return patientCaseSearchCache.get(searchCacheKey);
  }

  const datasetLoads = await Promise.allSettled(
    configuredDatasets.map(async (dataset) => {
      const datasetId = normalizeNonEmptyString(dataset?.id);
      if (!datasetId) {
        throw new TypeError("Patient case search requires a dataset ID");
      }

      const records = await loadDatasetDatafiles(dataset, config);
      return records
        .filter(
          (record) =>
            record?.visible !== false &&
            normalizePatientId(record?.patient_id) === normalizedPatientId
        )
        .map((record) => ({
          ...record,
          datasetId,
        }));
    })
  );
  const successfulLoads = datasetLoads
    .filter(({ status }) => status === "fulfilled")
    .map(({ value }) => value);
  const failedLoads = datasetLoads.filter(({ status }) => status === "rejected");

  if (successfulLoads.length === 0 && failedLoads.length > 0) {
    throw failedLoads[0].reason;
  }
  if (failedLoads.length > 0) {
    console.warn(
      `Patient case search skipped ${failedLoads.length} unavailable dataset manifest(s)`
    );
  }

  const result = {
    cases: combinePatientCasePages(successfulLoads),
    failedDatasetCount: failedLoads.length,
  };
  if (failedLoads.length === 0) {
    if (patientCaseSearchCache.size >= MAX_PATIENT_SEARCH_CACHE_ENTRIES) {
      patientCaseSearchCache.delete(patientCaseSearchCache.keys().next().value);
    }
    patientCaseSearchCache.set(searchCacheKey, result);
  }
  return result;
};
