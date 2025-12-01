import React from "react";
import * as d3 from "d3";
import { getColumnRenderer } from "./columnRegistry";

/**
 * buildFilters
 * Dynamically generate filter options from record data
 */
function buildFilters(records, dataIndex, filterType = "string") {
  if (!records.length) return [];

  const values = [...new Set(records.map((d) => d[dataIndex]))];
  
  if (filterType === "numeric") {
    return values
      .filter((v) => v != null && !isNaN(v))
      .sort((a, b) => a - b)
      .map((v) => ({
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
      const aVal = a[dataIndex];
      const bVal = b[dataIndex];

      if (aVal == null) return 1;
      if (bVal == null) return -1;

      if (dataType === "numeric") {
        return d3.ascending(+aVal, +bVal);
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
    return (value, record) => +record[dataIndex] === +value;
  }

  if (filterType === "string-startsWith") {
    return (value, record) => record[dataIndex]?.startsWith(value);
  }

  // Default string equality
  return (value, record) => record[dataIndex] === value;
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
export function buildColumnConfig(columnDef, records, rendererProps = {}) {
  const {
    id,
    title,
    dataIndex,
    viewType = "string-basic",
    type = "string",
    width = 120,
    filterable = false,
    sortable = false,
    filterType = type === "numeric" ? "numeric" : "string",
    ellipsis = false,
    rendererProps: columnRendererProps = {},
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
    render: (_, record) => (
      <RendererComponent
        value={record[dataIndex]}
        record={record}
        {...mergedRendererProps}
      />
    ),
  };

  // Add filters if enabled
  if (filterable && records && records.length > 0) {
    columnConfig.filters = buildFilters(records, dataIndex, filterType);
    columnConfig.filterMultiple = true;
    columnConfig.onFilter = buildFilter(dataIndex, filterType);
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
  rendererProps = {}
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
    buildColumnConfig(columnDef, records, rendererProps)
  );
}
