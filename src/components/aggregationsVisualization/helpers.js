import { parseDriverGenes } from "../../helpers/geneAggregations";
import { measureText } from "../../helpers/utility";

export const margins = {
  gapX: 34,
  gapY: 24,
  gapYBottom: 60,
  gapLegend: 0,
  tooltipGap: 5,
};

const BASE_MARGIN_X = 34;
const BASE_MARGIN_Y_BOTTOM = 60;
const FONT_SIZE = 10;
const ROTATION_ANGLE = 45; // degrees for rotated labels

/**
 * Calculate dynamic margins based on axis label widths.
 * Measures the actual text width of axis labels and adjusts margins to prevent cutoff.
 * @param {Array} categories - Array of category labels (strings)
 * @param {boolean} isXAxisRotated - Whether X-axis labels are rotated 45 degrees
 * @param {boolean} isYAxisCategorical - Whether Y-axis has categorical labels
 * @returns {object} Adjusted margins object
 */
export function calculateDynamicMargins(categories = [], isXAxisRotated = false, isYAxisCategorical = false) {
  const adjustedMargins = { ...margins };

  // Calculate Y-axis margin (left side) for categorical Y-axis labels
  if (isYAxisCategorical && categories.length > 0) {
    const longestYLabel = categories.reduce((longest, cat) => {
      const catStr = String(cat);
      return catStr.length > longest.length ? catStr : longest;
    }, "");
    
    const yLabelWidth = measureText(longestYLabel, FONT_SIZE);
    const minYMargin = Math.ceil(yLabelWidth) + 20; // Add padding
    adjustedMargins.gapX = Math.max(BASE_MARGIN_X, minYMargin);
  }

  // Calculate X-axis margin (bottom) for rotated categorical X-axis labels
  if (isXAxisRotated && categories.length > 0) {
    const longestXLabel = categories.reduce((longest, cat) => {
      const catStr = String(cat);
      return catStr.length > longest.length ? catStr : longest;
    }, "");
    
    const xLabelWidth = measureText(longestXLabel, FONT_SIZE);
    const xLabelHeight = FONT_SIZE;
    
    // For 45-degree rotation: effective height = width*sin(45°) + height*cos(45°)
    const radians = (ROTATION_ANGLE * Math.PI) / 180;
    const rotatedHeight = Math.ceil(xLabelWidth * Math.sin(radians) + xLabelHeight * Math.cos(radians));
    const minXMargin = rotatedHeight + 20; // Add padding
    adjustedMargins.gapYBottom = Math.max(BASE_MARGIN_Y_BOTTOM, minXMargin);
  }

  return adjustedMargins;
}

export const MIN_BAR_WIDTH = 30;
export const MIN_CATEGORY_WIDTH = 40;
export const MAX_COLOR_CATEGORIES = 10;

export const parseAlterationSummary = (summary) => {
  if (!summary || typeof summary !== "string") {
    return [];
  }
  const lines = summary.split("\n");
  const types = [];
  lines.forEach((line) => {
    const match = line.match(/^([^:]+):/);
    if (match) {
      const typeNormalized = match[1].toLowerCase().replace(/\s+/g, "_");
      if (!types.includes(typeNormalized)) {
        types.push(typeNormalized);
      }
    }
  });
  return types;
};

export const numericColumns = [
  { key: "sv_count", dataIndex: "sv_count", label: "SV Count", type: "numeric" },
  { key: "tmb", dataIndex: "tmb", label: "TMB", type: "numeric" },
  { key: "tumor_median_coverage", dataIndex: "tumor_median_coverage", label: "Tumor Coverage", type: "numeric" },
  { key: "normal_median_coverage", dataIndex: "normal_median_coverage", label: "Normal Coverage", type: "numeric" },
  { key: "purity", dataIndex: "purity", label: "Purity", type: "numeric" },
  { key: "ploidy", dataIndex: "ploidy", label: "Ploidy", type: "numeric" },
  { key: "hrd.hrd_score", dataIndex: "hrd.hrd_score", label: "HRDetect", type: "numeric" },
  { key: "hrd.b1_2_score", dataIndex: "hrd.b1_2_score", label: "B1+2", type: "numeric" },
  { key: "hrd.b1_score", dataIndex: "hrd.b1_score", label: "B1", type: "numeric" },
  { key: "hrd.b2_score", dataIndex: "hrd.b2_score", label: "B2", type: "numeric" },
];

export const categoricalColumns = [
  { key: "disease", dataIndex: "disease", label: "Disease", type: "categorical" },
  { key: "primary_site", dataIndex: "primary_site", label: "Primary Site", type: "categorical" },
  { key: "tumor_type", dataIndex: "tumor_type", label: "Tumor Type", type: "categorical" },
  { key: "inferred_sex", dataIndex: "inferred_sex", label: "Inferred Sex", type: "categorical" },
  { key: "qcEvaluation", dataIndex: "qcEvaluation", label: "QC Evaluation", type: "categorical" },
  { key: "alteration_type", dataIndex: "alteration_type", label: "Alteration Type", type: "categorical" },
  { key: "driver_gene", dataIndex: "driver_gene", label: "Driver Genes", type: "categorical" },
];

export const pairColumn = { key: "pair", dataIndex: "pair", label: "Pair", type: "pair" };

export const allColumns = [...numericColumns, ...categoricalColumns, pairColumn];

/**
 * Opens a case report in a new browser tab with proper dataset context.
 * @param {string} pair - The case/pair ID to open
 * @param {object} dataset - The dataset object containing the id
 */
export const openCaseInNewTab = (pair, dataset) => {
  if (!pair) return;
  const url = new URL(window.location.pathname, window.location.origin);
  url.searchParams.set("report", pair);
  if (dataset?.id) {
    url.searchParams.set("dataset", dataset.id);
  }
  window.open(url.toString(), "_blank");
};

export const getColumnType = (dataIndex) => {
  const col = allColumns.find((c) => c.dataIndex === dataIndex);
  return col?.type || "numeric";
};

export const getColumnLabel = (dataIndex) => {
  const col = allColumns.find((c) => c.dataIndex === dataIndex);
  return col?.label || dataIndex;
};

export const getValue = (record, path) => {
  if (path === "alteration_type") {
    return parseAlterationSummary(record.summary);
  }
  if (path === "driver_gene") {
    return parseDriverGenes(record.summary).map((g) => g.gene);
  }
  return path.split(".").reduce((obj, key) => obj?.[key], record);
};
