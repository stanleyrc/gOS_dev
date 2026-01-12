/**
 * Factory functions for creating Konva shapes in KonvaScatter
 */
import Konva from 'konva';
import {
  STAR_NUM_POINTS,
  STAR_INNER_RADIUS_RATIO,
  STAR_OUTER_RADIUS_RATIO,
  HOLLOW_STROKE_WIDTH,
  HOLLOW_FILL,
  ERROR_BAR_CAP_WIDTH,
  ERROR_BAR_STROKE_WIDTH,
} from './constants';

/**
 * Create a Konva shape (circle, star, or square) for a data point.
 *
 * @param {Object} config - Shape configuration
 * @param {string} config.shapeType - 'circle', 'star', or 'square'
 * @param {number} config.x - Screen X position
 * @param {number} config.y - Screen Y position
 * @param {number} config.radius - Shape radius
 * @param {string} config.fill - Fill color
 * @param {boolean} config.isHollow - Whether to render as hollow (stroke only)
 * @param {string} [config.stroke] - Optional stroke color
 * @param {number} [config.strokeWidth] - Optional stroke width
 * @returns {Konva.Shape} The created Konva shape
 */
export const createShape = (config) => {
  const { shapeType, x, y, radius, fill, isHollow, stroke, strokeWidth } = config;

  // For hollow points, use transparent fill with colored stroke
  const shapeConfig = isHollow
    ? { stroke: fill, strokeWidth: HOLLOW_STROKE_WIDTH, fill: HOLLOW_FILL }
    : { fill };

  // Add optional stroke/strokeWidth (for selection or hover highlight)
  if (stroke !== undefined) {
    shapeConfig.stroke = stroke;
  }
  if (strokeWidth !== undefined) {
    shapeConfig.strokeWidth = strokeWidth;
  }

  let shape;

  if (shapeType === 'star') {
    shape = new Konva.Star({
      x,
      y,
      numPoints: STAR_NUM_POINTS,
      innerRadius: radius * STAR_INNER_RADIUS_RATIO,
      outerRadius: radius * STAR_OUTER_RADIUS_RATIO,
      ...shapeConfig,
    });
  } else if (shapeType === 'square') {
    const size = radius * 2;
    shape = new Konva.Rect({
      x: x - radius,
      y: y - radius,
      width: size,
      height: size,
      ...shapeConfig,
    });
  } else {
    // Default: circle
    shape = new Konva.Circle({
      x,
      y,
      radius,
      ...shapeConfig,
    });
  }

  return shape;
};

/**
 * Create an error bar group for a data point.
 * Handles cases where only lower, only upper, or both bounds are available.
 *
 * @param {Object} config - Error bar configuration
 * @param {number} config.screenX - Screen X position
 * @param {number} config.screenY - Screen Y position of the point
 * @param {number|null} config.yLower - Screen Y of lower bound (null if unavailable)
 * @param {number|null} config.yUpper - Screen Y of upper bound (null if unavailable)
 * @param {string} config.stroke - Stroke color
 * @returns {Konva.Group|null} The error bar group, or null if no bounds available
 */
export const createErrorBarGroup = (config) => {
  const { screenX, screenY, yLower, yUpper, stroke } = config;

  const hasLower = yLower != null && !isNaN(yLower);
  const hasUpper = yUpper != null && !isNaN(yUpper);

  if (!hasLower && !hasUpper) {
    return null;
  }

  const errorBarGroup = new Konva.Group();

  // Draw vertical line from point to available bound(s)
  if (hasLower && hasUpper) {
    // Full interval
    errorBarGroup.add(new Konva.Line({
      points: [screenX, yLower, screenX, yUpper],
      stroke,
      strokeWidth: ERROR_BAR_STROKE_WIDTH,
    }));
  } else if (hasLower) {
    // Only lower bound - draw from point down
    errorBarGroup.add(new Konva.Line({
      points: [screenX, screenY, screenX, yLower],
      stroke,
      strokeWidth: ERROR_BAR_STROKE_WIDTH,
    }));
  } else if (hasUpper) {
    // Only upper bound - draw from point up
    errorBarGroup.add(new Konva.Line({
      points: [screenX, screenY, screenX, yUpper],
      stroke,
      strokeWidth: ERROR_BAR_STROKE_WIDTH,
    }));
  }

  // Draw caps for available bounds
  if (hasLower) {
    errorBarGroup.add(new Konva.Line({
      points: [screenX - ERROR_BAR_CAP_WIDTH, yLower, screenX + ERROR_BAR_CAP_WIDTH, yLower],
      stroke,
      strokeWidth: ERROR_BAR_STROKE_WIDTH,
    }));
  }

  if (hasUpper) {
    errorBarGroup.add(new Konva.Line({
      points: [screenX - ERROR_BAR_CAP_WIDTH, yUpper, screenX + ERROR_BAR_CAP_WIDTH, yUpper],
      stroke,
      strokeWidth: ERROR_BAR_STROKE_WIDTH,
    }));
  }

  return errorBarGroup;
};

/**
 * Create a connecting line between points (dashed line for hover effect).
 *
 * @param {Object} config - Line configuration
 * @param {string} config.stroke - Stroke color
 * @param {number} config.strokeWidth - Stroke width
 * @param {Array} config.dash - Dash pattern [dashLength, gapLength]
 * @returns {Konva.Line} The connecting line
 */
export const createConnectingLine = (config) => {
  const { stroke, strokeWidth, dash } = config;
  return new Konva.Line({
    stroke,
    strokeWidth,
    dash,
  });
};
