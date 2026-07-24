import {
  formatSpecimenDate,
  parseSpecimenDate,
  specimenDateEndKey,
  specimenDateSortKey,
} from "../../helpers/specimenDate";

export { formatSpecimenDate, parseSpecimenDate };

const compareText = (left, right) => {
  const leftText = `${left ?? ""}`;
  const rightText = `${right ?? ""}`;
  return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
};

const normalizeNonEmptyString = (value) => {
  if (typeof value !== "string") return null;
  return value.trim() || null;
};

export const normalizePatientId = normalizeNonEmptyString;

export const patientCaseIdentityKey = (identity = {}) =>
  JSON.stringify([identity?.datasetId ?? null, identity?.caseReportId ?? null]);

export const isSamePatientCase = (left, right) =>
  Boolean(
    left &&
      right &&
      left.datasetId === right.datasetId &&
      left.caseReportId === right.caseReportId,
  );

export const normalizePatientCase = (record = {}) => {
  const datasetId = normalizeNonEmptyString(record.datasetId);
  const caseReportId = normalizeNonEmptyString(record.caseReportId);
  if (!datasetId || !caseReportId) return null;

  return {
    identity: { datasetId, caseReportId },
    pair: normalizeNonEmptyString(record.pair) || caseReportId,
    specimenDate: parseSpecimenDate(record.specimen_date),
  };
};

export const sortPatientCases = (cases = []) =>
  [...cases].sort((left, right) => {
    const leftDate = specimenDateSortKey(left.specimenDate);
    const rightDate = specimenDateSortKey(right.specimenDate);
    if (leftDate && !rightDate) return -1;
    if (!leftDate && rightDate) return 1;
    if (leftDate && rightDate) {
      const dateOrder = compareText(rightDate, leftDate);
      if (dateOrder !== 0) return dateOrder;

      const endOrder = compareText(
        specimenDateEndKey(right.specimenDate),
        specimenDateEndKey(left.specimenDate),
      );
      if (endOrder !== 0) return endOrder;
    }
    return (
      compareText(left.pair, right.pair) ||
      compareText(left.identity.datasetId, right.identity.datasetId) ||
      compareText(left.identity.caseReportId, right.identity.caseReportId)
    );
  });

export const findPatientCases = (records = [], patientId) => {
  const normalizedPatientId = normalizePatientId(patientId);
  if (!normalizedPatientId) return [];

  const casesByIdentity = new Map();
  records
    .filter(
      (record) =>
        record.visible !== false &&
        normalizePatientId(record.patient_id) === normalizedPatientId,
    )
    .forEach((record) => {
      const patientCase = normalizePatientCase(record);
      if (!patientCase) return;
      const key = patientCaseIdentityKey(patientCase.identity);
      if (!casesByIdentity.has(key)) casesByIdentity.set(key, patientCase);
    });

  return sortPatientCases(Array.from(casesByIdentity.values()));
};
