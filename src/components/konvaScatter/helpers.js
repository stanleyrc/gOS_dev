/**
 * Helper utilities for KonvaScatter component
 */
import * as d3 from 'd3';

/**
 * Normalize an accessor to always return a function.
 * Handles function, string (property name), or null cases.
 *
 * @param {Function|string} accessor - The accessor to normalize
 * @returns {Function} A function that extracts the value from a data point
 */
export const normalizeAccessor = (accessor) => {
  if (typeof accessor === 'function') return accessor;
  if (typeof accessor === 'string') return (d) => d[accessor];
  return () => null;
};

/**
 * Normalize a numeric accessor to always return a function.
 * Handles function, number (constant), or missing cases.
 *
 * @param {Function|number} accessor - The accessor to normalize
 * @param {number} defaultValue - Default value if accessor is not provided
 * @returns {Function} A function that returns a numeric value
 */
export const normalizeNumericAccessor = (accessor, defaultValue) => {
  if (typeof accessor === 'function') return accessor;
  if (typeof accessor === 'number') return () => accessor;
  return () => defaultValue;
};

/**
 * Compare two d3 scales to determine if they've changed.
 * Compares domain and range arrays.
 *
 * @param {Object} prevScale - Previous scale
 * @param {Object} nextScale - Next scale
 * @returns {boolean} True if scales are different
 */
export const scalesChanged = (prevScale, nextScale) => {
  if (prevScale === nextScale) return false;
  if (!prevScale || !nextScale) return true;

  const prevDomain = prevScale.domain?.();
  const nextDomain = nextScale.domain?.();
  const prevRange = prevScale.range?.();
  const nextRange = nextScale.range?.();

  if (!prevDomain || !nextDomain || !prevRange || !nextRange) return true;

  return (
    prevDomain.length !== nextDomain.length ||
    prevRange.length !== nextRange.length ||
    prevDomain.some((v, i) => v !== nextDomain[i]) ||
    prevRange.some((v, i) => v !== nextRange[i])
  );
};

/**
 * Create scales for the scatter plot.
 * Uses provided scales or creates new d3 linear scales.
 *
 * @param {Object} params - Parameters
 * @param {number} params.width - Plot width
 * @param {number} params.height - Plot height
 * @param {Array} params.data - Data points
 * @param {Function|string} params.xAccessor - X value accessor
 * @param {Function|string} params.yAccessor - Y value accessor
 * @param {Object} params.xScale - Optional provided x scale
 * @param {Object} params.yScale - Optional provided y scale
 * @returns {Object} Object with xScale, yScale, getX, getY
 */
export const createScales = (params) => {
  const { width, height, data, xAccessor, yAccessor, xScale, yScale } = params;

  const getX = normalizeAccessor(xAccessor);
  const getY = normalizeAccessor(yAccessor);

  const finalXScale =
    xScale ||
    d3
      .scaleLinear()
      .domain(d3.extent(data, getX))
      .range([0, width])
      .nice();

  const finalYScale =
    yScale ||
    d3
      .scaleLinear()
      .domain(d3.extent(data, getY))
      .range([height, 0])
      .nice();

  return { xScale: finalXScale, yScale: finalYScale, getX, getY };
};

/**
 * Save node's original stroke state for later restoration.
 *
 * @param {Konva.Shape} node - The Konva shape node
 */
export const saveStrokeState = (node) => {
  node._originalStroke = node.stroke();
  node._originalStrokeWidth = node.strokeWidth();
};

/**
 * Restore node's stroke state from saved values.
 *
 * @param {Konva.Shape} node - The Konva shape node
 */
export const restoreStrokeState = (node) => {
  node.stroke(node._originalStroke ?? null);
  node.strokeWidth(node._originalStrokeWidth ?? 0);
};
