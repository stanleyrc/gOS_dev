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

/**
 * Tokenize a boolean gene expression string.
 * Tokens: AND, OR, NOT, (, ), and gene names (alphanumeric + hyphen/underscore)
 */
function tokenizeGeneExpression(expression) {
  const tokens = [];
  const regex = /\s*(AND|OR|NOT|\(|\)|[A-Za-z0-9_-]+)\s*/gi;
  let match;
  while ((match = regex.exec(expression)) !== null) {
    const token = match[1];
    const upper = token.toUpperCase();
    if (upper === "AND" || upper === "OR" || upper === "NOT") {
      tokens.push({ type: upper });
    } else if (token === "(") {
      tokens.push({ type: "LPAREN" });
    } else if (token === ")") {
      tokens.push({ type: "RPAREN" });
    } else {
      tokens.push({ type: "GENE", name: token.toUpperCase() });
    }
  }
  return tokens;
}

/**
 * Parse a boolean gene expression into an AST.
 * Grammar:
 *   expr     -> orExpr
 *   orExpr   -> andExpr (OR andExpr)*
 *   andExpr  -> notExpr (AND notExpr)*
 *   notExpr  -> NOT notExpr | primary
 *   primary  -> GENE | LPAREN expr RPAREN
 */
export function parseGeneExpression(expression) {
  if (!expression || typeof expression !== "string") {
    return null;
  }
  const tokens = tokenizeGeneExpression(expression);
  if (tokens.length === 0) {
    return null;
  }
  let pos = 0;

  function peek() {
    return tokens[pos] || null;
  }

  function consume(expectedType) {
    const token = tokens[pos];
    if (!token || token.type !== expectedType) {
      throw new Error(`Expected ${expectedType} at position ${pos}`);
    }
    pos++;
    return token;
  }

  function parseExpr() {
    return parseOrExpr();
  }

  function parseOrExpr() {
    let left = parseAndExpr();
    while (peek() && peek().type === "OR") {
      consume("OR");
      const right = parseAndExpr();
      left = { type: "OR", left, right };
    }
    return left;
  }

  function parseAndExpr() {
    let left = parseNotExpr();
    while (peek() && peek().type === "AND") {
      consume("AND");
      const right = parseNotExpr();
      left = { type: "AND", left, right };
    }
    return left;
  }

  function parseNotExpr() {
    if (peek() && peek().type === "NOT") {
      consume("NOT");
      const operand = parseNotExpr();
      return { type: "NOT", operand };
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const token = peek();
    if (!token) {
      throw new Error("Unexpected end of expression");
    }
    if (token.type === "GENE") {
      consume("GENE");
      return { type: "GENE", name: token.name };
    }
    if (token.type === "LPAREN") {
      consume("LPAREN");
      const expr = parseExpr();
      consume("RPAREN");
      return expr;
    }
    throw new Error(`Unexpected token: ${token.type}`);
  }

  const ast = parseExpr();
  if (pos < tokens.length) {
    throw new Error(`Unexpected token at position ${pos}`);
  }
  return ast;
}

/**
 * Evaluate a parsed gene expression AST against a set of genes.
 * @param {object} ast - The AST from parseGeneExpression
 * @param {Set<string>|Array<string>} genes - Genes present in the record (uppercase)
 * @returns {boolean}
 */
export function evaluateGeneExpression(ast, genes) {
  if (!ast) return false;
  const geneSet = genes instanceof Set ? genes : new Set((genes || []).map(g => g.toUpperCase()));

  function evaluate(node) {
    switch (node.type) {
      case "GENE":
        return geneSet.has(node.name);
      case "AND":
        return evaluate(node.left) && evaluate(node.right);
      case "OR":
        return evaluate(node.left) || evaluate(node.right);
      case "NOT":
        return !evaluate(node.operand);
      default:
        return false;
    }
  }

  return evaluate(ast);
}

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

export const getColumnType = (dataIndex, dynamicColumns = null) => {
  if (dynamicColumns) {
    const col = dynamicColumns.allColumns.find((c) => c.dataIndex === dataIndex);
    return col?.type || "numeric";
  }
  const col = allColumns.find((c) => c.dataIndex === dataIndex);
  return col?.type || "numeric";
};

export const getColumnLabel = (dataIndex) => {
  const col = allColumns.find((c) => c.dataIndex === dataIndex);
  return col?.label || dataIndex;
};

export const getValue = (record, path, dynamicColumns = null) => {
  if (path === "alteration_type") {
    return parseAlterationSummary(record.summary);
  }
  if (path === "driver_gene") {
    return parseDriverGenes(record.summary).map((g) => g.gene);
  }
  
  const value = path.split(".").reduce((obj, key) => obj?.[key], record);
  
  // If dynamicColumns provided, check if this is an object type attribute
  // and flatten to array of keys where value > 0 (boolean treatment)
  if (dynamicColumns) {
    const col = dynamicColumns.allColumns.find((c) => c.dataIndex === path);
    if (col?.type === 'object' && value && typeof value === 'object') {
      return Object.keys(value).filter((k) => {
        const v = value[k];
        return typeof v === 'number' && v > 0;
      });
    }
  }
  
  return value;
};

// ============================================================================
// Dynamic Attribute Discovery (Phase 1)
// ============================================================================

// Attributes to exclude from dropdowns
const EXCLUDED_ATTRIBUTES = ['visible', 'summary'];

// Attributes that are derived/computed (not direct properties)
const DERIVED_ATTRIBUTES = [
  { key: 'alteration_type', dataIndex: 'alteration_type', label: 'Alteration Type', type: 'categorical' },
  { key: 'driver_gene', dataIndex: 'driver_gene', label: 'Driver Genes', type: 'categorical' },
];

/**
 * Convert snake_case or camelCase to Title Case label
 */
export function formatAttributeLabel(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Determine the type of an attribute value
 * @returns 'numeric' | 'categorical' | 'object' | 'pair' | null
 */
export function inferAttributeType(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && !isNaN(value)) return 'numeric';
  if (typeof value === 'string') return 'categorical';
  if (typeof value === 'object' && !Array.isArray(value)) return 'object';
  return null;
}

/**
 * Discover all attributes from records and classify them
 * @param {Array} records - Array of data records
 * @returns {Object} { numericColumns, categoricalColumns, objectColumns, pairColumn, allColumns }
 */
export function discoverAttributes(records) {
  if (!records || records.length === 0) {
    return {
      numericColumns: [],
      categoricalColumns: DERIVED_ATTRIBUTES.filter(d => d.type === 'categorical'),
      objectColumns: [],
      pairColumn: { key: 'pair', dataIndex: 'pair', label: 'Pair', type: 'pair' },
      allColumns: DERIVED_ATTRIBUTES,
    };
  }

  const attributeTypes = new Map();
  const objectKeys = new Map(); // For object attributes, track their sub-keys

  // Sample all records to discover attributes
  records.forEach((record) => {
    Object.keys(record).forEach((key) => {
      if (EXCLUDED_ATTRIBUTES.includes(key)) return;
      if (key === 'pair') return; // Handle separately

      const value = record[key];
      const type = inferAttributeType(value);
      
      if (!type) return;

      const existingType = attributeTypes.get(key);
      if (!existingType) {
        attributeTypes.set(key, type);
        if (type === 'object') {
          objectKeys.set(key, new Set(Object.keys(value || {})));
        }
      } else if (type === 'object' && existingType === 'object') {
        // Merge object keys
        const existing = objectKeys.get(key) || new Set();
        Object.keys(value || {}).forEach((k) => existing.add(k));
        objectKeys.set(key, existing);
      }
    });
  });

  const numericColumns = [];
  const categoricalColumns = [];
  const objectColumns = [];

  attributeTypes.forEach((type, key) => {
    const column = {
      key,
      dataIndex: key,
      label: formatAttributeLabel(key),
      type,
    };

    if (type === 'numeric') {
      numericColumns.push(column);
    } else if (type === 'categorical') {
      categoricalColumns.push(column);
    } else if (type === 'object') {
      column.subKeys = Array.from(objectKeys.get(key) || []).sort();
      objectColumns.push(column);
    }
  });

  // Sort columns alphabetically by label
  numericColumns.sort((a, b) => a.label.localeCompare(b.label));
  categoricalColumns.sort((a, b) => a.label.localeCompare(b.label));
  objectColumns.sort((a, b) => a.label.localeCompare(b.label));

  // Add derived attributes to categorical
  DERIVED_ATTRIBUTES.forEach((derived) => {
    if (!categoricalColumns.find((c) => c.key === derived.key)) {
      categoricalColumns.push(derived);
    }
  });

  const pairColumn = { key: 'pair', dataIndex: 'pair', label: 'Pair', type: 'pair' };
  const allColumns = [...numericColumns, ...categoricalColumns, ...objectColumns, pairColumn];

  return {
    numericColumns,
    categoricalColumns,
    objectColumns,
    pairColumn,
    allColumns,
  };
}
