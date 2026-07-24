const ISO_DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const compareDateText = (left, right) => {
  const leftText = `${left ?? ""}`;
  const rightText = `${right ?? ""}`;
  return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
};

const isLeapYear = (year) =>
  year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);

export const parseIsoDateOnly = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const match = ISO_DATE_ONLY_PATTERN.exec(trimmed);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return null;

  const daysInMonth =
    month === 2 && isLeapYear(year) ? 29 : DAYS_PER_MONTH[month - 1];
  return day <= daysInMonth ? trimmed : null;
};

export const parseSpecimenDate = (value) => {
  if (typeof value !== "string") return null;
  const parts = value
    .trim()
    .split("/")
    .map((part) => part.trim());

  if (parts.length === 1) {
    const date = parseIsoDateOnly(parts[0]);
    return date
      ? { start: date, end: null, sortKey: date, label: date }
      : null;
  }

  if (parts.length === 2) {
    const start = parseIsoDateOnly(parts[0]);
    const end = parseIsoDateOnly(parts[1]);
    if (!start || !end || compareDateText(start, end) > 0) return null;

    return {
      start,
      end,
      sortKey: start,
      label: `${start} to ${end}`,
    };
  }

  return null;
};

export const formatSpecimenDate = (specimenDate) => {
  if (typeof specimenDate === "string") return specimenDate;
  return specimenDate?.label || null;
};

export const specimenDateSortKey = (specimenDate) =>
  typeof specimenDate === "string"
    ? specimenDate
    : specimenDate?.sortKey || specimenDate?.start || null;

export const specimenDateEndKey = (specimenDate) =>
  typeof specimenDate === "string" ? null : specimenDate?.end || null;

const normalizeDateInput = (value) => {
  if (typeof value === "string") return parseIsoDateOnly(value);
  return null;
};

export const normalizeSpecimenDateRangeFilter = (value) => {
  if (value == null) return null;

  const fromValue = Array.isArray(value) ? value[0] : value.from;
  const toValue = Array.isArray(value) ? value[1] : value.to;
  const from = normalizeDateInput(fromValue);
  const to = normalizeDateInput(toValue);
  if (!from && !to) return null;

  return {
    from,
    to,
    invalid: Boolean(from && to && compareDateText(from, to) > 0),
  };
};

export const specimenDateMatchesRangeFilter = (value, filterValue) => {
  const range = normalizeSpecimenDateRangeFilter(filterValue);
  if (!range || range.invalid) return false;

  const specimenDate = parseSpecimenDate(value);
  if (!specimenDate) return false;

  const specimenStart = specimenDate.start;
  const specimenEnd = specimenDate.end || specimenDate.start;

  if (range.from && compareDateText(specimenEnd, range.from) < 0) {
    return false;
  }
  if (range.to && compareDateText(specimenStart, range.to) > 0) {
    return false;
  }
  return true;
};

export const getSpecimenDateExtent = (values = []) => {
  const starts = [];
  const ends = [];

  values.forEach((value) => {
    const specimenDate = parseSpecimenDate(value);
    if (!specimenDate) return;
    starts.push(specimenDate.start);
    ends.push(specimenDate.end || specimenDate.start);
  });

  if (starts.length === 0 || ends.length === 0) return [undefined, undefined];
  starts.sort(compareDateText);
  ends.sort(compareDateText);
  return [starts[0], ends[ends.length - 1]];
};
