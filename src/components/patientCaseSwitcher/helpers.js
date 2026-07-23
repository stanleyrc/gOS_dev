const ISO_DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const compareText = (left, right) => {
  const leftText = `${left ?? ""}`;
  const rightText = `${right ?? ""}`;
  return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
};

const normalizeNonEmptyString = (value) => {
  if (typeof value !== "string") return null;
  return value.trim() || null;
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
    if (left.specimenDate && !right.specimenDate) return -1;
    if (!left.specimenDate && right.specimenDate) return 1;
    if (left.specimenDate && right.specimenDate) {
      const dateOrder = compareText(right.specimenDate, left.specimenDate);
      if (dateOrder !== 0) return dateOrder;
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
