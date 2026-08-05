import * as d3 from "d3";
import {
  defaultSearchFilters,
  getValueByPath,
  orderListViewFilters,
} from "./utility";
import { reportFilters } from "./filters";
import {
  datasetHasField,
  getSourceScopedFieldValue,
  sourceCaseIdentityKey,
  sourceDatasetHasField,
} from "./browseScope";
import {
  normalizeSpecimenDateRangeFilter,
  specimenDateMatchesRangeFilter,
} from "./specimenDate";

export const emptyInterpretationSummary = () => ({
  all: new Set(),
  withTierChange: new Set(),
  byAuthor: new Map(),
  byGene: new Map(),
});

const nonEmptyFilterEntries = (searchFilters = {}) =>
  Object.entries(searchFilters).filter(
    ([key, value]) =>
      key !== "page" &&
      key !== "per_page" &&
      key !== "orderId" &&
      key !== "operator" &&
      !key.endsWith("-operator") &&
      value !== null &&
      value !== undefined &&
      value !== "" &&
      !(Array.isArray(value) && value.length === 0),
  );

const normalizeValues = (value) => (Array.isArray(value) ? value : [value]);

const recordMatchesSelection = (recordValue, selectedValue) => {
  if (selectedValue === "null") return recordValue == null;

  const recordValues = normalizeValues(recordValue);
  return normalizeValues(selectedValue).some((value) =>
    recordValues.includes(value),
  );
};

const buildInterpretationIdResolver = (records) => {
  const sourceIds = new Set(
    records.map((record) => record.caseReportId).filter(Boolean),
  );
  const pairCounts = records.reduce((counts, record) => {
    if (record.pair) counts.set(record.pair, (counts.get(record.pair) || 0) + 1);
    return counts;
  }, new Map());

  return (record = {}) => {
    const canonicalId = record.caseReportId || record.pair;
    const ids = canonicalId ? [canonicalId] : [];
    if (
      record.pair &&
      record.pair !== canonicalId &&
      !sourceIds.has(record.pair) &&
      pairCounts.get(record.pair) === 1
    ) {
      ids.push(record.pair);
    }
    return ids;
  };
};

const interpretationRecordKey = (record) =>
  sourceCaseIdentityKey(record) ||
  JSON.stringify([record.caseReportId || record.pair]);

export const applyExternalFilters = (
  records,
  searchFilters,
  casesWithInterpretations = emptyInterpretationSummary(),
) => {
  const selectedValues = searchFilters?.has_interpretations;
  if (!Array.isArray(selectedValues) || selectedValues.length === 0) {
    return records;
  }

  const operator = (
    searchFilters["has_interpretations-operator"] || "OR"
  ).toUpperCase();
  const interpretationIdsForRecord = buildInterpretationIdResolver(records);
  const interpretationSetHasRecord = (set, record) =>
    interpretationIdsForRecord(record).some((caseId) => set?.has(caseId));
  const matchingSets = selectedValues.map((value) => {
    const path = Array.isArray(value) ? value : [value];
    const category = path[0];
    const specificValue = path.length > 1 ? path[1] : null;
    const matchingRecords = new Set();

    records.forEach((record) => {
      const hasAnyInterpretation = interpretationSetHasRecord(
        casesWithInterpretations.all,
        record,
      );
      const hasTierChange = interpretationSetHasRecord(
        casesWithInterpretations.withTierChange,
        record,
      );
      if (category === "tier_change" && hasTierChange) {
        matchingRecords.add(interpretationRecordKey(record));
      } else if (
        category === "other_changes" &&
        hasAnyInterpretation &&
        !hasTierChange
      ) {
        matchingRecords.add(interpretationRecordKey(record));
      } else if (
        category === "author" &&
        specificValue &&
        interpretationSetHasRecord(
          casesWithInterpretations.byAuthor?.get(specificValue),
          record,
        )
      ) {
        matchingRecords.add(interpretationRecordKey(record));
      } else if (
        category === "gene" &&
        specificValue &&
        interpretationSetHasRecord(
          casesWithInterpretations.byGene?.get(specificValue),
          record,
        )
      ) {
        matchingRecords.add(interpretationRecordKey(record));
      } else if (category === "without" && !hasAnyInterpretation) {
        matchingRecords.add(interpretationRecordKey(record));
      }
    });

    return matchingRecords;
  });

  if (operator === "AND") {
    return records.filter((record) =>
      matchingSets.every((set) => set.has(interpretationRecordKey(record))),
    );
  }

  const union = new Set();
  matchingSets.forEach((set) => set.forEach((key) => union.add(key)));
  return records.filter((record) =>
    operator === "NOT"
      ? !union.has(interpretationRecordKey(record))
      : union.has(interpretationRecordKey(record)),
  );
};

const compareNullable = (left, right, sort) => {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return sort === "ascending"
    ? d3.ascending(left, right)
    : d3.descending(left, right);
};

export const filterCaseReportRecords = (
  sourceRecords = [],
  searchFilters = {},
  fields = [],
  externalData = {},
) => {
  let records = sourceRecords.filter((record) => record.visible !== false);
  records = applyExternalFilters(
    records,
    searchFilters,
    externalData.casesWithInterpretations,
  );
  const hasFieldContext =
    externalData.dataset != null || (externalData.datasets || []).length > 0;
  const recordHasField = (record, field) =>
    !hasFieldContext ||
    (datasetHasField(externalData.dataset, field) &&
      sourceDatasetHasField(
        record,
        externalData.datasets,
        field,
        externalData.dataset,
      ));
  const recordFieldValue = (record, field) =>
    hasFieldContext
      ? recordHasField(record, field)
        ? getSourceScopedFieldValue(
            record,
            externalData.datasets,
            field,
            externalData.dataset,
          )
        : undefined
      : getValueByPath(record, field);

  nonEmptyFilterEntries(searchFilters).forEach(([key, selectedValue]) => {
    const fallbackFilter = reportFilters().find((filter) => filter.name === key);
    const field = fields.find((candidate) => candidate.name === key);
    const renderer = field?.renderer || fallbackFilter?.renderer;

    if (fallbackFilter?.external || field?.external) return;

    if (key === "texts") {
      const searchText = `${selectedValue}`.toLowerCase();
      const searchableFields = fields.filter(
        (candidate) => candidate.renderer === "select",
      );
      records = records.filter((record) =>
        searchableFields
          .map((candidate) => recordFieldValue(record, candidate.name) ?? "")
          .flat()
          .join(",")
          .toLowerCase()
          .includes(searchText),
      );
      return;
    }

    if (renderer === "date-range") {
      const range = normalizeSpecimenDateRangeFilter(selectedValue);
      if (!range) return;
      records = records.filter(
        (record) =>
          recordHasField(record, key) &&
          specimenDateMatchesRangeFilter(recordFieldValue(record, key), range),
      );
      return;
    }

    if (renderer === "slider" && Array.isArray(selectedValue)) {
      records = records.filter((record) => {
        if (!recordHasField(record, key)) return false;
        const value = recordFieldValue(record, key);
        return (
          value == null ||
          (value >= selectedValue[0] && value <= selectedValue[1])
        );
      });
      return;
    }

    if (renderer === "select") {
      const selectedValues = normalizeValues(selectedValue);
      records = records.filter(
        (record) =>
          recordHasField(record, key) &&
          selectedValues.some((item) =>
            recordMatchesSelection(recordFieldValue(record, key), item),
          ),
      );
      return;
    }

    if (renderer === "cascader") {
      const selectedValues = normalizeValues(selectedValue);
      const operator = (searchFilters.operator || "OR").toUpperCase();
      const matches = (record, item) =>
        recordHasField(record, key) &&
        recordMatchesSelection(recordFieldValue(record, key), item);

      records = records.filter((record) => {
        if (operator === "AND") {
          return selectedValues.every((item) => matches(record, item));
        }
        if (operator === "NOT") {
          return selectedValues.every((item) => !matches(record, item));
        }
        return selectedValues.some((item) => matches(record, item));
      });
    }
  });

  const orderId = searchFilters.orderId || defaultSearchFilters().orderId;
  const ordering =
    orderListViewFilters.find((entry) => entry.id === orderId) ||
    orderListViewFilters[0];

  return records.sort((left, right) => {
    const orderingValue = (record) =>
      ordering.attribute === "pair"
        ? getValueByPath(record, ordering.attribute)
        : recordFieldValue(record, ordering.attribute);
    const result = compareNullable(
      orderingValue(left),
      orderingValue(right),
      ordering.sort,
    );
    if (result !== 0) return result;
    return d3.ascending(
      sourceCaseIdentityKey(left) || left.pair,
      sourceCaseIdentityKey(right) || right.pair,
    );
  });
};

export const searchCaseReportRecords = (
  records,
  searchFilters,
  fields,
  externalData,
) => {
  const matchedRecords = filterCaseReportRecords(
    records,
    searchFilters,
    fields,
    externalData,
  );
  const page = searchFilters?.page || defaultSearchFilters().page;
  const perPage =
    searchFilters?.per_page || defaultSearchFilters().per_page;

  return {
    matchedRecords,
    pageRecords: matchedRecords.slice((page - 1) * perPage, page * perPage),
  };
};

export const buildPopulationMaps = (
  records = [],
  kpiFields = [],
  fieldContext = {},
) => {
  const populations = {};
  const hasFieldContext =
    fieldContext.dataset != null || (fieldContext.datasets || []).length > 0;

  kpiFields.forEach((field) => {
    populations[field.id] = records
      .map((record) => ({
        pair: record.pair,
        datasetId: record.datasetId,
        caseReportId: record.caseReportId,
        value: hasFieldContext
          ? getSourceScopedFieldValue(
              record,
              fieldContext.datasets,
              field.id,
              fieldContext.dataset,
            )
          : getValueByPath(record, field.id),
        tumor_type: hasFieldContext
          ? getSourceScopedFieldValue(
              record,
              fieldContext.datasets,
              "tumor_type",
              fieldContext.dataset,
            )
          : record.tumor_type,
      }))
      .filter((item) => item.value != null && !isNaN(item.value));
  });

  return populations;
};

let localSearchSequence = 0;

export const createLocalSearchId = () => {
  localSearchSequence += 1;
  return `local-search-${Date.now()}-${localSearchSequence}`;
};
