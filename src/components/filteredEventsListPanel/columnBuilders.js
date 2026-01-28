import React from "react";
import * as d3 from "d3";
import { getColumnRenderer } from "./columnRegistry";
import SliderFilterDropdown from "./SliderFilterDropdown";

/**
 * resolvePath
 * Safely access nested object properties using dot notation
 * e.g. resolvePath(record, "AlphaMissense.score")
 */
function resolvePath(obj, path) {
  if (!path || !obj) return undefined;
  // Handle if path is already an array of keys (AntD style)
  const keys = Array.isArray(path) ? path : path.split(".");
  return keys.reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

/**
 * buildFilters
 * Dynamically generate filter options from record data
 */
function buildFilters(records, dataIndex, filterType = "string") {
  if (!records.length) return [];

  const values = [...new Set(records.map((d) => resolvePath(d, dataIndex)))];
  
  if (filterType === "numeric") {
    return values
      .filter((v) => v != null && !isNaN(v))
      .sort((a, b) => a - b)
      .map((v) => ({
        text: v,
        value: v,
      }));
  }

  if (filterType === "object") {
    // For object types, filter by class property if available
    const classValues = [
      ...new Set(
        records
          .map((d) => {
            const obj = resolvePath(d, dataIndex);
            return obj && obj.class ? obj.class : null;
          })
          .filter((v) => v != null)
      ),
    ];
    return classValues.sort((a, b) => d3.ascending(a, b)).map((v) => ({
      text: v,
      value: v,
    }));
  }

  return values
    .filter((v) => v != null)
    .sort((a, b) => d3.ascending(a, b))
    .map((v) => ({
      text: v,
      value: v,
    }));
}

/**
 * buildSorter
 * Create a sorter function for a numeric or string field
 */
function buildSorter(dataIndex, dataType = "string") {
  return {
    compare: (a, b) => {
      const aVal = resolvePath(a, dataIndex);
      const bVal = resolvePath(b, dataIndex);

      if (aVal == null) return 1;
      if (bVal == null) return -1;

      if (dataType === "numeric") {
        return d3.ascending(+aVal, +bVal);
      }

      if (dataType === "object") {
        // Sort by score first (if available), then by class
        const aScore = aVal?.score;
        const bScore = bVal?.score;
        const aHasScore = aScore !== undefined && aScore !== null;
        const bHasScore = bScore !== undefined && bScore !== null;
        
        // Both have scores: sort by score descending
        if (aHasScore && bHasScore) {
          const scoreComp = d3.ascending(+bScore, +aScore); // descending
          if (scoreComp !== 0) return scoreComp;
        }
        // One has score: score comes first
        else if (aHasScore) return -1;
        else if (bHasScore) return 1;
        
        // Neither has score or scores are equal: sort by class
        const aClass = aVal?.class || "";
        const bClass = bVal?.class || "";
        return d3.ascending(aClass, bClass);
      }

      return d3.ascending(aVal, bVal);
    },
  };
}

/**
 * buildFilter
 * Create a filter function for a column
 */
function buildFilter(dataIndex, filterType = "string") {
  if (filterType === "numeric") {
    return (value, record) => +resolvePath(record, dataIndex) === +value;
  }

  if (filterType === "object") {
    return (value, record) => {
      const obj = resolvePath(record, dataIndex);
      return obj && obj.class === value;
    };
  }

  if (filterType === "string-startsWith") {
    return (value, record) => resolvePath(record, dataIndex)?.startsWith(value);
  }

  if (filterType === "range") {
    return (value, record) => {
      const [minVal, maxVal] = value.split(",").map(Number);
      const recordVal = +resolvePath(record, dataIndex);
      if (isNaN(recordVal)) return false;
      return recordVal >= minVal && recordVal <= maxVal;
    };
  }

  // Default string equality
  return (value, record) => resolvePath(record, dataIndex) === value;
}

function computeRangeBounds(records, dataIndex) {
  const values = records
    .map((d) => resolvePath(d, dataIndex))
    .filter((v) => v != null && !isNaN(v))
    .map(Number);
  if (values.length === 0) return { min: 0, max: 1, step: 0.1 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const step = range > 100 ? 1 : range > 10 ? 0.1 : 0.01;
  return { min, max, step };
}

/**
 * buildColumnConfig
 * 
 * Constructs a complete Ant Design column config from settings metadata
 * and a renderer component.
 * 
 * @param {Object} columnDef - Column definition from settings.json
 * @param {Array} records - Data records for filter generation
 * @param {Object} rendererProps - Additional props to pass to the renderer, plus t() function
 * @returns {Object} Complete Ant Design column config
 */
export function buildColumnConfig(columnDef, records, rendererProps = {}, filteredValue = null) {
  const {
    id,
    title,
    dataIndex,
    viewType = "string-basic",
    type = "string",
    width = 120,
    filterable = false,
    sortable = false,
    filterType = type === "numeric" ? "numeric" : type === "object" ? "object" : "string",
    filterSearch = false,
    ellipsis = false,
    rendererProps: columnRendererProps = {},
    fields,
  } = columnDef;

  // Extract the t function from rendererProps (if provided by component)
  const { t, ...otherProps } = rendererProps;
  
  // Translate title if t function is available and title is a key
  const translatedTitle = t && typeof title === "string" && title.includes(".")
    ? t(title)
    : title;

  // Get the renderer component
  const RendererComponent = getColumnRenderer(viewType);

  // Merge renderer-specific props with general props
  const mergedRendererProps = { ...otherProps, ...columnRendererProps };

  // Build base column config
  const columnConfig = {
    title: translatedTitle,
    dataIndex,
    key: id,
    width,
    ellipsis:
      ellipsis && type !== "numeric"
        ? { showTitle: false }
        : ellipsis
        ? true
        : false,
    render: (_, record) => {
      const additionalFieldValues = Array.isArray(fields)
        ? fields.reduce((acc, key) => ({ ...acc, [key]: resolvePath(record, key) }), {})
        : undefined;

      return (
        <RendererComponent
          value={resolvePath(record, dataIndex)}
          record={record}
          additionalFieldValues={additionalFieldValues}
          {...mergedRendererProps}
        />
      );
    },
  };

  // Add filters if enabled
  if (filterable && records && records.length > 0) {
    if (filterType === "range") {
      const { min, max, step } = computeRangeBounds(records, dataIndex);
      columnConfig.filterDropdown = (props) => (
        <SliderFilterDropdown {...props} min={min} max={max} step={step} />
      );
      columnConfig.onFilter = buildFilter(dataIndex, filterType);
    } else {
      columnConfig.filters = buildFilters(records, dataIndex, filterType);
      columnConfig.filterMultiple = true;
      columnConfig.onFilter = buildFilter(dataIndex, filterType);
      if (filterSearch) {
        columnConfig.filterSearch = true;
      }
    }
    // Apply controlled filteredValue if provided (enables programmatic filter reset)
    if (filteredValue !== null) {
      columnConfig.filteredValue = filteredValue;
    }
  }

  // Add sorter if enabled
  if (sortable) {
    columnConfig.sorter = buildSorter(dataIndex, type);
  }

  return columnConfig;
}

/**
 * buildColumnsFromSettings
 * 
 * Build all column configs from settings and dataset definitions
 * 
 * @param {Array} settingsColumns - Column definitions from settings.json
 * @param {Array} datasetColumns - Optional column definitions from dataset
 * @param {Array} records - Data records for filter generation
 * @param {Object} rendererProps - Props to pass to all renderers
 * @returns {Array} Array of complete Ant Design column configs
 */
export function buildColumnsFromSettings(
  settingsColumns = [],
  datasetColumns = [],
  records = [],
  rendererProps = {},
  filterValues = {}
) {
  // Merge settings and dataset columns, dataset takes precedence
  const allColumns = [...settingsColumns];
  const settingsIds = new Set(settingsColumns.map((c) => c.id));

  datasetColumns.forEach((col) => {
    if (settingsIds.has(col.id)) {
      // Override/merge with dataset definition
      const idx = allColumns.findIndex((c) => c.id === col.id);
      allColumns[idx] = { ...allColumns[idx], ...col };
    } else {
      // Add new dataset column
      allColumns.push(col);
    }
  });

  // Build column configs
  return allColumns.map((columnDef) =>
    buildColumnConfig(columnDef, records, rendererProps, filterValues[columnDef.id] ?? null)
  );
}
